import { test } from 'node:test'
import assert from 'node:assert/strict'
import { advancePublication, confirmationDigest } from '../supabase/functions/instagram-publish/engine.ts'
import { createPublishHandler } from '../supabase/functions/instagram-publish/handler.ts'

test('publication engine with simulated Meta only', async t => {
  const saved = { fetch: globalThis.fetch, Deno: globalThis.Deno }
  globalThis.Deno = { env: { get: name => ({ SUPABASE_URL: 'https://test.supabase.co', SUPABASE_ANON_KEY: 'fake-anon', SUPABASE_SERVICE_ROLE_KEY: 'fake-service', INSTAGRAM_ACCESS_TOKEN: 'fake-token' })[name] } }
  const bytes = new Uint8Array([255, 216, 1, 255, 217])
  const sha256 = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex')
  let row, writes, tick, loseWrite, metadataFailure, containerState, account, corrupt, admin = true
  function reset(mode = 'single') {
    tick = 0; writes = []; loseWrite = ''; metadataFailure = false; containerState = 'FINISHED'; account = '123'; corrupt = false
    row = { id: '11111111-1111-4111-8111-111111111111', revision: 1, status: 'prepared', updated_at: '0', mode, caption: 'Joya', instagram_account_id: '123', publish_progress: {}, images: (mode === 'single' ? ['a'] : ['a', 'b']).map(id => ({ id })) }
    row.prepared_images = row.images.map(({ id }) => ({ image_id: id, path: `${row.id}/1/${id}.jpg`, sha256, width: 1080, height: 1080, bytes: bytes.length }))
  }
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input)
    if (url.pathname === '/auth/v1/user') return Response.json({ id: 'admin', is_anonymous: false })
    if (url.pathname === '/rest/v1/admin_users') return Response.json(admin ? [{ user_id: 'admin' }] : [])
    if (url.pathname === '/rest/v1/instagram_posts') {
      if (!options.method || options.method === 'GET') return Response.json([row])
      assert.equal(options.method, 'PATCH')
      if (url.searchParams.get('updated_at') !== `eq.${row.updated_at}` || url.searchParams.get('status') !== `eq.${row.status}`) return Response.json([])
      row = { ...row, ...JSON.parse(options.body), updated_at: String(++tick) }
      return Response.json([row])
    }
    if (url.pathname.includes('/storage/v1/object/public/')) {
      assert.equal(options.headers, undefined)
      return new Response(corrupt ? new Uint8Array([1]) : bytes, { headers: { 'Content-Type': 'image/jpeg' } })
    }
    assert.equal(url.hostname, 'graph.facebook.com')
    assert.equal(url.searchParams.has('access_token'), false)
    assert.equal(options.headers.Authorization, 'Bearer fake-token')
    if (options.method === 'POST') {
      writes.push({ path: url.pathname, fields: Object.fromEntries(options.body) })
      if (url.pathname.endsWith('/media_publish')) assert.equal(row.status, 'publish_unknown')
      else assert.equal(row.publish_progress.phase, 'working')
      if (url.pathname.endsWith(loseWrite) && loseWrite) throw new Error('fake-token must never escape')
      return Response.json({ id: String(1000 + writes.length) })
    }
    if (url.pathname.endsWith('/assigned_instagram_accounts')) return Response.json({ data: [{ id: account, username: 'prartjewelry' }] })
    if (url.pathname.endsWith('/content_publishing_limit')) return Response.json({ data: [{ quota_usage: 0, config: { quota_total: 50 } }] })
    if (url.searchParams.get('fields') === 'status_code') return Response.json({ status_code: containerState })
    if (metadataFailure) throw new Error('metadata network failure')
    return Response.json({ id: row.instagram_id, permalink: 'https://www.instagram.com/p/example/' })
  }
  const start = async () => advancePublication(structuredClone(row), 'start', await confirmationDigest(row))
  const next = async () => advancePublication(structuredClone(row), 'continue')
  try {
    await t.test('integrated endpoint requires admin, source allowlist, exact revision and content confirmation', async () => {
      reset()
      const enabled = createPublishHandler({ id: row.id, revision: 1, account_id: '123' })
      const request = (action, digest, auth = 'Bearer simulated') => new Request(`https://function.invalid?id=${row.id}&revision=1&action=${action}`, { method: 'POST', headers: { ...(auth ? { Authorization: auth } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify({ digest }) })
      assert.equal((await enabled(request('start', '', ''))).status, 401)
      admin = false; assert.equal((await enabled(request('start', ''))).status, 403); admin = true
      assert.equal((await createPublishHandler()(request('start', await confirmationDigest(row)))).status, 423)
      assert.equal((await createPublishHandler({ id: row.id, revision: 2, account_id: '123' })(request('start', await confirmationDigest(row)))).status, 423)
      assert.equal((await enabled(request('start', 'bad'))).status, 409)
      const review = (await (await enabled(request('review'))).json()).review
      assert.equal(review.publishing_enabled, true)
      assert.equal((await enabled(request('start', review.digest))).status, 200)
      for (let step = 0; step < 4; step++) assert.equal((await enabled(request('continue'))).status, 200)
      assert.equal(row.status, 'published'); assert.equal(writes.length, 2)
    })
    await t.test('explicit exact content confirmation and atomic reservation', async () => {
      reset()
      await assert.rejects(advancePublication(row, 'start', 'invalid'), /CONFIRMATION_REQUIRED/)
      assert.equal(writes.length, 0)
      const snapshot = structuredClone(row), digest = await confirmationDigest(row)
      const results = await Promise.allSettled([advancePublication(snapshot, 'start', digest), advancePublication(snapshot, 'start', digest)])
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
      assert.equal(writes.length, 0)
    })
    await t.test('single image successful lifecycle and duplicate calls', async () => {
      reset(); await start(); await next(); await next(); await next(); await next()
      assert.equal(row.status, 'published'); assert.ok(row.published_at); assert.ok(row.instagram_url)
      assert.equal(writes.length, 2)
      await next(); await start()
      assert.equal(writes.length, 2)
    })
    await t.test('carousel preserves order and persists child IDs before parent', async () => {
      reset('carousel'); await start(); await next(); await next(); await next(); await next()
      assert.deepEqual(row.publish_progress.children, ['1001', '1002'])
      await next()
      assert.equal(writes[2].fields.children, '1001,1002')
      assert.equal(writes[0].fields.is_carousel_item, 'true')
      await next(); await next(); await next()
      assert.equal(row.status, 'published'); assert.equal(writes.length, 4)
    })
    await t.test('lost publish response never resends, even when reconciliation says FINISHED', async () => {
      reset(); await start(); await next(); await next(); loseWrite = '/media_publish'
      await assert.rejects(next())
      assert.equal(row.status, 'publish_unknown')
      await assert.rejects(next(), /DRAFT_CONFLICT/)
      await advancePublication(row, 'reconcile')
      assert.equal(writes.length, 2); assert.equal(row.status, 'publish_unknown')
      containerState = 'PUBLISHED'; await advancePublication(row, 'reconcile')
      assert.equal(row.error_code, 'PUBLISHED_ID_UNRESOLVED'); assert.equal(writes.length, 2)
    })
    await t.test('lost container response locks attempt instead of recreating', async () => {
      reset(); await start(); loseWrite = '/media'
      await assert.rejects(next()); await assert.rejects(next())
      assert.equal(writes.length, 1); assert.equal(row.status, 'publish_unknown')
    })
    await t.test('metadata failure recovers with GET only', async () => {
      reset(); await start(); await next(); await next(); await next(); metadataFailure = true
      await assert.rejects(next()); assert.equal(row.error_code, 'METADATA_PENDING')
      metadataFailure = false; await next()
      assert.equal(row.status, 'published'); assert.equal(writes.length, 2)
    })
    await t.test('integrity and account changes fail before container creation', async () => {
      reset(); corrupt = true; await assert.rejects(start(), /PUBLIC_IMAGE_UNAVAILABLE/); assert.equal(writes.length, 0)
      reset(); account = '456'; await assert.rejects(start(), /INSTAGRAM_ACCOUNT_CHANGED/); assert.equal(writes.length, 0)
    })
    await t.test('polling rate and non-ready containers prevent publishing', async () => {
      reset(); await start(); await next(); containerState = 'IN_PROGRESS'; await next()
      await assert.rejects(next(), /POLL_TOO_SOON/); assert.equal(writes.length, 1)
      row.publish_progress.last_poll = '2000-01-01T00:00:00Z'; containerState = 'EXPIRED'
      await assert.rejects(next(), /CONTAINER_NOT_READY/); assert.equal(writes.length, 1)
    })
  } finally { globalThis.fetch = saved.fetch; globalThis.Deno = saved.Deno }
})
