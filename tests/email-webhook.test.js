import assert from 'node:assert/strict'
import { test } from 'node:test'

test('optional email webhook authentication, persisted recipient, retries and failure handling', async (t) => {
  const originalFetch = globalThis.fetch
  const originalDeno = globalThis.Deno
  let handler
  const secrets = {
    ORDER_EMAIL_WEBHOOK_SECRET: 'test-webhook-secret', RESEND_API_KEY: 'test-resend-key',
    ORDER_EMAIL_FROM: 'Tienda <pedidos@example.com>', SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-service-role',
  }
  globalThis.Deno = { env: { get: (name) => secrets[name] }, serve: (callback) => { handler = callback } }
  const order = {
    id: '11111111-1111-4111-8111-111111111111', order_number: 42, customer_name: 'Cliente', email: 'guardado@example.com',
    delivery_address: 'Centro', total: 100, email_sent_at: null,
    order_items: [{ id: 'item1', product_name: 'Anillo', quantity: 1, unit_price: 100 }],
  }
  const event = { type: 'INSERT', table: 'orders', schema: 'public', record: { id: order.id, email: 'ignorar@example.com', total: 0 } }
  const request = (body = event, secret = secrets.ORDER_EMAIL_WEBHOOK_SECRET) => new Request('https://function.invalid', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-order-webhook-secret': secret }, body: JSON.stringify(body) })
  const calls = []
  let providerStatus = 200
  try {
    await import('../supabase/functions/order-confirmation/index.ts')
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options })
      if (url === 'https://api.resend.com/emails') return Response.json({ id: 'email-id' }, { status: providerStatus })
      if (options.method === 'PATCH') return new Response(null, { status: 204 })
      return Response.json([order])
    }
    await t.test('unauthenticated and malformed events cannot trigger any network calls', async () => {
      assert.equal((await handler(request(event, 'wrong-secret'))).status, 401)
      assert.equal((await handler(request({ ...event, table: 'products' }))).status, 400)
      assert.equal(calls.length, 0)
    })
    await t.test('sends only persisted values, then records delivery acceptance', async () => {
      assert.equal((await handler(request())).status, 200)
      assert.equal(calls.length, 3)
      const sent = JSON.parse(calls[1].options.body)
      assert.deepEqual(sent.to, [order.email])
      assert.match(sent.text, /100\.00/)
      assert.equal(calls[1].options.headers['Idempotency-Key'], `order-confirmation/${order.id}`)
      assert.equal(calls[2].options.method, 'PATCH')
    })
    await t.test('already-sent receipt does not resend', async () => {
      calls.length = 0
      order.email_sent_at = '2026-10-30T12:00:00Z'
      assert.equal((await handler(request())).status, 200)
      assert.equal(calls.length, 1)
    })
    await t.test('provider failures leave email status unchanged', async () => {
      calls.length = 0
      order.email_sent_at = null
      providerStatus = 429
      assert.equal((await handler(request())).status, 502)
      assert.equal(calls.length, 2)
    })
  } finally {
    globalThis.fetch = originalFetch
    globalThis.Deno = originalDeno
  }
})
