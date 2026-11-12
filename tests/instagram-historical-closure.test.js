import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { instagramDb, adminId, userId, postIds, sqlRpc } from './helpers/instagram-db.js'
import { advancePublication } from '../supabase/functions/instagram-publish/engine.ts'
import { createPublishHandler } from '../supabase/functions/instagram-publish/handler.ts'
import { createPrepareHandler } from '../supabase/functions/instagram-prepare/handler.ts'
import { closureBaseline as baseline, checkBackupIntegrity, validateClosureSnapshot, savePrivateClosureBackup,
  verifyPrivateClosureBackup, verifyClosureAdministrator, classifyClosureOutcome } from '../scripts/historical-closure.mjs'

const template = await readFile(new URL('../scripts/archive-instagram-historical-attempt.sql', import.meta.url), 'utf8')
const snapshotSql = await readFile(new URL('../scripts/instagram-closure-backup.sql', import.meta.url), 'utf8')
const digest = '76a89e0aef8a69018c916d29d50e0f951cf8d421cd3d19e46f8c80587cdc3b79'
const backupSha = 'a'.repeat(64)
const versions = ['20261026214609','20261026215348','20261028120000','20261028130000','20261028140000','20261030120000','20261104120000','20261105010000','20261107010000','20261107020000']
const hash = value => createHash('md5').update(value).digest('hex')
async function fixture() {
  const db = await instagramDb()
  await db.exec('CREATE SCHEMA supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY, name text, statements text[])')
  for (const version of versions) await db.query('INSERT INTO supabase_migrations.schema_migrations VALUES ($1,$2,ARRAY[$3])', [version, 'fixture', 'fixture SQL'])
  await db.query(`UPDATE instagram_posts SET id=$1,publish_attempt_id=$2,mode='carousel',
    image_ids=ARRAY[$1::uuid,$3::uuid],images='[{"id":"a"},{"id":"b"}]',prepared_images='[{"image_id":"a"},{"image_id":"b"}]',
    publish_started_at='2026-11-07T06:26:32.284Z',container_id='17931282783182638',publish_progress=$4::jsonb WHERE id=$5`,
  [baseline.post, baseline.attempt, postIds[1], JSON.stringify({ phase: 'waiting', waiting_child: false, polls: 0, digest, children: ['17931282594182638','17931282639182638'] }), postIds[0]])
  for (let i = 0; i < 16; i++) {
    const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
    await db.query(`INSERT INTO instagram_posts(id,created_by,mode,product_ids,image_ids,products,images,caption,template)
      VALUES ($1,$2,'single',ARRAY[$1::uuid],ARRAY[$1::uuid],'[]','[]','Fixture content','')`, [id, adminId])
  }
  await db.query('UPDATE instagram_runtime_control SET deployment_epoch=$1', [baseline.epoch])
  for (const name of ['instagram-status','instagram-prepare','instagram-publish']) await db.query('SELECT register_instagram_backend($1,2)', [name])
  // Fixture only: restore the exact historical timestamp without a real clock/HTTP.
  await db.exec('ALTER TABLE instagram_posts DISABLE TRIGGER instagram_posts_updated')
  await db.query("UPDATE instagram_posts SET updated_at='2026-11-07T06:28:09.495369Z' WHERE id=$1", [baseline.post])
  await db.exec('ALTER TABLE instagram_posts ENABLE TRIGGER instagram_posts_updated')
  return db
}
async function snapshot(db) {
  // Execute the real backup SELECT in this disposable PostgreSQL, with a real
  // transaction READ ONLY. No remote endpoint or credential is used.
  const select = snapshotSql.slice(snapshotSql.indexOf('SELECT'), snapshotSql.lastIndexOf('ROLLBACK;')).trim()
  await db.exec('BEGIN READ ONLY; SET LOCAL TIME ZONE \'UTC\'')
  try { return (await db.query(select)).rows[0].closure_backup } finally { await db.exec('ROLLBACK') }
}
function fixtureSql(before, actor = adminId) {
  // Test-only substitution of synthetic row hashes. Production preparation has
  // immutable real hashes and rejects this fixture (see test below).
  return template.replaceAll('__VERIFIED_ACTOR_UUID__', actor).replaceAll('__AUTH_VALID_UNTIL__', new Date(Date.now() + 120000).toISOString()).replaceAll('__BACKUP_SHA256__', backupSha)
    .replaceAll('__EXPECTED_ALL_POSTS_MD5__', before.posts_fingerprint)
    .replaceAll('__EXPECTED_TARGET_MD5__', hash(before.posts.find(p => p.id === baseline.post).row_json))
}
async function rejectAndRollback(db, sql, expected) {
  await assert.rejects(db.exec(sql), expected)
  await db.exec('ROLLBACK')
}

