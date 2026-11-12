import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { graph, metaRequest, instagramAccountId as account, acknowledgeInstagramWrite } from '../supabase/functions/_shared/instagram.ts'
import { adminId, userId, postIds, attemptIds, instagramDb, sqlRpc } from './helpers/instagram-db.js'

test('protocol v2: persistent account exclusion with real SQL and simulated Meta', async t => {
  let historicalPosts, historicalEvents
  const db = await instagramDb(async db => {
    await db.query(`INSERT INTO instagram_posts(id,created_by,mode,product_ids,image_ids,products,images,caption,template,status,instagram_id,instagram_url)
      VALUES ('55555555-5555-4555-8555-555555555555',$1,'single',ARRAY[$1::uuid],ARRAY[$1::uuid],'[]','[]','Untouched historical publication','','published','999','https://www.instagram.com/p/history/')`, [adminId])
    await db.query("INSERT INTO instagram_events(actor_id,account_id,operation,method,finished_at,remote_id) VALUES ($1,$2,'historical','GET',now(),'999')", [adminId, account])
    historicalPosts = (await db.query('SELECT to_jsonb(p) AS row FROM instagram_posts p ORDER BY id')).rows
    historicalEvents = (await db.query('SELECT to_jsonb(e) AS row FROM instagram_events e ORDER BY id')).rows
  })
  const original = { fetch: globalThis.fetch, Deno: globalThis.Deno }
  globalThis.Deno = { env: { get: key => ({ SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-service', INSTAGRAM_ACCESS_TOKEN: 'test-meta-token' })[key] } }
  const rpc = sqlRpc(db)
  let metaCalls = 0, failFinish = false, remote = async () => Response.json({ id: '123456' })
  globalThis.fetch = async (input, options) => {
    const url = new URL(input)
    if (url.origin === 'https://test.supabase.co') {
      if (failFinish && url.pathname.endsWith('/finish_instagram_request')) return Response.json({}, { status: 503 })
      return rpc(url, options)
    }
    assert.equal(url.origin, 'https://graph.facebook.com'); metaCalls++
    return remote(url, options)
  }
  const context = index => ({ actor_id: adminId, post_id: postIds[index], revision: 1, attempt_id: attemptIds[index] })
  const begin = async (method = 'GET', index = 0, suffix = '') => (await db.query(`SELECT public.begin_instagram_request($1,$2,$3,1,$4,$5,$6,$7) AS result`,
    [adminId, account + suffix, postIds[index], attemptIds[index], method === 'POST' ? 'create_container' : 'poll_container', '123456', method])).rows[0].result
  const finish = async (id, error = null, remoteId = null) => db.query('SELECT public.finish_instagram_request($1,$2,200,NULL,NULL,NULL,$3,120,NULL)', [id, error, remoteId])
  const asAdmin = (sql, args = [], uid = adminId) => db.transaction(async tx => {
    await tx.exec('SET LOCAL ROLE authenticated')
    await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [uid])
    return tx.query(sql, args)
  })
  try {
    await t.test('migration preserves every historical post/event field and starts in maintenance', async () => {
      assert.deepEqual((await db.query('SELECT to_jsonb(p) AS row FROM instagram_posts p ORDER BY id')).rows, historicalPosts)
      assert.deepEqual((await db.query("SELECT to_jsonb(e) - 'resolution' AS row FROM instagram_events e ORDER BY id")).rows, historicalEvents)
      const before = metaCalls
      await assert.rejects(graph('me/assigned_instagram_accounts', context(0)), /INSTAGRAM_MAINTENANCE/)
      assert.equal(metaCalls, before)
      assert.equal((await begin()).error_code, 'INSTAGRAM_MAINTENANCE')
    })
    await t.test('remote schema inspection script executes in a read-only transaction without modifying history', async () => {
      const before = (await db.query('SELECT to_jsonb(e) AS value FROM instagram_events e ORDER BY id')).rows
      await db.exec(await readFile(new URL('../scripts/check-instagram-schema.sql', import.meta.url), 'utf8'))
      assert.deepEqual((await db.query('SELECT to_jsonb(e) AS value FROM instagram_events e ORDER BY id')).rows, before)
    })
    await t.test('health attestations are bound to release epoch; maintenance cannot be lifted early', async () => {
      await assert.rejects(asAdmin('SELECT public.set_instagram_maintenance(false)'), /BACKENDS_NOT_VERIFIED/)
      for (const name of ['instagram-status','instagram-prepare','instagram-publish']) await db.query('SELECT public.register_instagram_backend($1,2)', [name])
      await asAdmin('SELECT public.set_instagram_maintenance(true,true)')
      assert.equal((await db.query('SELECT public.instagram_runtime_status() AS state')).rows[0].state.frontend_ready, true)
      await asAdmin('SELECT public.set_instagram_maintenance(false)')
    })
    await t.test('simultaneous publications from different drafts share one persistent account reservation', async () => {
      let release, entered
      const waiting = new Promise(resolve => { release = resolve })
      const ready = new Promise(resolve => { entered = resolve })
      remote = async () => { entered(); await waiting; return Response.json({ id: '123456' }) }
      const first = metaRequest(`${account}/media`, context(0), { image_url: 'https://test.invalid/fake.jpg' })
      await ready
      const before = metaCalls
      await assert.rejects(metaRequest(`${account}/media`, context(1), { image_url: 'https://test.invalid/other.jpg' }), /INSTAGRAM_ACCOUNT_BUSY/)
      assert.equal(metaCalls, before)
      release(); await first
      await assert.rejects(metaRequest(`${account}/media_publish`, context(1), { creation_id: '999' }), /INSTAGRAM_WRITE_UNRESOLVED/)
      await acknowledgeInstagramWrite(context(0))
      assert.ok((await db.query('SELECT pending_write_id FROM instagram_account_safety WHERE account_id=$1', [account])).rows[0].pending_write_id)
      await db.query('UPDATE instagram_posts SET container_id=$1 WHERE id=$2', ['123456', postIds[0]])
      await acknowledgeInstagramWrite(context(0))
      assert.equal((await db.query('SELECT pending_write_id FROM instagram_account_safety WHERE account_id=$1', [account])).rows[0].pending_write_id, null)
      remote = async () => Response.json({ status_code: 'FINISHED' })
    })
    await t.test('429 with failed PostgreSQL finalization blocks subsequent writes', async () => {
      remote = async () => Response.json({ error: { code: 4 } }, { status: 429, headers: { 'Retry-After': '3600' } })
      failFinish = true
      await assert.rejects(graph(`${account}?fields=id`, context(0)), /DATABASE_UNAVAILABLE/)
      failFinish = false
      const before = metaCalls
      await assert.rejects(metaRequest(`${account}/media`, context(1), { image_url: 'https://test.invalid/fake.jpg' }), /INSTAGRAM_ACCOUNT_BUSY/)
      assert.equal(metaCalls, before)
      const request = (await db.query('SELECT active_request_id FROM instagram_account_safety WHERE account_id=$1', [account])).rows[0].active_request_id
      await finish(request, 'INSTAGRAM_RATE_LIMIT') // Safe replay of SQL finalization only; no Meta retry.
      assert.equal((await begin()).error_code, 'INSTAGRAM_ACCOUNT_PAUSED')
      const pause = (await db.query('SELECT paused_until > now() AS paused FROM instagram_account_safety WHERE account_id=$1', [account])).rows[0].paused
      assert.equal(pause, true)
      await db.query('UPDATE instagram_account_safety SET paused_until=NULL WHERE account_id=$1', [account]) // Local fixture time travel.
    })
    await t.test('legacy working checkpoints without a safe read classification block other drafts', async () => {
      await db.query(`UPDATE instagram_posts SET publish_progress='{"phase":"working"}' WHERE id=$1`, [postIds[1]])
      assert.equal((await begin('POST', 0)).error_code, 'INSTAGRAM_WRITE_UNRESOLVED')
      await db.query("UPDATE instagram_posts SET publish_progress='{}' WHERE id=$1", [postIds[1]])
    })
    await t.test('abandoned reads need explicit recovery; unknown restrictions continue to block writes', async () => {
      const { id } = await begin()
      await assert.rejects(asAdmin('SELECT public.recover_instagram_read($1)', [id]), /MANUAL_REVIEW_REQUIRED/)
      await db.query("UPDATE instagram_events SET started_at=now()-interval '11 minutes' WHERE id=$1", [id])
      await assert.rejects(asAdmin('SELECT public.recover_instagram_read($1)', [id], userId), /ADMIN_REQUIRED/)
      await asAdmin('SELECT public.recover_instagram_read($1)', [id])
      assert.equal((await begin('POST', 1)).error_code, 'INSTAGRAM_AUDIT_UNRESOLVED')
      remote = async () => Response.json({ status_code: 'FINISHED' })
      await graph(`${account}?fields=status_code`, context(0))
      await assert.rejects(finish(id), /AUDIT_CONFLICT/) // A late worker cannot overwrite the recovery.
      await assert.rejects(asAdmin("SELECT public.resolve_instagram_read_hold($1,now()+interval '1 hour')", [account]), /MAINTENANCE_REQUIRED/)
    })
    await t.test('a timed-out write is never unlocked by age or admin resume; GET diagnosis remains possible', async () => {
      // A separate account models an independent fixture without clearing audit history.
      const { id } = await begin('POST', 1, '9')
      await db.query("UPDATE instagram_events SET started_at=now()-interval '11 minutes' WHERE id=$1", [id])
      assert.equal((await begin('POST', 0, '9')).error_code, 'INSTAGRAM_ACCOUNT_BUSY')
      const diagnostic = await begin('GET', 1, '9')
      assert.ok(diagnostic.id); await finish(diagnostic.id)
      await asAdmin('SELECT public.resume_instagram_account($1)', [account + '9'])
      assert.equal((await begin('POST', 0, '9')).error_code, 'INSTAGRAM_WRITE_UNRESOLVED')
      await assert.rejects(asAdmin('SELECT public.recover_instagram_read($1)', [id]), /MANUAL_REVIEW_REQUIRED/)
    })
    await t.test('a timeout after a simulated POST leaves a durable unknown-write latch for every draft', async () => {
      await db.query('UPDATE instagram_account_safety SET audit_hold=false WHERE account_id=$1', [account]) // Independent local fixture.
      remote = async () => { throw new DOMException('Simulated timeout after sending', 'TimeoutError') }
      const before = metaCalls
      await assert.rejects(metaRequest(`${account}/media_publish`, context(1), { creation_id: '123456' }), /CONNECTION_UNAVAILABLE/)
      assert.equal(metaCalls, before + 1)
      await db.query('UPDATE instagram_account_safety SET paused_until=NULL WHERE account_id=$1', [account]) // Local time travel.
      await assert.rejects(metaRequest(`${account}/media_publish`, context(0), { creation_id: '123456' }), /INSTAGRAM_WRITE_UNRESOLVED/)
      assert.equal(metaCalls, before + 1)
      await acknowledgeInstagramWrite(context(1))
      assert.ok((await db.query('SELECT pending_write_id FROM instagram_account_safety WHERE account_id=$1', [account])).rows[0].pending_write_id)
    })
    await t.test('new administrative RPCs reject non-admins and forbid direct browser writes', async () => {
      await assert.rejects(asAdmin('SELECT public.set_instagram_maintenance(true)', [], userId), /ADMIN_REQUIRED/)
      await assert.rejects(asAdmin('UPDATE instagram_runtime_control SET maintenance=false'), /permission denied/)
      await assert.rejects(asAdmin("SELECT public.register_instagram_backend('instagram-status',2)"), /permission denied/)
      await asAdmin('SELECT public.set_instagram_maintenance(true)')
      const status = (await db.query('SELECT public.instagram_runtime_status() AS state')).rows[0].state
      assert.equal(status.frontend_ready, false); assert.equal(status.maintenance, true)
    })
    await t.test('historical publication and original audit fields remain intact after operations and recovery', async () => {
      const originalPost = historicalPosts.find(({ row }) => row.instagram_id === '999')
      assert.deepEqual((await db.query('SELECT to_jsonb(p) AS row FROM instagram_posts p WHERE id=$1', [originalPost.row.id])).rows[0], originalPost)
      assert.deepEqual((await db.query("SELECT to_jsonb(e)-'resolution' AS row FROM instagram_events e WHERE operation='historical' ORDER BY id")).rows, historicalEvents)
    })
  } finally { globalThis.fetch = original.fetch; globalThis.Deno = original.Deno; await db.close() }
})
