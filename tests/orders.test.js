import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { cartTotal, normalizeCart, validateCustomer } from '../src/utils/cart.js'
import { orderEmail } from '../supabase/functions/order-confirmation/email.js'

const productId = '11111111-1111-4111-8111-111111111111'
const secondId = '22222222-2222-4222-8222-222222222222'
const adminId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const userId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const customer = { name: 'Cliente de prueba', address: 'Colonia Centro, referencia de prueba', phone: '+52 5512345678', email: 'cliente@example.com' }
const items = [{ product_id: productId, quantity: 2, expected_price: 125.5 }, { product_id: secondId, quantity: 1, expected_price: 80 }]

test('cart restoration, totals, and customer validation', () => {
  assert.deepEqual(normalizeCart(null), [])
  assert.deepEqual(normalizeCart([{ product_id: productId, quantity: 2, price: 0 }, { product_id: productId, quantity: 5 }, { product_id: secondId, quantity: 100 }, { product_id: 'bad', quantity: 1 }]), [{ product_id: productId, quantity: 2 }])
  assert.equal(cartTotal([{ product: { price: 0.1 }, quantity: 3 }, { product: { price: 0.2 }, quantity: 1 }]), 0.5)
  assert.equal(validateCustomer(customer), '')
  for (const change of [{ name: ' ' }, { address: ' ' }, { phone: '1' }, { phone: '5555555<script>' }, { email: 'invalid' }]) assert.notEqual(validateCustomer({ ...customer, ...change }), '')
})