test('closure SQL and backup preserve history, audit atomically and deny all resume routes', async t => {
  const db = await fixture()
  try {
    const before = await snapshot(db)
    checkBackupIntegrity(before)
    assert.throws(() => validateClosureSnapshot(before), /CLOSURE_BASELINE_CHANGED/)
    assert.equal(classifyClosureOutcome(before, before, adminId, backupSha), 'not_applied')
    await t.test('real SQL commits precisely the two fields plus trigger timestamp and one attributed event', async () => {
      await db.exec(fixtureSql(before))
      const after = await snapshot(db)
      assert.equal(classifyClosureOutcome(before, after, adminId, backupSha), 'closed_verified')
      assert.equal(after.posts.length, 18)
      assert.equal(after.runtime.maintenance, true); assert.equal(after.runtime.frontend_ready, false)
      assert.equal(after.events.length, 1)
      assert.equal(after.events[0].method, null); assert.equal(after.events[0].endpoint, null)
      assert.equal(after.events[0].actor_id, adminId)
      // A second execution never silently archives again or adds another event.
      await rejectAndRollback(db, fixtureSql(before), /CLOSURE_LEDGER_CHANGED/)
      assert.equal(classifyClosureOutcome(after, await snapshot(db), adminId, backupSha), 'not_applied')
      const corrupted = structuredClone(after); corrupted.events[0].actor_id = userId
      assert.equal(classifyClosureOutcome(before, corrupted, adminId, backupSha), 'inconsistent_stop')
    })
    await t.test('current engine and HTTP handlers reject terminal start/continue/reconcile/cancel/reset/delete without Meta', async () => {
      const saved = { fetch: globalThis.fetch, Deno: globalThis.Deno }
      const row = JSON.parse((await snapshot(db)).posts.find(p => p.id === baseline.post).row_json)
      const rpc = sqlRpc(db); let metaCalls = 0, postPatches = 0
      globalThis.Deno = { env: { get: k => ({ SUPABASE_URL: 'https://test.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fake-service', SUPABASE_ANON_KEY: 'fake-anon' })[k] } }
      globalThis.fetch = async (input, options = {}) => {
        const url = new URL(input)
        if (url.origin !== 'https://test.invalid') { metaCalls++; throw new Error('Unexpected network') }
        if (url.pathname === '/auth/v1/user') return Response.json({ id: adminId, is_anonymous: false })
        if (url.pathname === '/rest/v1/admin_users') return Response.json([{ user_id: adminId }])
        if (url.pathname === '/rest/v1/rpc/instagram_runtime_status') return Response.json({ schema_version: 2, maintenance: false, frontend_ready: true })
        if (url.pathname === '/rest/v1/rpc/ack_instagram_write') return rpc(url, options)
        if (url.pathname === '/rest/v1/instagram_posts' && (!options.method || options.method === 'GET')) return Response.json([row])
        if (url.pathname === '/rest/v1/instagram_events') return Response.json([])
        postPatches++; throw new Error('Unexpected post mutation')
      }
      try {
        for (const action of ['start','continue','reconcile','cancel']) {
          await assert.rejects(advancePublication(row, action, digest, adminId), /CONFIRMATION_REQUIRED|DRAFT_CONFLICT|MANUAL_REVIEW_REQUIRED/)
          const response = await createPublishHandler({ account_id: row.instagram_account_id })(new Request(`https://function.invalid/?action=${action}&id=${row.id}&revision=1`, { method: 'POST', headers: { Authorization: 'Bearer fake' }, body: JSON.stringify({ digest }) }))
          assert.equal(response.status, 409)
        }
        for (const action of ['reset','delete']) {
          const response = await createPrepareHandler()(new Request(`https://function.invalid/?action=${action}&id=${row.id}&revision=1`, { method: 'POST', headers: { Authorization: 'Bearer fake' } }))
          assert.equal(response.status, 409)
        }
        assert.equal(metaCalls, 0); assert.equal(postPatches, 0)
      } finally { globalThis.fetch = saved.fetch; globalThis.Deno = saved.Deno }
    })
  } finally { await db.close() }
})

