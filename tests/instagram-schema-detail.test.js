import assert from 'node:assert/strict'
import { test } from 'node:test'
import { detailQueries, readSchemaDetail, readPublicRuntime, safeDetailError, compareSchemaCatalog } from '../scripts/check-instagram-schema-detail.mjs'
import { instagramDb } from './helpers/instagram-db.js'

test('catalog SQL parses and matches both actual migrations in local PostgreSQL', async () => {
  const db = await instagramDb()
  try {
    const detail = (await db.query(detailQueries.catalog)).rows[0].detail
    assert.equal(detail.runtime.schema_version, 2)
    assert.equal(detail.runtime.maintenance, true)
    assert.equal(detail.runtime.frontend_ready, false)
    assert.equal(detail.constraints.filter(x => x.type === 'p').length, 4)
    assert.equal(detail.constraints.every(x => x.validated), true)
    assert.equal(detail.defaults.find(x => x.table === 'instagram_account_safety' && x.column === 'audit_hold').default, 'false')
    const pg17 = structuredClone(detail)
    pg17.constraints = pg17.constraints.filter(c => c.type !== 'n')
    assert.deepEqual(compareSchemaCatalog(pg17, detail), { constraints: true, defaults_and_columns: true, indexes: true })
    const changed = structuredClone(pg17)
    changed.defaults.find(x => x.column === 'audit_hold').nullable = 'YES'
    assert.equal(compareSchemaCatalog(changed, detail).defaults_and_columns, false)
    const changedConstraint = structuredClone(pg17)
    changedConstraint.constraints[0].definition = 'incorrect'
    assert.equal(compareSchemaCatalog(changedConstraint, detail).constraints, false)
    assert.deepEqual((await db.query(detailQueries.runtime)).rows[0].detail, {
      schema_version: 2, maintenance: true, frontend_ready: false, deployment_epoch: detail.runtime.deployment_epoch,
    })
  } finally { await db.close() }
})

test('management queries are fixed SELECTs in read-only transactions, without redirects/retries', async () => {
  let calls = 0
  const result = await readSchemaDetail('catalog', { token: 'fake-management-only', fetchImpl: async (url, options) => {
    calls++
    assert.equal(url, 'https://api.supabase.com/v1/projects/blsezjyhiholzwmqewef/database/query/read-only')
    assert.equal(options.redirect, 'error')
    const { query } = JSON.parse(options.body)
    assert.equal(query, `BEGIN READ ONLY; ${detailQueries.catalog}; ROLLBACK;`)
    return Response.json([{ detail: { read_only: 'on' } }])
  } })
  assert.equal(calls, 1)
  assert.equal(result.http_status, 200)
  await assert.rejects(readSchemaDetail('anything_else', { token: 'fake', fetchImpl: () => assert.fail('No request') }))
})

test('errors retain HTTP/SQLSTATE and phase without forwarding sensitive bodies or exception messages', async () => {
  const cases = [
    [400, 'ERROR: 42501: permission denied for function instagram_runtime_status private-secret', 'sql','RUNTIME_EXECUTE_DENIED','42501'],
    [400, 'ERROR: 42601: syntax error private-secret', 'sql','SQL_SYNTAX_ERROR','42601'],
    [400, 'ERROR: 57014: canceling statement private-secret', 'sql','SQL_TIMEOUT','57014'],
    [401, 'private-secret', 'http','HTTP_UNAUTHORIZED',undefined],
    [403, 'private-secret', 'http','HTTP_FORBIDDEN',undefined],
  ]
  for (const [status, body, phase, code, sqlstate] of cases) {
    try { await readSchemaDetail('runtime', { token: 'private-secret', fetchImpl: async () => new Response(body, { status }) }); assert.fail() }
    catch (error) {
      const safe = safeDetailError(error)
      assert.deepEqual(safe, { phase, code, http_status: status, ...(sqlstate ? { sqlstate } : {}) })
      assert.equal(JSON.stringify(safe).includes('private-secret'), false)
    }
  }
  assert.deepEqual(safeDetailError(new Error('private-secret')), { phase: 'internal', code: 'UNEXPECTED_FAILURE' })
})

test('network, TLS, timeout and malformed JSON have distinct sanitized diagnostics', async () => {
  const cases = [
    [() => { throw new Error('private-secret', { cause: { code: 'CERT_HAS_EXPIRED' } }) }, 'tls','TLS_FAILED'],
    [() => { throw new DOMException('private-secret','TimeoutError') }, 'connection','REQUEST_TIMEOUT'],
    [() => { throw new Error('private-secret') }, 'connection','CONNECTION_FAILED'],
    [() => new Response('private-secret'), 'response','INVALID_JSON'],
  ]
  for (const [fetchImpl, phase, code] of cases) {
    await assert.rejects(readSchemaDetail('catalog', { token: 'fake', fetchImpl }), e => {
      assert.equal(safeDetailError(e).phase, phase); assert.equal(safeDetailError(e).code, code); return true
    })
  }
})

test('public runtime check accepts only a public key and calls only the reviewed GET RPC', async () => {
  const state = { schema_version: 2, maintenance: true, frontend_ready: false, deployment_epoch: 'fake-epoch' }
  await assert.rejects(readPublicRuntime('sb_secret_fake', () => assert.fail('No request')))
  const result = await readPublicRuntime('sb_publishable_fake', async (url, options) => {
    assert.equal(url, 'https://blsezjyhiholzwmqewef.supabase.co/rest/v1/rpc/instagram_runtime_status')
    assert.equal(options.method, 'GET')
    assert.equal(options.headers.Authorization, undefined)
    return Response.json(state)
  })
  assert.deepEqual(result.state, state)
  await assert.rejects(readPublicRuntime('sb_publishable_fake', async () => Response.json({ ...state, maintenance: false })), e => safeDetailError(e).code === 'RUNTIME_MISMATCH')
})
