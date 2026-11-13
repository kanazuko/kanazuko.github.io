import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

// All external requests are intercepted: no real publications or database writes.
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co'
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_browser_test'
const executablePath = process.env.BROWSER_PATH || ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', '/usr/bin/chromium'].find(existsSync)
if (!executablePath) throw new Error('Set BROWSER_PATH to Chrome or Chromium.')
const server = await createServer({ server: { host: '127.0.0.1', port: 5181, strictPort: true } })
await server.listen()
let browser
try {
  browser = await chromium.launch({ executablePath, headless: true })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const adminId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const productId = '11111111-1111-4111-8111-111111111111'
  const token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: adminId, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.test`
  await context.addInitScript(({ token, adminId }) => localStorage.setItem('sb-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'test', expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user: { id: adminId, role: 'authenticated', aud: 'authenticated' } })), { token, adminId })
  let saved = null
  const unexpected = []
  const errors = []
  await context.route('**/*', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.hostname === '127.0.0.1') return route.continue()
    if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.abort()
    const respond = body => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
    if (url.hostname === 'test.supabase.co') {
      if (url.pathname === '/rest/v1/admin_users') return respond({ user_id: adminId })
      if (url.pathname === '/rest/v1/products') return respond([{ id: productId, name: 'Anillo de prueba', category: { id: 'rings', name: 'Anillos' }, is_featured: true, price: 125, description: 'Acero dorado', images: [{ id: 'photo', product_id: productId, storage_path: `products/${productId}/photo.png`, sort_order: 0 }] }, { id: 'other', name: 'Collar publicado', category: { id: 'necklaces', name: 'Collares' }, images: [] }])
      if (url.pathname === '/rest/v1/instagram_posts') return respond(url.searchParams.get('select') === '*' ? [] : [{ id: 'api-post', product_ids: ['other'] }])
      if (url.pathname === '/rest/v1/rpc/instagram_runtime_status') return respond({ maintenance: true, frontend_ready: false })
      if (url.pathname === '/rest/v1/instagram_manual_posts') {
        if (request.method() === 'GET') return respond(saved ? [saved] : [])
        saved = { id: '22222222-2222-4222-8222-222222222222', ...request.postDataJSON(), updated_at: new Date().toISOString() }
        return respond(saved)
      }
      if (url.pathname.includes('/public/product-images/')) return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'), headers: { 'Access-Control-Allow-Origin': '*' } })
    }
    unexpected.push(url.pathname)
    return route.abort()
  })
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('http://127.0.0.1:5181/#/admin/instagram')
  await page.getByLabel('Categoría', { exact: true }).selectOption('necklaces')
  assert.match(await page.getByLabel('Producto', { exact: true }).innerText(), /✓ Publicado · Collar publicado/)
  assert.doesNotMatch(await page.getByLabel('Producto', { exact: true }).innerText(), /Anillo de prueba/)
  await page.getByLabel('Categoría', { exact: true }).selectOption('rings')
  await page.getByLabel('Producto', { exact: true }).selectOption(productId)
  const original = page.getByRole('link', { name: 'Abrir foto 1 original' })
  assert.equal(await original.getAttribute('target'), '_blank')
  assert.equal(await original.getAttribute('href'), await original.locator('img').getAttribute('src'))
  assert.equal(await original.locator('img').getAttribute('draggable'), 'true')
  await page.getByRole('button', { name: 'Generar descripción' }).click()
  assert.match(await page.getByLabel('Descripción editable').inputValue(), /Anillo de prueba/)
  await page.getByRole('button', { name: 'Guardar borrador' }).click()
  await page.getByRole('status').filter({ hasText: 'Borrador guardado' }).waitFor()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar foto 1' }).click()
  assert.match((await download).suggestedFilename(), /\.png$/)
  await page.getByLabel('Enlace de la publicación').fill('https://evil.test/p/ABC/')
  await page.getByLabel('Ya publiqué').check()
  await page.getByRole('button', { name: 'Marcar como completado' }).click()
  await page.getByRole('alert').waitFor()
  assert.equal(saved.completed_at, null)
  await page.getByLabel('Enlace de la publicación').fill('https://instagram.com/p/ABC/?igsh=tracking')
  await page.getByRole('button', { name: 'Marcar como completado' }).click()
  await page.getByRole('status').filter({ hasText: 'Producto marcado como completado' }).waitFor()
  assert.equal(saved.instagram_url, 'https://www.instagram.com/p/ABC/')
  assert.ok(saved.completed_at)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await page.reload()
  await page.getByRole('link', { name: 'Ver en Instagram', exact: true }).waitFor()
  await page.getByLabel('Producto', { exact: true }).selectOption(productId)
  assert.match(await page.getByLabel('Descripción editable').inputValue(), /Acero dorado/)
  assert.equal(await page.getByLabel('Enlace de la publicación').inputValue(), saved.instagram_url)
  assert.match(await page.getByLabel('Producto', { exact: true }).innerText(), /✓ Publicado · Anillo de prueba/)
  await page.getByRole('button', { name: 'Publicación por API', exact: true }).click()
  await page.getByRole('heading', { name: 'Instagram API with Unified Login' }).waitFor()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Publicación manual', exact: true }).click()
  await page.getByLabel('Producto', { exact: true }).waitFor()
  assert.deepEqual(unexpected, [], 'No Meta endpoints, API functions, or unexpected external requests')
  assert.deepEqual(errors, [])
  console.log('Manual Instagram browser flow passed: draft, download, invalid link, completion, reload, mobile layout, and no Meta calls.')
} finally {
  await browser?.close()
  await server.close()
}