test('email contains the saved receipt and is plain text', () => {
  const mail = orderEmail({ ...customer, customer_name: customer.name, delivery_address: customer.address, order_number: 42, total: 251, order_items: [{ id: productId, product_name: '<Anillo>', quantity: 2, unit_price: 125.5, color: 'Dorado', size: '7' }] })
  assert.deepEqual(mail.to, [customer.email])
  assert.match(mail.subject, /#42/)
  assert.match(mail.text, /2 × <Anillo> \(Dorado \/ 7\)/)
  assert.match(mail.text, /251\.00/)
  assert.equal(mail.html, undefined)
})

test('PostgreSQL order creation and access policies', async (t) => {
  const db = new PGlite()
  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    `)
    await db.exec(await readFile(new URL('../supabase/migrations/20261026214609_initial_schema.sql', import.meta.url), 'utf8'))
    await db.exec(await readFile(new URL('../supabase/migrations/20261030120000_add_catalog_orders.sql', import.meta.url), 'utf8'))
    await db.query('INSERT INTO auth.users(id) VALUES ($1), ($2)', [adminId, userId])
    await db.query('INSERT INTO public.admin_users(user_id) VALUES ($1)', [adminId])
    await db.query(`INSERT INTO public.products(id, name, slug, sku, price, is_published, color, size, availability) VALUES
      ($1, 'Anillo de prueba', 'anillo-prueba', 'AN-01', 125.5, true, 'Dorado', '7', 'available'),
      ($2, 'Collar de prueba', 'collar-prueba', 'CO-01', 80, true, 'Plateado', null, 'made_to_order')`, [productId, secondId])

    async function asRole(role, sql, params = [], uid = '') {
      return db.transaction(async (tx) => {
        await tx.exec(`SET LOCAL ROLE ${role}`)
        await tx.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [uid])
        return tx.query(sql, params)
      })
    }
    const place = async (requestId = randomUUID(), selectedItems = items, details = customer, role = 'anon', uid = '') => {
      const { rows } = await asRole(role, 'SELECT public.place_catalog_order($1, $2::jsonb, $3::jsonb) AS receipt', [requestId, JSON.stringify(details), JSON.stringify(selectedItems)], uid)
      return rows[0].receipt
    }
    let receipt
    let orderId
    const requestId = randomUUID()
    await t.test('guest saves all lines, trusted prices, characteristics, and total', async () => {
      receipt = await place(requestId)
      assert.equal(receipt.total, 331)
      assert.deepEqual(Object.keys(receipt).sort(), ['order_number', 'total'])
      const { rows: [order] } = await db.query('SELECT * FROM orders WHERE request_id = $1', [requestId])
      orderId = order.id
      assert.equal(order.status, 'pending')
      assert.equal(order.customer_name, customer.name)
      const { rows: lines } = await db.query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY product_name', [orderId])
      assert.equal(lines.length, 2)
      assert.equal(lines[0].product_sku, 'AN-01')
      assert.equal(lines[0].color, 'Dorado')
      assert.equal(lines[0].size, '7')
    })
    await t.test('same request retries do not duplicate an order', async () => {
      assert.deepEqual(await place(requestId), receipt)
      const results = await Promise.all([place(requestId), place(requestId)])
      results.forEach((result) => assert.deepEqual(result, receipt))
      const { rows: [{ count }] } = await db.query('SELECT count(*)::int AS count FROM orders WHERE request_id = $1', [requestId])
      assert.equal(count, 1)
      await assert.rejects(place(requestId, items, { ...customer, name: 'Otro cliente' }), /otro pedido/)
    })
    await t.test('invalid lines, contact data, and price tampering roll back the whole order', async () => {
      const before = (await db.query('SELECT count(*)::int AS count FROM orders')).rows[0].count
      for (const badItems of [[], {}, [...items, items[0]], [{ ...items[0], quantity: 0 }], [{ ...items[0], quantity: 100 }], [{ ...items[0], quantity: 1.5 }], [{ ...items[0], expected_price: 1 }], [{ ...items[0], expected_price: null }], [items[0], { ...items[1], product_id: randomUUID() }], Array(51).fill(items[0])]) {
        await assert.rejects(place(randomUUID(), badItems))
      }
      for (const badDetails of [{}, { ...customer, email: 'bad' }, { ...customer, phone: '123' }, { ...customer, name: ' ' }]) await assert.rejects(place(randomUUID(), items, badDetails))
      assert.equal((await db.query('SELECT count(*)::int AS count FROM orders')).rows[0].count, before)
    })
    await t.test('unpublished and out-of-stock products are rejected, made-to-order is allowed', async () => {
      await db.query("UPDATE products SET availability = 'out_of_stock' WHERE id = $1", [secondId])
      await assert.rejects(place(), /no está disponible/)
      await db.query("UPDATE products SET availability = 'made_to_order', is_published = false WHERE id = $1", [secondId])
      await assert.rejects(place(), /no está disponible/)
      await db.query('UPDATE products SET is_published = true WHERE id = $1', [secondId])
      assert.equal((await place()).total, 331)
    })
    await t.test('guests and non-admin users cannot read customer data or write tables directly', async () => {
      await assert.rejects(asRole('anon', 'SELECT * FROM public.orders'), /permission denied/)
      await assert.rejects(asRole('anon', 'SELECT * FROM public.order_items'), /permission denied/)
      assert.equal((await asRole('authenticated', 'SELECT * FROM public.orders', [], userId)).rows.length, 0)
      assert.equal((await asRole('authenticated', 'SELECT * FROM public.order_items', [], userId)).rows.length, 0)
      for (const role of ['anon', 'authenticated']) {
        await assert.rejects(asRole(role, 'INSERT INTO public.orders DEFAULT VALUES', [], userId), /permission denied/)
        await assert.rejects(asRole(role, 'DELETE FROM public.orders', [], userId), /permission denied/)
      }
      const result = await asRole('authenticated', "UPDATE public.orders SET status = 'delivered' RETURNING id", [], userId)
      assert.equal(result.rows.length, 0)
      assert.equal((await place(randomUUID(), items, customer, 'authenticated', userId)).total, 331)
    })
    await t.test('administrators can read orders and only change allowed statuses', async () => {
      assert.ok((await asRole('authenticated', 'SELECT * FROM public.orders', [], adminId)).rows.length > 0)
      assert.equal((await asRole('authenticated', 'SELECT * FROM public.order_items WHERE order_id = $1', [orderId], adminId)).rows.length, 2)
      const changed = await asRole('authenticated', "UPDATE public.orders SET status = 'purchasing' WHERE id = $1 RETURNING status", [orderId], adminId)
      assert.equal(changed.rows[0].status, 'purchasing')
      await assert.rejects(asRole('authenticated', "UPDATE public.orders SET status = 'invalid' WHERE id = $1", [orderId], adminId), /check constraint/)
      await assert.rejects(asRole('authenticated', 'UPDATE public.orders SET total = 0 WHERE id = $1', [orderId], adminId), /permission denied/)
      await assert.rejects(asRole('authenticated', 'UPDATE public.order_items SET unit_price = 0', [], adminId), /permission denied/)
    })
    await t.test('historic lines survive product edits and deletion; retries return original receipt', async () => {
      await db.query("UPDATE products SET price = 500, name = 'Nuevo nombre' WHERE id = $1", [productId])
      await assert.rejects(place(), /precio.*cambió/)
      assert.deepEqual(await place(requestId), receipt)
      await db.query('DELETE FROM products WHERE id = $1', [productId])
      const { rows: [line] } = await db.query('SELECT * FROM order_items WHERE order_id = $1 AND product_sku = $2', [orderId, 'AN-01'])
      assert.equal(line.product_id, null)
      assert.equal(line.product_name, 'Anillo de prueba')
      assert.equal(Number(line.unit_price), 125.5)
      assert.deepEqual(await place(requestId), receipt)
    })
  } finally { await db.close() }
})
