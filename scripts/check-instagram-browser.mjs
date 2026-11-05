import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

// All remote traffic is intercepted. No real Supabase or Meta operation is performed.
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co'
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test'
const executablePath = process.env.BROWSER_PATH || ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', '/usr/bin/chromium'].find(existsSync)
if (!executablePath) throw new Error('Set BROWSER_PATH to Chromium.')
const server = await createServer({ server: { host: '127.0.0.1', port: 5181, strictPort: true } })
await server.listen()
const browser = await chromium.launch({ executablePath, headless: true })
const productId = '11111111-1111-4111-8111-111111111111'
const adminId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const photos = ['22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'].map((id, index) => ({ id, product_id: productId, storage_path: `products/${productId}/${index}.webp`, sort_order: index }))
const product = { id: productId, name: 'Anillo de prueba', price: 125, description: 'Acero dorado', images: photos }
let draft
const remoteCalls = []
const errors = []
const uploads = []
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: adminId, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.test`
  await context.addInitScript(({ token, adminId }) => localStorage.setItem('sb-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'test', expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user: { id: adminId, email: 'admin@example.com', role: 'authenticated', aud: 'authenticated' } })), { token, adminId })
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  // Generate an actual WebP source locally; the application must turn it into JPEG.
  const webp = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 700
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#bfa15c'; ctx.fillRect(0, 0, 400, 700)
    return canvas.toDataURL('image/webp').split(',')[1]
  }), 'base64')
  await context.route('**/*', async (route) => {
    const request = route.request(); const url = new URL(request.url())
    if (url.hostname === '127.0.0.1') return route.continue()
    remoteCalls.push(url.pathname)
    if (url.hostname !== 'test.supabase.co') return route.abort()
    const respond = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (url.pathname === '/rest/v1/admin_users') return respond({ user_id: adminId })
    if (url.pathname === '/rest/v1/products') return respond([product])
    if (url.pathname === '/rest/v1/instagram_posts') return respond(draft ? [draft] : [])
    if (url.pathname.includes('/public/product-images/')) return route.fulfill({ body: webp, contentType: 'image/webp', headers: { 'Access-Control-Allow-Origin': '*' } })
    if (url.pathname.includes('/public/instagram-prepared/')) return route.fulfill({ body: uploads[0], contentType: 'image/jpeg', headers: { 'Access-Control-Allow-Origin': '*' } })
    if (url.pathname === '/rest/v1/rpc/save_instagram_draft') {
      const input = request.postDataJSON()
      draft = structuredClone({ id: input.p_id, revision: input.p_revision + 1, mode: input.p_mode, product_ids: input.p_product_ids, image_ids: input.p_image_ids, caption: input.p_caption, template: input.p_template, status: 'draft', prepared_images: [], products: [product], images: input.p_image_ids.map((id) => photos.find((image) => image.id === id)), created_at: new Date().toISOString() })
      return respond(draft)
    }
    if (url.pathname === '/functions/v1/instagram-publish') {
      assert.equal(request.headers().authorization, `Bearer ${token}`)
      assert.equal(url.searchParams.get('action'), 'review')
      return respond({ review: { id: draft.id, revision: draft.revision, account_id: '17841465479111585', username: 'prartjewelry', caption: draft.caption, image_count: draft.image_ids.length, digest: 'simulated', publishing_enabled: true } })
    }
    if (url.pathname === '/functions/v1/instagram-prepare') {
      assert.equal(request.headers().authorization, `Bearer ${token}`)
      const action = url.searchParams.get('action')
      if (action === 'delete') { draft = undefined; return respond({ deleted: true }) }
      if (action === 'check') return respond({ access: { account_id: '12345', username: 'prartjewelry', checked_at: new Date().toISOString() } })
      if (action === 'begin') {
        draft.status = 'preparing'
        draft.prepared_images = draft.images.map((image) => ({ image_id: image.id, path: `${draft.id}/${draft.revision}/${image.id}.jpg` }))
      } else if (action === 'upload') {
        const bytes = request.postDataBuffer()
        assert.equal(request.headers()['content-type'], 'image/jpeg')
        assert.equal(bytes[0], 255); assert.equal(bytes[1], 216)
        uploads.push(bytes)
        draft.prepared_images.find((image) => image.image_id === url.searchParams.get('image_id')).sha256 = 'test-digest'
      } else if (action === 'finish') { draft.status = 'prepared'; draft.permission_checked_at = new Date().toISOString() }
      return respond({ draft })
    }
    errors.push(`Unexpected remote endpoint ${url.pathname}`)
    return route.abort()
  })
  await page.goto('http://127.0.0.1:5181/#/admin/instagram')
  await page.getByLabel('Anillo de prueba ·').check()
  await page.getByLabel('Seleccionar foto').nth(0).check()
  await page.getByLabel('Seleccionar foto').nth(1).check()
  await page.getByRole('combobox').selectOption('carousel')
  await page.getByRole('button', { name: 'Subir foto 2' }).click()
  await page.getByRole('button', { name: 'Generar descripción' }).click()
  assert.match(await page.getByLabel('Descripción editable').inputValue(), /Acero dorado/)
  await page.getByRole('button', { name: 'Guardar borrador' }).click()
  await page.getByText('Borrador guardado. No se envió contenido a Instagram.').waitFor()
  assert.deepEqual(draft.image_ids, [photos[1].id, photos[0].id])
  assert.ok(!remoteCalls.some((path) => path.includes('/functions/')))
  const savedId = draft.id
  const savedCaption = draft.caption
  const savedPath = draft.images[0].storage_path
  photos[1].storage_path = `products/${productId}/changed-catalog.webp`
  await page.reload()
  await page.getByRole('button', { name: 'Abrir borrador' }).click()
  assert.equal(await page.getByLabel('Descripción editable').inputValue(), savedCaption)
  assert.equal(await page.locator('.instagram-caption').textContent(), savedCaption)
  assert.ok((await page.locator('.instagram-preview > img').getAttribute('src')).endsWith(savedPath), 'saved preview must not switch to changed catalog image')
  await page.waitForFunction(() => { const image = document.querySelector('.instagram-preview > img'); return image?.complete && image.naturalWidth > 0 })
  await page.getByLabel('Descripción editable').fill('Descripción editada y recuperada')
  await page.getByRole('button', { name: 'Guardar borrador' }).click()
  await page.getByText('Borrador guardado. No se envió contenido a Instagram.').waitFor()
  assert.equal(draft.id, savedId)
  assert.equal(draft.revision, 2)
  await page.reload()
  await page.getByRole('button', { name: 'Abrir borrador' }).click()
  assert.equal(await page.getByLabel('Descripción editable').inputValue(), 'Descripción editada y recuperada')
  assert.equal(await page.locator('.instagram-caption').textContent(), draft.caption)
  await page.getByRole('button', { name: 'Preparar imágenes y verificar permisos' }).click()
  await page.getByText('Preparación completa.', { exact: false }).waitFor()
  assert.equal(uploads.length, 2)
  assert.equal(draft.status, 'prepared')
  const beforeAccessCheck = JSON.stringify(draft)
  await page.getByRole('button', { name: 'Verificar permisos de publicación' }).click()
  await page.getByText('Acceso de publicación y cuota disponibles', { exact: false }).waitFor()
  assert.equal(JSON.stringify(draft), beforeAccessCheck)
  await page.waitForFunction(() => { const image = document.querySelector('.instagram-preview > img'); return image?.complete && image.naturalWidth === 1080 })
  assert.ok((await page.locator('.instagram-preview > img').getAttribute('src')).endsWith(draft.prepared_images[0].path))
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click()
  assert.ok((await page.locator('.instagram-preview > img').getAttribute('src')).endsWith(draft.prepared_images[1].path))
  assert.equal(await page.getByRole('button', { name: 'Publicar en Instagram', exact: true }).isDisabled(), true)
  assert.ok(!remoteCalls.some((path) => path.includes('instagram-publish')))
  await page.getByRole('button', { name: 'Revisar antes de publicar' }).click()
  const review = page.getByRole('region', { name: 'Revisión de publicación' })
  await review.waitFor()
  assert.equal(await review.locator('.instagram-caption').textContent(), draft.caption)
  await page.getByLabel('He revisado las fotografías, su orden y la descripción.').check()
  assert.equal(await page.getByRole('button', { name: 'Publicar en Instagram', exact: true }).isDisabled(), false)
  const requestsBeforeCancel = remoteCalls.length
  page.once('dialog', dialog => dialog.dismiss())
  await page.getByRole('button', { name: 'Publicar en Instagram', exact: true }).click()
  assert.equal(remoteCalls.length, requestsBeforeCancel, 'cancel must never send a publication request')
  assert.equal(JSON.stringify(draft), beforeAccessCheck)
  // Inspect the real browser-produced JPEG dimensions and white letterboxing.
  const info = await page.evaluate(async (data) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${data}`)).blob())
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1080
    const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0)
    const corner = [...ctx.getImageData(0, 0, 1, 1).data]
    return { width: bitmap.width, height: bitmap.height, corner }
  }, uploads[0].toString('base64'))
  assert.equal(info.width, 1080); assert.equal(info.height, 1080)
  assert.ok(info.corner.slice(0, 3).every((value) => value >= 250))
  const editorWidth = await page.getByLabel('Descripción editable').evaluate(node => node.getBoundingClientRect().width)
  assert.ok(editorWidth > 500, `desktop editor should use full width, got ${editorWidth}`)
  const historyWidth = await page.locator('.instagram-history').evaluate(node => node.getBoundingClientRect().width)
  assert.ok(historyWidth > 500, `desktop history should use full width, got ${historyWidth}`)
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'mobile overflow')
  page.once('dialog', dialog => dialog.dismiss())
  await page.getByRole('button', { name: 'Eliminar borrador', exact: true }).first().click()
  assert.ok(draft)
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Eliminar borrador', exact: true }).first().click()
  await page.getByText('Borrador eliminado. Las fotografías originales se conservaron.').waitFor()
  assert.equal(draft, undefined)
  assert.equal(await page.locator('.instagram-history article').count(), 0)
  assert.deepEqual(errors, [])
  console.log('Instagram browser checks passed: selection, ordering, save/reload/edit/reload, rendered photos and caption, saved snapshot, WebP → JPEG, preparation, review-gated publishing, cancel without sending, mobile layout. All remote responses simulated.')
} finally { await browser.close(); await server.close() }
