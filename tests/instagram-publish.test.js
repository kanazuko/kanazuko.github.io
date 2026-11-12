import { test } from 'node:test'
import assert from 'node:assert/strict'
import { advancePublication as advance, confirmationDigest } from '../supabase/functions/instagram-publish/engine.ts'
import { createPublishHandler } from '../supabase/functions/instagram-publish/handler.ts'
import { createInstagramLedger } from './helpers/instagram-ledger.js'
const advancePublication = (post, action, digest) => advance(post, action, digest, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')

test('publication engine with simulated Meta only', async t => {
  const saved = { fetch: globalThis.fetch, Deno: globalThis.Deno }
  globalThis.Deno = { env: { get: name => ({ SUPABASE_URL: 'https://test.supabase.co', SUPABASE_ANON_KEY: 'fake-anon', SUPABASE_SERVICE_ROLE_KEY: 'fake-service', INSTAGRAM_ACCESS_TOKEN: 'fake-token' })[name] } }
  const bytes = new Uint8Array([255, 216, 1, 255, 217])
  const sha256 = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex')
  const ledger = createInstagramLedger()
  let row, writes, tick, loseWrite, metadataFailure, containerState, account, corrupt, readFailure, failPublicationSave, failGuard, failAuthorization, admin = true
  function reset(mode = 'single') {
    tick = 0; writes = []; loseWrite = ''; metadataFailure = false; containerState = 'FINISHED'; account = '123'; corrupt = false
    ledger.reset()
    ledger.events.length = 0; readFailure = false; failPublicationSave = false; failGuard = false; failAuthorization = false
    row = { id: '11111111-1111-4111-8111-111111111111', revision: 1, status: 'prepared', updated_at: '0', mode, caption: 'Joya', instagram_account_id: '123', publish_progress: {}, images: (mode === 'single' ? ['a'] : ['a', 'b']).map(id => ({ id })) }
    row.prepared_images = row.images.map(({ id }) => ({ image_id: id, path: `${row.id}/1/${id}.jpg`, sha256, width: 1080, height: 1080, bytes: bytes.length }))
  }
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input)
    if (failGuard && url.pathname === '/rest/v1/rpc/begin_instagram_request') return Response.json({}, { status: 503 })
    if (failAuthorization && url.pathname === '/rest/v1/instagram_events') return Response.json({}, { status: 503 })
    const ledgerResponse = await ledger.fetch(url, options)
    if (ledgerResponse) return ledgerResponse
    if (url.pathname === '/auth/v1/user') return Response.json({ id: 'admin', is_anonymous: false })
    if (url.pathname === '/rest/v1/admin_users') return Response.json(admin ? [{ user_id: 'admin' }] : [])
    if (url.pathname === '/rest/v1/instagram_posts') {
      if (!options.method || options.method === 'GET') return Response.json([row])
      assert.equal(options.method, 'PATCH')
      if (failPublicationSave && JSON.parse(options.body).instagram_id) { failPublicationSave = false; return Response.json({}, { status: 503 }) }
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
    if (url.searchParams.get('fields') === 'status_code') {
      if (readFailure) throw new Error('temporary read failure')
      return Response.json({ status_code: containerState })
    }
    if (metadataFailure) throw new Error('metadata network failure')
    return Response.json({ id: row.instagram_id, permalink: 'https://www.instagram.com/p/example/' })
  }
  const start = async () => advancePublication(structuredClone(row), 'start', await confirmationDigest(row))
  const next = async () => advancePublication(structuredClone(row), 'continue')
  try {
    await t.test('production entrypoint enables different drafts for the fixed account, but requires admin and confirmation', async () => {
      let handler
      globalThis.Deno.serve = value => { handler = value }
      await import('../supabase/functions/instagram-publish/index.ts')
      for (const id of ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']) {
        reset(); row.id = id; row.instagram_account_id = '17841465479111585'; account = row.instagram_account_id
        row.prepared_images = row.prepared_images.map(image => ({ ...image, path: `${id}/1/${image.image_id}.jpg` }))
        const request = (action, digest, auth = 'Bearer simulated') => new Request(`https://function.invalid?id=${id}&revision=1&action=${action}`, { method: 'POST', headers: auth ? { Authorization: auth } : {}, body: JSON.stringify({ digest }) })
        assert.equal((await handler(request('review', '', ''))).status, 401)
        admin = false; assert.equal((await handler(request('review'))).status, 403); admin = true
        const review = (await (await handler(request('review'))).json()).review
        assert.equal(review.publishing_enabled, true)
        assert.equal((await handler(request('start', 'bad'))).status, 409)
        assert.equal((await handler(request('start', review.digest))).status, 200)
        for (let step = 0; step < 4; step++) assert.equal((await handler(request('continue'))).status, 200)
        assert.equal(row.status, 'published'); assert.equal(writes.length, 2)
      }
      reset()
      const request = new Request(`https://function.invalid?id=${row.id}&revision=1&action=start`, { method: 'POST', headers: { Authorization: 'Bearer simulated' }, body: JSON.stringify({ digest: await confirmationDigest(row) }) })
      assert.equal((await handler(request)).status, 423); assert.equal(writes.length, 0)
    })
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
      ledger.clearPause()
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
      metadataFailure = false; ledger.clearPause(); await next()
      assert.equal(row.status, 'published'); assert.equal(writes.length, 2)
    })
    await t.test('a successful publish is published immediately; legacy metadata can reconcile without another send', async () => {
      reset(); await start(); await next(); await next(); await next()
      assert.equal(row.status, 'published'); assert.ok(row.instagram_id); assert.equal(row.instagram_url, undefined)
      row.status = 'publishing' // Existing rows created by the previous implementation.
      await advancePublication(row, 'reconcile')
      assert.equal(row.status, 'published'); assert.ok(row.instagram_url); assert.equal(writes.length, 2)
    })
    await t.test('only a checkpoint before any container can be cancelled, including concurrent continuation', async () => {
      reset(); await start()
      const before = structuredClone(row)
      await advancePublication(row, 'cancel')
      assert.equal(row.status, 'prepared'); assert.equal(row.publish_attempt_id, null); assert.equal(writes.length, 0)
      await assert.rejects(advancePublication(before, 'continue'), /DRAFT_CONFLICT/)
      await start(); await next()
      await assert.rejects(advancePublication(row, 'cancel'), /MANUAL_REVIEW_REQUIRED/)
      reset('carousel'); await start(); await next(); await next()
      await assert.rejects(advancePublication(row, 'cancel'), /MANUAL_REVIEW_REQUIRED/)
      reset(); await start(); row.publish_progress.phase = 'working'
      await assert.rejects(advancePublication(row, 'cancel'), /MANUAL_REVIEW_REQUIRED/)
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
    await t.test('failed GET preserves its container and resumes without another creation', async () => {
      reset(); await start(); await next(); const container = row.container_id
      readFailure = true; await assert.rejects(next(), /CONNECTION_UNAVAILABLE/)
      assert.equal(row.status, 'publishing'); assert.equal(row.publish_progress.phase, 'waiting')
      assert.equal(row.container_id, container); assert.equal(writes.length, 1)
      await assert.rejects(next(), /POLL_TOO_SOON/)
      readFailure = false; ledger.clearPause(); row.publish_progress.retry_after = '2000-01-01T00:00:00Z'
      await next(); assert.equal(row.publish_progress.phase, 'ready'); assert.equal(writes.length, 1)
    })
    await t.test('interrupted classified reads can recover; live, legacy and write locks cannot be stolen', async () => {
      reset(); await start(); await next()
      row.publish_progress = { ...row.publish_progress, phase: 'working', operation: { kind: 'read', resume_phase: 'waiting', started_at: new Date().toISOString() } }
      await assert.rejects(next(), /OPERATION_IN_PROGRESS/)
      row.publish_progress.operation.started_at = '2000-01-01T00:00:00Z'
      await next(); assert.equal(row.publish_progress.phase, 'waiting'); assert.equal(writes.length, 1)
      row.publish_progress = { ...row.publish_progress, phase: 'working', operation: { kind: 'write', resume_phase: 'creating', started_at: '2000-01-01T00:00:00Z' } }
      await assert.rejects(next(), /MANUAL_REVIEW_REQUIRED/)
      delete row.publish_progress.operation
      await assert.rejects(next(), /MANUAL_REVIEW_REQUIRED/); assert.equal(writes.length, 1)
    })
    await t.test('a failed initial read can be continued or safely cancelled without orphaning an attempt', async () => {
      reset(); corrupt = true; await assert.rejects(start(), /PUBLIC_IMAGE_UNAVAILABLE/)
      assert.equal(row.status, 'publishing'); assert.equal(row.publish_progress.phase, 'checking')
      corrupt = false; row.publish_progress.retry_after = '2000-01-01T00:00:00Z'; await next()
      assert.equal(row.publish_progress.phase, 'creating'); assert.equal(writes.length, 0)
      await advancePublication(row, 'cancel'); assert.equal(row.status, 'prepared'); assert.equal(row.publish_attempt_id, null)
    })
    await t.test('durable guard failure before fetch never turns an unsent operation into an uncertain write', async () => {
      reset(); await start(); failGuard = true
      await assert.rejects(next(), /DATABASE_UNAVAILABLE/)
      assert.equal(row.status, 'publishing'); assert.equal(row.publish_progress.phase, 'creating'); assert.equal(writes.length, 0)
    })
    await t.test('concurrent continuations create exactly one container', async () => {
      reset(); await start(); const snapshot = structuredClone(row)
      const results = await Promise.allSettled([advancePublication(snapshot, 'continue'), advancePublication(snapshot, 'continue')])
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1); assert.equal(writes.length, 1)
    })
    await t.test('successful remote publication followed by database failure is never resent', async () => {
      reset(); await start(); await next(); await next(); failPublicationSave = true
      await assert.rejects(next(), /DATABASE_UNAVAILABLE/)
      assert.equal(row.status, 'publish_unknown'); assert.equal(writes.length, 2)
      const publishedEvent = ledger.events.find(event => event.p_operation === 'publish_media')
      assert.equal(publishedEvent.p_remote_id, '1002')
      await assert.rejects(next(), /DRAFT_CONFLICT/)
      await advancePublication(row, 'reconcile'); assert.equal(writes.length, 2)
    })
    await t.test('authorization and each Meta request retain actor, attempt and safe diagnostics only', async () => {
      reset(); const digest = await confirmationDigest(row)
      await start(); await next(); await next(); await next()
      const authorization = ledger.events.find(event => event.operation === 'publication_authorized')
      assert.equal(authorization.actor_id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
      assert.equal(authorization.attempt_id, row.publish_attempt_id); assert.equal(authorization.digest, digest)
      const requests = ledger.events.filter(event => event.p_method)
      assert.equal(requests.length, 8)
      assert.ok(requests.every(event => event.p_actor === authorization.actor_id && event.p_attempt === authorization.attempt_id))
      assert.ok(requests.some(event => event.p_container_status === 'FINISHED'))
      assert.equal(JSON.stringify(ledger.events).includes('fake-token'), false)
      const before = structuredClone(row); before.instagram_url = 'https://www.instagram.com/p/existing/'
      row = structuredClone(before); const count = requests.length
      await next(); assert.deepEqual(row, before)
      assert.equal(ledger.events.filter(event => event.p_method).length, count)
    })
    await t.test('failed authorization audit sends nothing and retains original author before recovery', async () => {
      reset(); failAuthorization = true
      await assert.rejects(start(), /DATABASE_UNAVAILABLE/)
      assert.equal(ledger.events.length, 0); assert.equal(writes.length, 0)
      assert.equal(row.publish_progress.authorization.actor_id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
      assert.ok(row.publish_progress.authorization.authorized_at)
      failAuthorization = false; row.publish_progress.retry_after = '2000-01-01T00:00:00Z'
      await next()
      assert.equal(ledger.events[0].operation, 'confirmation_resumed')
      assert.equal(ledger.events[0].digest, row.publish_progress.digest)
      assert.equal(row.publish_progress.phase, 'creating'); assert.equal(writes.length, 0)
    })
  } finally { globalThis.fetch = saved.fetch; globalThis.Deno = saved.Deno }
})
