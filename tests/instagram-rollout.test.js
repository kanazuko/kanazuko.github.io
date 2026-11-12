import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { createPrepareHandler } from '../supabase/functions/instagram-prepare/handler.ts'
import { createPublishHandler } from '../supabase/functions/instagram-publish/handler.ts'
import { instagramDb, sqlRpc, adminId, postIds } from './helpers/instagram-db.js'
import { checkInstagramRelease } from '../scripts/check-instagram-release.mjs'
import { deployInstagramFunctions } from '../scripts/deploy-instagram-functions.mjs'
import { checkInstagramBackends } from '../scripts/check-instagram-backends.mjs'

test('different Edge Functions share SQL exclusion, maintenance and schema guards', async t => {
  const db = await instagramDb()
  const saved = { fetch: globalThis.fetch, Deno: globalThis.Deno }
  let statusHandler, wrongVersion = false, metaCalls = 0, remote
  globalThis.Deno = { env: { get: name => ({ SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fake-service', SUPABASE_ANON_KEY: 'fake-anon', INSTAGRAM_ACCESS_TOKEN: 'fake-meta' })[name] }, serve: handler => { statusHandler = handler } }
  const rpc = sqlRpc(db)
  globalThis.fetch = async (input, options) => {
    const url = new URL(input)
    if (url.hostname === 'graph.facebook.com') { metaCalls++; return remote() }
    assert.equal(url.hostname, 'test.supabase.co')
    if (url.pathname === '/auth/v1/user') return Response.json({ id: adminId, is_anonymous: false })
    if (url.pathname === '/rest/v1/admin_users') return Response.json([{ user_id: adminId }])
    if (wrongVersion && url.pathname.endsWith('/instagram_runtime_status')) return Response.json({ schema_version: 1, maintenance: false })
    if (url.pathname === '/rest/v1/instagram_posts') {
      assert.ok(!options.method || options.method === 'GET', 'maintenance/schema validation must precede mutations')
      const id = url.searchParams.get('id').replace('eq.', '')
      return Response.json((await db.query('SELECT to_jsonb(p) AS value FROM instagram_posts p WHERE id=$1', [id])).rows.map(row => row.value))
    }
    return rpc(url, options)
  }
  const prepare = createPrepareHandler(bytes => bytes)
  const publish = createPublishHandler({ account_id: '17841465479111585' })
  const request = action => new Request(`https://function.invalid?action=${action}&id=${postIds[0]}&revision=1`, { method: 'POST', headers: { Authorization: 'Bearer fake-session' } })
  try {
    // Local fixture models the historical waiting checkpoint; never a Cloud write.
    await db.query(`UPDATE instagram_posts SET container_id='123456', publish_progress='{"phase":"waiting","children":["123454","123455"]}'::jsonb WHERE id=$1`, [postIds[0]])
    await import('../supabase/functions/instagram-status/index.ts')
    await t.test('maintenance blocks status, preparation and publication before Meta or post writes', async () => {
      const before = (await db.query('SELECT to_jsonb(p) AS value FROM instagram_posts p ORDER BY id')).rows
      const actions = [[statusHandler,['status','maintenance-probe']], [prepare,['check','begin','upload','finish','reset','delete','maintenance-probe']], [publish,['review','start','continue','reconcile','cancel','maintenance-probe']]]
      for (const [handler, names] of actions) {
        for (const action of names) {
          const response = await handler(request(action))
          assert.equal(response.status, 423)
          assert.equal((await response.json()).error.code, 'INSTAGRAM_MAINTENANCE')
        }
      }
      assert.equal(metaCalls, 0)
      assert.deepEqual((await db.query('SELECT to_jsonb(p) AS value FROM instagram_posts p ORDER BY id')).rows, before)
      assert.equal((await db.query('SELECT count(*)::int AS n FROM instagram_events')).rows[0].n, 0)
    })
    await t.test('incompatible schema refuses all three functions, including health attestation', async () => {
      wrongVersion = true
      for (const handler of [statusHandler, prepare, publish]) {
        for (const action of ['start', 'health']) {
          const response = await handler(request(action))
          assert.equal(response.status, 503)
          assert.equal((await response.json()).error.code, 'INSTAGRAM_SCHEMA_INCOMPATIBLE')
        }
      }
      assert.equal(metaCalls, 0); wrongVersion = false
    })
    await t.test('new health routes attest all deployed backends during maintenance without contacting Meta', async () => {
      const before = (await db.query('SELECT to_jsonb(p) AS value FROM instagram_posts p ORDER BY id')).rows
      for (const handler of [statusHandler, prepare, publish]) {
        const response = await handler(request('health'))
        assert.equal(response.status, 200); assert.equal((await response.json()).backend_version, 2)
      }
      assert.equal(metaCalls, 0)
      assert.equal((await db.query('SELECT count(*)::int AS n FROM instagram_backend_readiness')).rows[0].n, 3)
      assert.deepEqual((await db.query('SELECT to_jsonb(p) AS value FROM instagram_posts p ORDER BY id')).rows, before)
    })
    await t.test('maintenance probes cannot reach Meta or modify posts even if maintenance was lifted', async () => {
      await db.exec('UPDATE instagram_runtime_control SET maintenance=false') // Local fixture only.
      const before = (await db.query('SELECT to_jsonb(p) AS value FROM instagram_posts p ORDER BY id')).rows
      for (const handler of [statusHandler, prepare, publish]) {
        const response = await handler(request('maintenance-probe'))
        assert.equal(response.status, 409)
        assert.equal((await response.json()).error.code, 'INSTAGRAM_MAINTENANCE_REQUIRED')
      }
      assert.equal(metaCalls, 0)
      assert.deepEqual((await db.query('SELECT to_jsonb(p) AS value FROM instagram_posts p ORDER BY id')).rows, before)
      await db.exec('UPDATE instagram_runtime_control SET maintenance=true')
    })
    await t.test('concurrent status and preparation calls cannot overlap their Meta requests', async () => {
      await db.exec('UPDATE instagram_runtime_control SET maintenance=false') // Local fixture only.
      let entered, release
      const ready = new Promise(resolve => { entered = resolve })
      const waiting = new Promise(resolve => { release = resolve })
      remote = async () => { entered(); await waiting; return Response.json({ data: [{ id: '17841465479111585', username: 'prartjewelry' }] }) }
      const first = statusHandler(request('status'))
      await ready
      const second = await prepare(request('check'))
      assert.equal((await second.json()).error.code, 'INSTAGRAM_ACCOUNT_BUSY')
      assert.equal(metaCalls, 1)
      release(); assert.equal((await first).status, 200)
    })
    await t.test('schema-independent bridge rejects operations without reading secrets or accessing the network', async () => {
      let bridge
      globalThis.Deno = { serve: handler => { bridge = handler } }
      globalThis.fetch = () => { throw new Error('Bridge must never perform HTTP') }
      await import('../scripts/instagram-maintenance/supabase/functions/maintenance/index.ts')
      assert.equal((await bridge(request('start'))).status, 423)
      assert.equal((await bridge(new Request('https://function.invalid', { method: 'OPTIONS' }))).status, 204)
    })
  } finally { globalThis.fetch = saved.fetch; globalThis.Deno = saved.Deno; await db.close() }
})

test('deployment preflight blocks incompatible functions and premature Pages activation', async () => {
  const projectRef = 'abcdefghijklmnopqrst'
  const env = { VITE_SUPABASE_URL: `https://${projectRef}.supabase.co`, VITE_SUPABASE_PUBLISHABLE_KEY: 'public-test-key' }
  let state = { schema_version: 1, maintenance: true, frontend_ready: false }, deployments = 0
  const fetchImpl = async (url, options) => {
    assert.equal(new URL(url).pathname, '/rest/v1/rpc/instagram_runtime_status')
    assert.equal(options.body, '{}') // The preflight RPC performs reads only.
    return Response.json(state)
  }
  const runCommand = async () => { deployments++ }
  await assert.rejects(deployInstagramFunctions({ env, projectRef, execute: true, fetchImpl, runCommand }), /schema v2/)
  assert.equal(deployments, 0)
  state = { ...state, schema_version: 2, maintenance: false }
  await assert.rejects(deployInstagramFunctions({ env, projectRef, execute: true, fetchImpl, runCommand }), /maintenance/)
  assert.equal(deployments, 0)
  state.maintenance = true
  await deployInstagramFunctions({ env, projectRef, execute: false, fetchImpl, runCommand })
  assert.equal(deployments, 0, 'default preflight must never deploy')
  await assert.rejects(checkInstagramRelease({ url: env.VITE_SUPABASE_URL, key: env.VITE_SUPABASE_PUBLISHABLE_KEY, stage: 'frontend', fetchImpl }), /backends must be verified/)
  state.frontend_ready = true
  await checkInstagramRelease({ url: env.VITE_SUPABASE_URL, key: env.VITE_SUPABASE_PUBLISHABLE_KEY, stage: 'frontend', fetchImpl })
  await deployInstagramFunctions({ env, projectRef, execute: true, fetchImpl, runCommand })
  assert.equal(deployments, 3) // Only the spy was invoked, never the real CLI.
  await assert.rejects(deployInstagramFunctions({ env, projectRef: 'zzzzzzzzzzzzzzzzzzzz', fetchImpl, runCommand }), /does not match/)
  const workflow = (await readFile(new URL('../.github/workflows/deploy-pages.yml', import.meta.url), 'utf8')).replaceAll('\r\n', '\n')
  assert.ok(workflow.includes("deploy:\n    if: github.ref == 'refs/heads/main' && (github.event_name == 'push' || (github.event_name == 'workflow_dispatch' && inputs.release_instagram))"))
  assert.match(workflow, /Recheck Instagram release before activation/)
  const healthCalls = []
  const healthFetch = async (url, options) => {
    const parsed = new URL(url)
    if (parsed.pathname.startsWith('/rest/')) return fetchImpl(url, options)
    assert.equal(parsed.search, '?action=health')
    assert.equal(options.headers.Authorization, 'Bearer private-session-for-test')
    const name = parsed.pathname.split('/').at(-1); healthCalls.push(name)
    return Response.json({ function_name: name, backend_version: 2, runtime: state })
  }
  await checkInstagramBackends({ env: { ...env, SUPABASE_ADMIN_ACCESS_TOKEN: 'private-session-for-test' }, fetchImpl: healthFetch })
  assert.deepEqual(healthCalls, ['instagram-status','instagram-prepare','instagram-publish'])
  await assert.rejects(checkInstagramBackends({ env, fetchImpl }), /administrator session/)
})
