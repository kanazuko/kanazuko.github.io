import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { createInstagramLedger } from './helpers/instagram-ledger.js'

test('Instagram status authenticates before accessing Meta and never exposes secrets', async (t) => {
  const originalFetch = globalThis.fetch
  const originalDeno = globalThis.Deno
  let handler
  const secrets = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_ANON_KEY: 'public-key', SUPABASE_SERVICE_ROLE_KEY: 'fake-service', INSTAGRAM_ACCESS_TOKEN: 'private-instagram-token' }
  const ledger = createInstagramLedger()
  globalThis.Deno = { env: { get: (name) => secrets[name] }, serve: (fn) => { handler = fn } }
  const calls = []
  const user = { id: '11111111-1111-4111-8111-111111111111' }
  const account = { id: '123456789', username: 'prartjewelry' }
  let authStatus = 200
  let anonymous = false
  let admin = true
  let membershipStatus = 200
  let metaStatus = 200
  let metaBody = { data: [account] }
  let failNetwork = false
  const request = (authorization = 'Bearer user-jwt', method = 'POST') => new Request('https://function.invalid', {
    method, headers: authorization ? { authorization } : {},
  })
  try {
    await import('../supabase/functions/instagram-status/index.ts')
    globalThis.fetch = async (url, options) => {
      const ledgerResponse = await ledger.fetch(new URL(url), options)
      if (ledgerResponse) return ledgerResponse
      calls.push({ url, options })
      if (url.includes('/auth/v1/user')) return Response.json({ ...user, is_anonymous: anonymous }, { status: authStatus })
      if (url.includes('/rest/v1/admin_users')) return Response.json(admin ? [{ user_id: user.id }] : [], { status: membershipStatus })
      if (failNetwork) throw new Error(secrets.INSTAGRAM_ACCESS_TOKEN)
      return Response.json(metaBody, { status: metaStatus })
    }
    await t.test('preflight and unsupported methods do not access services', async () => {
      assert.equal((await handler(request('', 'OPTIONS'))).status, 204)
      assert.equal((await handler(request('', 'GET'))).status, 405)
      assert.equal(calls.length, 0)
    })
    await t.test('missing and invalid sessions cannot access membership or Meta', async () => {
      assert.equal((await handler(request(''))).status, 401)
      assert.equal(calls.length, 0)
      authStatus = 401
      assert.equal((await handler(request())).status, 401)
      assert.equal(calls.length, 1)
      authStatus = 200
      anonymous = true
      assert.equal((await handler(request())).status, 401)
      anonymous = false
    })
    await t.test('non-admins and failed permission lookups cannot call Meta', async () => {
      calls.length = 0
      admin = false
      assert.equal((await handler(request())).status, 403)
      assert.equal(calls.length, 2)
      admin = true
      membershipStatus = 500
      assert.equal((await handler(request())).status, 503)
      assert.equal(calls.length, 4)
      membershipStatus = 200
    })
    await t.test('missing Instagram secret fails after authorization', async () => {
      calls.length = 0
      const token = secrets.INSTAGRAM_ACCESS_TOKEN
      delete secrets.INSTAGRAM_ACCESS_TOKEN
      const response = await handler(request())
      assert.equal((await response.json()).error.code, 'INSTAGRAM_NOT_CONFIGURED')
      assert.equal(calls.length, 2)
      secrets.INSTAGRAM_ACCESS_TOKEN = token
    })
    await t.test('uses verified user RLS and official Unified Login endpoint, returning only allowed fields', async () => {
      calls.length = 0
      metaBody = { data: [{ ...account, access_token: secrets.INSTAGRAM_ACCESS_TOKEN, extra: 'hidden' }], paging: { next: 'https://invalid/?access_token=secret' } }
      const response = await handler(request())
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      assert.deepEqual(await response.json(), { connected: true, account_id: account.id, username: account.username, error: null })
      assert.equal(calls[1].options.headers.Authorization, 'Bearer user-jwt')
      assert.match(calls[1].url, new RegExp(`user_id=eq.${user.id}`))
      const url = new URL(calls[2].url)
      assert.equal(url.origin + url.pathname, 'https://graph.facebook.com/v26.0/me/assigned_instagram_accounts')
      assert.equal(url.searchParams.get('fields'), 'id,username')
      assert.equal(url.searchParams.has('access_token'), false)
      assert.equal(calls[2].options.headers.Authorization, `Bearer ${secrets.INSTAGRAM_ACCESS_TOKEN}`)
      assert.equal(calls[2].options.redirect, 'error')
    })
    await t.test('does not report success for empty, wrong-account or malformed responses', async () => {
      for (const body of [{ data: [] }, { data: [{ id: '1', username: 'someoneelse' }] }, { data: [{ ...account, id: 123 }] }, { id: 'system-user' }]) {
        metaBody = body
        const response = await handler(request())
        assert.equal(response.status, 502)
        assert.equal((await response.json()).connected, false)
      }
    })
    await t.test('provider errors and network exceptions are sanitized', async () => {
      metaStatus = 400
      for (const [code, expected] of [[190, 'INSTAGRAM_TOKEN_INVALID'], [10, 'INSTAGRAM_PERMISSION_DENIED'], [4, 'INSTAGRAM_RATE_LIMIT'], [999, 'INSTAGRAM_REJECTED']]) {
        ledger.clearPause()
        metaBody = { error: { code, message: secrets.INSTAGRAM_ACCESS_TOKEN, error_user_msg: 'sensitive' } }
        const response = await handler(request())
        const body = await response.json()
        assert.equal(body.error.code, expected)
        assert.equal(JSON.stringify(body).includes(secrets.INSTAGRAM_ACCESS_TOKEN), false)
      }
      failNetwork = true
      ledger.clearPause()
      const response = await handler(request())
      assert.equal((await response.json()).error.code, 'CONNECTION_UNAVAILABLE')
      failNetwork = false
      ledger.clearPause()
      metaStatus = 200
    })
    await t.test('pagination never follows supplied URLs and is bounded', async () => {
      calls.length = 0
      metaBody = { data: [], paging: { next: 'https://attacker.invalid/?access_token=secret', cursors: { after: 'cursor' } } }
      assert.equal((await handler(request())).status, 502)
      const metaCalls = calls.filter((call) => !call.url.startsWith(secrets.SUPABASE_URL))
      assert.equal(metaCalls.length, 2)
      assert.ok(metaCalls.every((call) => new URL(call.url).host === 'graph.facebook.com'))
      assert.equal(new URL(metaCalls[1].url).searchParams.get('after'), 'cursor')
    })
    await t.test('platform JWT verification remains enabled', async () => {
      const config = await readFile(new URL('../supabase/config.toml', import.meta.url), 'utf8')
      assert.match(config, /\[functions\.instagram-status\]\s+verify_jwt = true/)
    })
  } finally {
    globalThis.fetch = originalFetch
    globalThis.Deno = originalDeno
  }
})
