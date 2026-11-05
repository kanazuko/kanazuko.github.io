import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPrepareHandler } from '../supabase/functions/instagram-prepare/handler.ts'

test('preparation state machine, permission gates, cleanup and disabled publishing', async (t) => {
  const previous = { fetch: globalThis.fetch, Deno: globalThis.Deno }
  const id = '33333333-3333-4333-8333-333333333333'
  const imageId = '22222222-2222-4222-8222-222222222222'
  const productId = '11111111-1111-4111-8111-111111111111'
  const secrets = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_ANON_KEY: 'public', SUPABASE_SERVICE_ROLE_KEY: 'server-key', INSTAGRAM_ACCESS_TOKEN: 'secret-meta-token' }
  let publishHandler
  globalThis.Deno = { env: { get: (key) => secrets[key] }, serve: (handler) => { publishHandler = handler } }
  const calls = []
  const objects = new Map()
  let isAdmin = true
  let granted = true
  let deleteFails = false
  let uploadFails = false
  let quota = 0
  let anonymous = false
  let tick = 0
  let row
  const resetRow = () => { row = { id, revision: 1, status: 'draft', updated_at: new Date().toISOString(), mode: 'single', caption: 'Texto', images: [{ id: imageId, product_id: productId, storage_path: `products/${productId}/original.webp` }], prepared_images: [] } }
  resetRow()
  const request = (action, body, authorization = 'Bearer session', rev = row.revision) => new Request(`https://function.invalid?id=${id}&revision=${rev}&action=${action}&image_id=${imageId}`, {
    method: 'POST', headers: { ...(authorization ? { authorization } : {}), ...(body ? { 'Content-Type': 'image/jpeg' } : {}) }, body,
  })
  // Actual decoding is tested in Deno; this test isolates transport/state behavior.
  const jpeg = new Uint8Array([255, 216, 1, 2, 255, 217])
  const handler = createPrepareHandler((bytes) => { assert.deepEqual(bytes, jpeg); return bytes })
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input)
    calls.push({ url, options })
    if (url.pathname === '/auth/v1/user') return Response.json({ id: 'admin-id', is_anonymous: anonymous })
    if (url.pathname === '/rest/v1/admin_users') return Response.json(isAdmin ? [{ user_id: 'admin-id' }] : [])
    if (url.pathname === '/rest/v1/instagram_posts') {
      if (options.method === 'PATCH') {
        if (url.searchParams.get('status') !== `eq.${row.status}` || url.searchParams.get('revision') !== `eq.${row.revision}` || url.searchParams.get('updated_at') !== `eq.${row.updated_at}`) return Response.json([])
        row = { ...row, ...JSON.parse(options.body), updated_at: new Date(Date.now() + ++tick).toISOString() }
      }
      return Response.json([row])
    }
    if (url.hostname === 'graph.facebook.com') {
      assert.equal(options.method, undefined) // No Meta writes in this stage.
      assert.equal(options.headers.Authorization, `Bearer ${secrets.INSTAGRAM_ACCESS_TOKEN}`)
      assert.equal(url.searchParams.has('access_token'), false)
      if (url.pathname.endsWith('/assigned_instagram_accounts')) return Response.json({ data: [{ id: '12345', username: 'prartjewelry' }] })
      if (url.pathname.endsWith('/content_publishing_limit')) return granted ? Response.json({ data: [{ config: { quota_total: 100 }, quota_usage: quota }] }) : Response.json({ error: { code: 200, message: secrets.INSTAGRAM_ACCESS_TOKEN } }, { status: 403 })
      throw new Error('Unexpected Meta endpoint')
    }
    if (url.pathname.includes('/public/product-images/')) return new Response(null, { headers: { 'Content-Type': 'image/webp' } })
    if (url.pathname === '/storage/v1/object/instagram-prepared' && options.method === 'DELETE') {
      if (deleteFails) return Response.json({ message: 'sensitive' }, { status: 500 })
      for (const path of JSON.parse(options.body).prefixes) objects.delete(path)
      return Response.json([])
    }
    if (url.pathname.startsWith('/storage/v1/object/instagram-prepared/') && options.method === 'POST') {
      const path = url.pathname.split('/instagram-prepared/')[1]
      assert.ok(row.prepared_images.some((image) => image.path === path), 'manifest must exist before storage write')
      assert.equal(options.headers['x-upsert'], 'false')
      if (uploadFails) { objects.set(path, options.body); throw new Error('lost upload response ' + secrets.INSTAGRAM_ACCESS_TOKEN) }
      if (objects.has(path)) return Response.json({}, { status: 409 })
      objects.set(path, options.body)
      return Response.json({})
    }
    if (url.pathname.includes('/public/instagram-prepared/')) {
      const path = url.pathname.split('/instagram-prepared/')[1]
      assert.equal(options.headers, undefined)
      return new Response(objects.get(path), { headers: { 'Content-Type': 'image/jpeg' } })
    }
    throw new Error('Unexpected network access')
  }
  try {
    await import('../supabase/functions/instagram-publish/index.ts')
    await t.test('anonymous and non-admin callers cannot reach Meta, storage or service-role database operations', async () => {
      assert.equal((await handler(request('begin', undefined, ''))).status, 401)
      assert.equal(calls.length, 0)
      anonymous = true
      assert.equal((await handler(request('begin'))).status, 401)
      anonymous = false
      isAdmin = false
      assert.equal((await handler(request('begin'))).status, 403)
      assert.ok(calls.every(({ url }) => !url.hostname.includes('graph.') && !url.pathname.includes('instagram_posts')))
      assert.equal((await publishHandler(request('publish'))).status, 403)
      isAdmin = true
    })
    await t.test('connected account is insufficient without publishing grants or available quota', async () => {
      granted = false
      const denied = await handler(request('begin'))
      assert.equal((await denied.json()).error.code, 'INSTAGRAM_PERMISSION_DENIED')
      assert.equal(row.status, 'preparation_failed')
      assert.equal(objects.size, 0)
      assert.equal((await handler(request('reset'))).status, 200)
      granted = true; quota = 100
      assert.equal((await handler(request('begin'))).status, 429)
      quota = 0
      await handler(request('reset'))
    })
    await t.test('happy path stores manifest before upload, verifies public hash and records preparation only', async () => {
      assert.equal((await handler(request('begin'))).status, 200)
      assert.equal(row.status, 'preparing')
      assert.equal((await handler(request('begin'))).status, 409)
      assert.equal((await handler(request('finish'))).status, 400)
      assert.equal((await handler(request('upload', jpeg))).status, 200)
      assert.equal((await handler(request('upload', jpeg))).status, 200)
      assert.equal(objects.size, 1)
      const result = await handler(request('finish'))
      assert.equal(result.status, 200)
      assert.equal(row.status, 'prepared')
      assert.equal(row.instagram_account_id, '12345')
      assert.equal(row.instagram_id, undefined)
      assert.equal(JSON.stringify(await result.json()).includes(secrets.INSTAGRAM_ACCESS_TOKEN), false)
    })
    await t.test('publishing is unconditionally blocked even with confirmation flags', async () => {
      const before = calls.filter(({ url }) => url.hostname === 'graph.facebook.com').length
      const result = await publishHandler(request('publish', JSON.stringify({ confirmed: true, enabled: true })))
      assert.equal(result.status, 423)
      assert.equal((await result.json()).error.code, 'PUBLISHING_DISABLED')
      assert.equal(calls.filter(({ url }) => url.hostname === 'graph.facebook.com').length, before)
    })
    await t.test('failed cleanup retains tracked paths; retry removes copies without touching originals', async () => {
      deleteFails = true
      assert.equal((await handler(request('reset'))).status, 503)
      assert.equal(row.status, 'cleanup_failed')
      assert.equal(row.prepared_images.length, 1)
      deleteFails = false
      const rev = row.revision
      assert.equal((await handler(request('reset'))).status, 200)
      assert.equal(row.status, 'draft')
      assert.equal(row.revision, rev + 1)
      assert.equal(objects.size, 0)
      assert.equal(row.prepared_images.length, 0)
      assert.equal((await handler(request('begin', undefined, 'Bearer session', rev))).status, 409)
    })
    await t.test('ambiguous storage upload is tracked and recoverable, with sanitized errors', async () => {
      await handler(request('begin'))
      uploadFails = true
      const result = await handler(request('upload', jpeg))
      assert.equal(result.status, 503)
      assert.equal((await result.json()).error.code, 'OPERATION_FAILED')
      assert.equal(objects.size, 1)
      assert.equal(row.status, 'preparation_failed')
      uploadFails = false
      await handler(request('reset'))
      assert.equal(objects.size, 0)
    })
    await t.test('active locks cannot be stolen; abandoned locks are recoverable after ten minutes', async () => {
      row.status = 'uploading'
      assert.equal((await handler(request('reset'))).status, 409)
      row.updated_at = new Date(Date.now() - 660000).toISOString()
      assert.equal((await handler(request('reset'))).status, 200)
    })
    await t.test('tampered manifest cannot cause arbitrary storage deletion', async () => {
      await handler(request('begin'))
      row.prepared_images[0].path = '../product-images/original.webp'
      const before = calls.filter(({ options }) => options.method === 'DELETE').length
      assert.equal((await handler(request('reset'))).status, 400)
      assert.equal(calls.filter(({ options }) => options.method === 'DELETE').length, before)
    })
  } finally { globalThis.fetch = previous.fetch; globalThis.Deno = previous.Deno }
})