test('closure fails closed on changed baseline, exact checkpoint, permissions and audit errors', async t => {
  for (const [name, mutation, refreshHashes, expected] of [
    ['other post changed', "UPDATE instagram_posts SET caption='Changed' WHERE id='22222222-2222-4222-8222-222222222222'", false, /CLOSURE_POSTS_CHANGED/],
    ['wrong attempt', `UPDATE instagram_posts SET publish_attempt_id='99999999-9999-4999-8999-999999999999' WHERE id='${baseline.post}'`, true, /CLOSURE_TARGET_CHANGED/],
    ['wrong revision', `UPDATE instagram_posts SET revision=2 WHERE id='${baseline.post}'`, true, /CLOSURE_TARGET_CHANGED/],
    ['wrong status', `UPDATE instagram_posts SET status='publish_unknown' WHERE id='${baseline.post}'`, true, /CLOSURE_TARGET_CHANGED/],
    ['wrong account', `UPDATE instagram_posts SET instagram_account_id='123' WHERE id='${baseline.post}'`, true, /CLOSURE_TARGET_CHANGED/],
    ['wrong phase', `UPDATE instagram_posts SET publish_progress=jsonb_set(publish_progress,'{phase}','"ready"') WHERE id='${baseline.post}'`, true, /CLOSURE_TARGET_CHANGED/],
    ['changed child', `UPDATE instagram_posts SET publish_progress=jsonb_set(publish_progress,'{children}','["1","2"]') WHERE id='${baseline.post}'`, true, /CLOSURE_TARGET_CHANGED/],
    ['changed principal', `UPDATE instagram_posts SET container_id='123' WHERE id='${baseline.post}'`, true, /CLOSURE_TARGET_CHANGED/],
    ['nonzero polls', `UPDATE instagram_posts SET publish_progress=jsonb_set(publish_progress,'{polls}','1') WHERE id='${baseline.post}'`, true, /CLOSURE_TARGET_CHANGED/],
    ['publication ID appeared', `UPDATE instagram_posts SET instagram_id='123' WHERE id='${baseline.post}'`, true, /CLOSURE_TARGET_CHANGED/],
    ['unexpected progress key', `UPDATE instagram_posts SET publish_progress=publish_progress||'{"operation":{"kind":"write"}}' WHERE id='${baseline.post}'`, true, /CLOSURE_TARGET_CHANGED/],
    ['maintenance off', 'UPDATE instagram_runtime_control SET maintenance=false', false, /CLOSURE_RUNTIME_CHANGED/],
    ['frontend ready', 'UPDATE instagram_runtime_control SET frontend_ready=true', false, /CLOSURE_RUNTIME_CHANGED/],
    ['safety latch appeared', "INSERT INTO instagram_account_safety(account_id,audit_hold) VALUES ('17841465479111585',true)", false, /CLOSURE_LEDGER_CHANGED/],
    ['readiness missing', "DELETE FROM instagram_backend_readiness WHERE function_name='instagram-status'", false, /CLOSURE_READINESS_CHANGED/],
    ['migration changed', "INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('99999999999999')", false, /CLOSURE_HISTORY_CHANGED/],
    ['audit insert fails', "CREATE FUNCTION reject_closure_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'SIMULATED_AUDIT_FAILURE'; END$$; CREATE TRIGGER fail_closure_audit BEFORE INSERT ON instagram_events FOR EACH ROW EXECUTE FUNCTION reject_closure_audit()", false, /SIMULATED_AUDIT_FAILURE/],
    ['trigger changes protected field', "CREATE FUNCTION damage_closure_post() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.caption := 'Changed by trigger'; RETURN NEW; END$$; CREATE TRIGGER damage_closure BEFORE UPDATE ON instagram_posts FOR EACH ROW EXECUTE FUNCTION damage_closure_post()", false, /CLOSURE_UNEXPECTED_POST_CHANGE/],
    ['audit trigger changes post', `CREATE FUNCTION damage_during_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN UPDATE public.instagram_posts SET caption='Changed during audit' WHERE id='${baseline.post}'; RETURN NEW; END$$; CREATE TRIGGER damage_audit AFTER INSERT ON instagram_events FOR EACH ROW EXECUTE FUNCTION damage_during_audit()`, false, /CLOSURE_PRESERVATION_FAILED/],
  ]) await t.test(name, async () => {
    const db = await fixture()
    try {
      const original = await snapshot(db)
      await db.exec(mutation)
      if (refreshHashes) {
        await db.exec('ALTER TABLE instagram_posts DISABLE TRIGGER instagram_posts_updated')
        await db.query("UPDATE instagram_posts SET updated_at='2026-11-07T06:28:09.495369Z' WHERE id=$1", [baseline.post])
        await db.exec('ALTER TABLE instagram_posts ENABLE TRIGGER instagram_posts_updated')
      }
      const before = await snapshot(db)
      await rejectAndRollback(db, fixtureSql(refreshHashes ? before : original), expected)
      const after = await snapshot(db)
      assert.deepEqual(after.posts, before.posts); assert.deepEqual(after.events, before.events)
    } finally { await db.close() }
  })
  await t.test('non-admin attribution cannot archive', async () => {
    const db = await fixture()
    try { const before = await snapshot(db); await rejectAndRollback(db, fixtureSql(before, userId), /CLOSURE_ADMIN_REQUIRED/); assert.deepEqual((await snapshot(db)).posts, before.posts) } finally { await db.close() }
  })
  await t.test('browser authenticated role has no UPDATE/INSERT rights for this operation', async () => {
    const db = await fixture()
    try {
      const rights = (await db.query("SELECT has_table_privilege('authenticated','instagram_posts','UPDATE') AS posts_update, has_table_privilege('authenticated','instagram_events','INSERT') AS audit_insert")).rows[0]
      assert.deepEqual(rights, { posts_update: false, audit_insert: false })
      const before = await snapshot(db)
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [adminId])
      await db.exec('SET ROLE authenticated')
      // Depending on the row-lock/RLS path, membership can be filtered before
      // PostgreSQL reaches the table-level write permission error. Both deny.
      await rejectAndRollback(db, fixtureSql(before), /permission denied|CLOSURE_ADMIN_REQUIRED/)
      await db.exec('RESET ROLE')
    } finally { await db.close() }
  })
})

