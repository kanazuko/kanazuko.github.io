import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { graph, metaRequest } from '../supabase/functions/_shared/instagram.ts'
import { createInstagramLedger } from './helpers/instagram-ledger.js'

const admin = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const user = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const account = '17841465479111585'

test('Meta gateway persists shared pauses, respects Retry-After and never exposes provider secrets', async t => {
  const original = { fetch: globalThis.fetch, Deno: globalThis.Deno }
  const ledger = createInstagramLedger()
  let status = 429, code = 4, retryAfter = '120', calls = 0
  globalThis.Deno = { env: { get: key => ({ SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service', INSTAGRAM_ACCESS_TOKEN: 'private-token' })[key] } }
  globalThis.fetch = async (input, options) => {
    const url = new URL(input)
    const response = await ledger.fetch(url, options)
    if (response) return response
    assert.equal(url.origin, 'https://graph.facebook.com'); calls++
    return Response.json({ error: { code, error_subcode: 99, fbtrace_id: 'safe_trace-123', message: 'private-token', error_user_msg: 'secret' } }, { status, headers: { 'Retry-After': retryAfter } })
  }
  const context = { actor_id: admin }
  try {
    await t.test('429 pauses discovery and writes across separate requests', async () => {
      await assert.rejects(graph('me/assigned_instagram_accounts?fields=id,username', context), /INSTAGRAM_RATE_LIMIT/)
      const event = ledger.events.at(-1)
      assert.equal(event.p_retry_seconds, 120); assert.equal(event.p_http_status, 429)
      assert.equal(event.p_meta_code, 4); assert.equal(event.p_meta_subcode, 99); assert.equal(event.p_trace, 'safe_trace-123')
      await assert.rejects(metaRequest(`${account}/media`, context, { image_url: 'https://test.invalid/image.jpg' }), /INSTAGRAM_ACCOUNT_PAUSED/)
      await assert.rejects(graph(`${account}/content_publishing_limit`, context), /INSTAGRAM_ACCOUNT_PAUSED/)
      assert.equal(calls, 1)
      assert.equal(JSON.stringify(ledger.events).includes('private-token'), false)
      assert.equal(JSON.stringify(ledger.events).includes('image_url'), false)
    })
    await t.test('401, 403 and account restrictions block all subsequent operations', async () => {
      for (const [http, metaCode, expected] of [[401, 190, 'INSTAGRAM_TOKEN_INVALID'], [403, 200, 'INSTAGRAM_PERMISSION_DENIED'], [400, 368, 'INSTAGRAM_ACCOUNT_RESTRICTED']]) {
        ledger.clearPause(); status = http; code = metaCode
        await assert.rejects(graph(`${account}?fields=id`, context), new RegExp(expected))
        const before = calls
        await assert.rejects(graph('me/assigned_instagram_accounts', { actor_id: user }), new RegExp(expected))
        assert.equal(calls, before)
      }
    })
    await t.test('Retry-After HTTP dates are retained and malformed values use the minimum pause', async () => {
      ledger.clearPause(); status = 503; code = 999; retryAfter = new Date(Date.now() + 180000).toUTCString()
      await assert.rejects(graph(`${account}?fields=id`, context), /INSTAGRAM_TEMPORARY_ERROR/)
      assert.ok(ledger.events.at(-1).p_retry_seconds >= 179)
      ledger.clearPause(); retryAfter = 'invalid'
      await assert.rejects(graph(`${account}?fields=id`, context), /INSTAGRAM_TEMPORARY_ERROR/)
      assert.equal(ledger.events.at(-1).p_retry_seconds, 0)
      await assert.rejects(graph(`${account}?fields=id`, context), /INSTAGRAM_ACCOUNT_PAUSED/)
    })
    await t.test('an unavailable audit database fails closed before any Meta call', async () => {
      globalThis.fetch = async input => {
        assert.equal(new URL(input).origin, 'https://test.supabase.co')
        return Response.json({}, { status: 503 })
      }
      await assert.rejects(graph(`${account}?fields=id`, context), /INSTAGRAM_SCHEMA_INCOMPATIBLE/)
    })
  } finally { globalThis.fetch = original.fetch; globalThis.Deno = original.Deno }
})

test('additive SQL safety migration preserves publications, enforces RLS and shares durable account blocks', async () => {
  const db = new PGlite()
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
      CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      CREATE TABLE storage.objects(id uuid, bucket_id text); ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;`)
    for (const name of ['20261026214609_initial_schema.sql', '20261104120000_instagram_drafts.sql', '20261105010000_instagram_publish_progress.sql']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'))
    }
    await db.query('INSERT INTO auth.users VALUES ($1), ($2)', [admin, user])
    await db.query('INSERT INTO admin_users(user_id) VALUES ($1)', [admin])
    await db.query(`INSERT INTO instagram_posts(id, created_by, mode, product_ids, image_ids, products, images, caption, template, status, instagram_id, instagram_url)
      VALUES ($1, $1, 'single', ARRAY[$1::uuid], ARRAY[$1::uuid], '[]', '[]', 'Historical caption', '', 'published', '12345', 'https://www.instagram.com/p/existing/')`, [admin])
    const historical = (await db.query('SELECT * FROM instagram_posts')).rows
    await db.exec(await readFile(new URL('../supabase/migrations/20261107010000_instagram_safety_and_audit.sql', import.meta.url), 'utf8'))
    assert.deepEqual((await db.query('SELECT * FROM instagram_posts')).rows, historical)
    const asRole = (role, uid, sql, args = []) => db.transaction(async tx => {
      await tx.exec(`SET LOCAL ROLE ${role}`)
      await tx.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [uid])
      return tx.query(sql, args)
    })
    const beginSql = "SELECT public.begin_instagram_request($1,$2,NULL,NULL,NULL,'poll_container','12345','GET') AS result"
    const begin = async (actor = admin) => (await asRole('service_role', '', beginSql, [actor, account])).rows[0].result
    const finish = (id, error, seconds = 0) => asRole('service_role', '',
      'SELECT public.finish_instagram_request($1,$2,429,4,NULL,NULL,NULL,$3,NULL)', [id, error, seconds])
    await assert.rejects(asRole('anon', '', beginSql, [admin, account]), /permission denied/)
    await assert.rejects(asRole('authenticated', admin, beginSql, [admin, account]), /permission denied/)
    await assert.rejects(begin(user), /ADMIN_REQUIRED/)
    const first = await begin()
    assert.match(first.id, /^[a-f0-9-]{36}$/)
    await finish(first.id, 'INSTAGRAM_RATE_LIMIT', 120)
    assert.equal((await begin()).error_code, 'INSTAGRAM_ACCOUNT_PAUSED')
    await asRole('authenticated', admin, 'SELECT public.resume_instagram_account($1)', [account])
    assert.equal((await begin()).error_code, 'INSTAGRAM_ACCOUNT_PAUSED') // Explicit resume cannot bypass Retry-After.
    await db.query('UPDATE instagram_account_safety SET paused_until = NULL WHERE account_id=$1', [account])
    const second = await begin()
    await finish(second.id, 'INSTAGRAM_TOKEN_INVALID')
    assert.equal((await begin()).error_code, 'INSTAGRAM_TOKEN_INVALID')
    await assert.rejects(finish(second.id, null), /AUDIT_CONFLICT/)
    await assert.rejects(asRole('authenticated', user, 'SELECT public.resume_instagram_account($1)', [account]), /ADMIN_REQUIRED/)
    await asRole('authenticated', admin, 'SELECT public.resume_instagram_account($1)', [account])
    assert.ok((await begin()).id)
    assert.equal((await asRole('authenticated', user, 'SELECT * FROM instagram_events')).rows.length, 0)
    assert.equal((await asRole('authenticated', user, 'SELECT * FROM instagram_account_safety')).rows.length, 0)
    assert.ok((await asRole('authenticated', admin, 'SELECT * FROM instagram_events')).rows.length >= 3)
    await assert.rejects(asRole('authenticated', admin, "INSERT INTO instagram_events(actor_id, operation) VALUES ($1, 'forged')", [admin]), /permission denied/)
    await assert.rejects(asRole('authenticated', admin, 'UPDATE instagram_events SET error_code=NULL'), /permission denied/)
    await assert.rejects(asRole('authenticated', admin, 'DELETE FROM instagram_events'), /permission denied/)
    await assert.rejects(asRole('service_role', '', 'DELETE FROM instagram_events'), /permission denied/)
    assert.deepEqual((await db.query('SELECT * FROM instagram_posts')).rows, historical)
  } finally { await db.close() }
})
