import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { checkInstagramMaintenance, maintenanceFunctions, maintenanceProjectRef } from '../scripts/check-instagram-maintenance.mjs'
import { checkInstagramDrain } from '../scripts/check-instagram-drain.mjs'
import { publicTestKey, sessionJwt } from './helpers/instagram-session.js'

test('bridge covers all three configured endpoints without any HTTP, secret or DB access', async () => {
  const saved = { Deno: globalThis.Deno, fetch: globalThis.fetch }
  let handler
  globalThis.Deno = { serve: fn => { handler = fn }, env: { get: () => { throw new Error('Bridge accessed secrets') } } }
  globalThis.fetch = () => { throw new Error('Bridge attempted HTTP') }
  try {
    await import('../scripts/instagram-maintenance/supabase/functions/maintenance/index.ts')
    const config = await readFile(new URL('../scripts/instagram-maintenance/supabase/config.toml', import.meta.url), 'utf8')
    for (const name of maintenanceFunctions) {
      const section = config.split(`[functions.${name}]`)[1]?.split('[functions.')[0]
      assert.match(section, /verify_jwt = true/)
      assert.match(section, /entrypoint = "\.\/functions\/maintenance\/index\.ts"/)
      for (const action of ['start','continue','reconcile','cancel','begin','upload','finish','reset','delete','health','maintenance-probe']) {
        const request = new Request(`https://${maintenanceProjectRef}.supabase.co/functions/v1/${name}?action=${action}`, { method: 'POST', body: '{}' })
        const response = await handler(request)
        assert.equal(response.status, 423)
        assert.equal(response.headers.get('x-instagram-maintenance-bridge'), 'prartjewelry-v1')
        assert.equal(response.headers.get('cache-control'), 'no-store')
        assert.deepEqual(await response.json(), { error: { code: 'INSTAGRAM_MAINTENANCE' } })
        assert.equal(request.bodyUsed, false)
      }
      const endpoint = `https://function.invalid/${name}`
      assert.equal((await handler(new Request(endpoint, { method: 'OPTIONS' }))).status, 204)
      assert.equal((await handler(new Request(endpoint))).status, 423)
    }
  } finally { globalThis.Deno = saved.Deno; globalThis.fetch = saved.fetch }
})

test('verification requires the exact bridge marker and never resumes a pending operation', async () => {
  const env = { VITE_SUPABASE_PUBLISHABLE_KEY: publicTestKey, SUPABASE_ADMIN_ACCESS_TOKEN: sessionJwt() }
  const calls = []
  const fetchImpl = async (input, options) => {
    const url = new URL(input); calls.push(url.pathname)
    assert.equal(url.origin, `https://${maintenanceProjectRef}.supabase.co`)
    assert.equal(url.search, '?action=maintenance-probe')
    assert.equal(options.body, '{}'); assert.equal(options.redirect, 'error')
    assert.equal(options.headers.Authorization, `Bearer ${env.SUPABASE_ADMIN_ACCESS_TOKEN}`)
    return Response.json({ error: { code: 'INSTAGRAM_MAINTENANCE' } }, { status: 423, headers: { 'X-Instagram-Maintenance-Bridge': 'prartjewelry-v1', 'Cache-Control': 'no-store' } })
  }
  const results = await checkInstagramMaintenance({ env, fetchImpl })
  assert.equal(results.length, 3); assert.equal(calls.length, 3)
  assert.equal(JSON.stringify(results).includes(env.SUPABASE_ADMIN_ACCESS_TOKEN), false)
  for (const status of [200,401,403,500]) {
    await assert.rejects(checkInstagramMaintenance({ env, fetchImpl: async () => Response.json({}, { status }) }), /not verified/)
  }
  await assert.rejects(checkInstagramMaintenance({ env, fetchImpl: async () => Response.json({ error: { code: 'INSTAGRAM_MAINTENANCE' } }, { status: 423 }) }), /not verified/)
  await assert.rejects(checkInstagramMaintenance({ env: { ...env, VITE_SUPABASE_URL: 'https://wrong.supabase.co' }, fetchImpl }), error => error.code === 'PROJECT_MISMATCH')
  await assert.rejects(checkInstagramMaintenance({ env: {}, fetchImpl }), error => error.code === 'INPUT_INVALID')
})

test('drain inventory uses only the read-only API and never claims proof of edge termination', async () => {
  const result = await checkInstagramDrain({ env: { SUPABASE_ACCESS_TOKEN: 'fake-management-session' }, fetchImpl: async (url, options) => {
    assert.equal(url, `https://api.supabase.com/v1/projects/${maintenanceProjectRef}/database/query/read-only`)
    assert.equal(options.redirect, 'error')
    const { query } = JSON.parse(options.body)
    assert.match(query, /^BEGIN READ ONLY;/); assert.match(query, /ROLLBACK;$/)
    assert.doesNotMatch(query, /\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE)\b/)
    assert.doesNotMatch(query, /caption|access_token|service_role_key/i)
    return Response.json([{ drain: { observation: { read_only: 'on' }, pending_attempts: [{ id: 'pending', status: 'publish_unknown' }], edge_drain_verified: true } }])
  } })
  assert.equal(result.pending_attempts[0].status, 'publish_unknown')
  assert.equal(result.edge_drain_verified, false)
  assert.equal(JSON.stringify(result).includes('fake-management-session'), false)
  await assert.rejects(checkInstagramDrain({ env: {} }), /Management API session required/)
})