test('private backup roundtrip, corruption rejection and fixed Auth-only administrator verification', async () => {
  const db = await fixture()
  try {
    const before = await snapshot(db)
    const backup = await savePrivateClosureBackup(before)
    const restored = await verifyPrivateClosureBackup(backup.directory)
    assert.deepEqual(restored.snapshot, before)
    await writeFile(join(backup.directory, 'snapshot.json'), 'tampered')
    await assert.rejects(verifyPrivateClosureBackup(backup.directory), /CLOSURE_BACKUP_CHECKSUM_FAILED/)
    let calls = 0
    const token = Buffer.from('{"alg":"HS256"}').toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: adminId, role: 'authenticated', iss: 'https://blsezjyhiholzwmqewef.supabase.co/auth/v1', exp: Math.floor(Date.now() / 1000) + 300 })).toString('base64url') + '.fake'
    const credentials = { key: 'sb_publishable_fake_test', token }
    const actor = await verifyClosureAdministrator(credentials, async (url, options) => {
      assert.equal(new URL(url).hostname, 'blsezjyhiholzwmqewef.supabase.co')
      assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error')
      assert.equal(options.headers.Authorization, 'Bearer ' + token)
      calls++; return Response.json(calls === 1 ? { id: adminId, role: 'authenticated', is_anonymous: false } : [{ user_id: adminId }])
    })
    assert.equal(actor, adminId); assert.equal(calls, 2)
    await assert.rejects(verifyClosureAdministrator(credentials, async () => Response.json({ ignored: token }, { status: 401 })), /CLOSURE_ADMIN_AUTH_FAILED/)
    await assert.rejects(verifyClosureAdministrator(credentials, async url => Response.json(url.includes('/auth/') ? { id: adminId, role: 'authenticated' } : [])), /CLOSURE_ADMIN_REQUIRED/)
  } finally { await db.close() }
})
