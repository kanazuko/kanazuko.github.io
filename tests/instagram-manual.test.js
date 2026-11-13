import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { normalizeInstagramPostUrl } from '../src/utils/instagramManual.js'

test('manual publication links accept posts and reels, remove tracking, and reject foreign URLs', () => {
  assert.equal(normalizeInstagramPostUrl(' https://instagram.com/p/AbC_123-/?igsh=tracking '), 'https://www.instagram.com/p/AbC_123-/')
  assert.equal(normalizeInstagramPostUrl('https://www.instagram.com/reel/abc'), 'https://www.instagram.com/reel/abc/')
  for (const value of ['', 'javascript:alert(1)', 'http://instagram.com/p/abc/', 'https://instagram.com.evil.test/p/abc/', 'https://evil.test/p/abc/', 'https://user@instagram.com/p/abc/', 'https://instagram.com:444/p/abc/', 'https://instagram.com/account/', 'https://instagram.com/p/abc/other']) assert.throws(() => normalizeInstagramPostUrl(value))
})

test('manual records persist independently of Meta with admin-only access and validated completion', async () => {
  const db = new PGlite()
  const admin = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const user = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const product = '11111111-1111-4111-8111-111111111111'
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
      GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;`)
    for (const file of ['20261026214609_initial_schema.sql', '20261114120000_instagram_manual_posts.sql']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'))
    }
    await db.query('INSERT INTO auth.users VALUES ($1),($2)', [admin, user])
    await db.query('INSERT INTO admin_users(user_id) VALUES ($1)', [admin])
    await db.query("INSERT INTO products(id,name,slug,price) VALUES ($1,'Anillo','anillo',125)", [product])
    const asUser = (uid, sql, params = []) => db.transaction(async tx => {
      await tx.exec('SET LOCAL ROLE authenticated')
      await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [uid])
      return tx.query(sql, params)
    })
    const insert = 'INSERT INTO instagram_manual_posts(product_id,product_name,caption) VALUES ($1,$2,$3) RETURNING *'
    await assert.rejects(asUser(user, insert, [product, 'Anillo', 'Texto']), /row-level security/)
    const saved = (await asUser(admin, insert, [product, 'Anillo', 'Texto editable'])).rows[0]
    assert.equal(saved.completed_at, null)
    assert.equal((await asUser(user, 'SELECT * FROM instagram_manual_posts')).rows.length, 0)
    assert.equal((await asUser(user, "UPDATE instagram_manual_posts SET caption='otro' RETURNING id")).rows.length, 0)
    await assert.rejects(asUser(admin, 'UPDATE instagram_manual_posts SET completed_at=now()'), /check constraint/)
    await assert.rejects(asUser(admin, "UPDATE instagram_manual_posts SET instagram_url='https://evil.test/'"), /check constraint/)
    await assert.rejects(asUser(admin, 'UPDATE instagram_manual_posts SET caption=$1', ['a'.repeat(2201)]), /check constraint/)
    await asUser(admin, "UPDATE instagram_manual_posts SET instagram_url='https://www.instagram.com/p/ABC/',completed_at=now() WHERE id=$1", [saved.id])
    const completed = (await asUser(admin, 'SELECT * FROM instagram_manual_posts')).rows[0]
    assert.ok(completed.completed_at)
    assert.equal(completed.caption, 'Texto editable')
    await assert.rejects(asUser(admin, insert, [product, 'Anillo', 'Duplicado']), /unique constraint/)
    await assert.rejects(db.transaction(async tx => { await tx.exec('SET LOCAL ROLE anon'); return tx.query('SELECT * FROM instagram_manual_posts') }), /permission denied/)
    await db.query('DELETE FROM products WHERE id=$1', [product])
    const historical = (await asUser(admin, 'SELECT * FROM instagram_manual_posts')).rows[0]
    assert.equal(historical.product_id, null)
    assert.equal(historical.product_name, 'Anillo')
    assert.equal(historical.instagram_url, completed.instagram_url)
  } finally { await db.close() }
})
