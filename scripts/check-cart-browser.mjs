import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

// This check intercepts every external request. No real orders or emails are sent.
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co'
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_browser_test'
const executablePath = process.env.BROWSER_PATH || [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/chromium', '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(existsSync)
if (!executablePath) throw new Error('Set BROWSER_PATH to a local Chrome/Chromium executable.')
const server = await createServer({ server: { host: '127.0.0.1', port: 5179, strictPort: true } })
await server.listen()
const browser = await chromium.launch({ executablePath, headless: true })
const screenshots = await mkdtemp(join(tmpdir(), 'prart-cart-'))
const errors = []
const productId = '11111111-1111-4111-8111-111111111111'
const adminId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const orderId = '33333333-3333-4333-8333-333333333333'
const product = { id: productId, name: 'Anillo de prueba', slug: 'anillo-prueba', price: 125.5, availability: 'available', material: 'Acero', color: 'Dorado', size: '7', images: [], tags: [], attributes: {}, category: null }
const order = { id: orderId, order_number: 42, customer_name: 'Cliente de prueba', delivery_address: 'Colonia Centro', phone: '5512345678', email: 'cliente@example.com', status: 'pending', total: 376.5, created_at: '2026-10-30T12:00:00Z', email_sent_at: null }
const rpcCalls = []
let failNextOrder = true

async function mock(route) {
  const url = new URL(route.request().url())
  if (url.hostname === '127.0.0.1') return route.continue()
  if (url.hostname !== 'test.supabase.co') return route.abort()
  const respond = (body, status = 200, headers = {}) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers })
  if (url.pathname === '/rest/v1/products') return respond(route.request().headers().accept?.includes('vnd.pgrst.object') ? product : [product])
  if (url.pathname === '/rest/v1/categories') return respond([])
  if (url.pathname === '/rest/v1/rpc/place_catalog_order') {
    rpcCalls.push(route.request().postDataJSON())
    if (failNextOrder) { failNextOrder = false; return respond({ message: 'Temporary network issue' }, 503) }
    return respond({ order_number: 42, total: 376.5 })
  }
  if (url.pathname === '/rest/v1/admin_users') return respond({ user_id: adminId })
  if (url.pathname === '/rest/v1/orders') {
    if (route.request().method() === 'PATCH') {
      order.status = route.request().postDataJSON().status
      return respond({ id: order.id, status: order.status })
    }
    return respond([order], 200, { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' })
  }
  if (url.pathname === '/rest/v1/order_items') return respond([{ id: productId, product_id: productId, product_name: product.name, product_sku: 'AN-01', material: 'Acero', color: 'Dorado', size: '7', availability: 'available', unit_price: 125.5, quantity: 3 }])
  throw new Error(`Unexpected external request: ${url.pathname}`)
}

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await context.route('**/*', mock)
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('http://127.0.0.1:5179/#/producto/anillo-prueba')
  await page.getByRole('button', { name: 'Agregar al carrito' }).click()
  await page.getByRole('link', { name: 'Carrito, 1 productos' }).click()
  await page.getByLabel('Cantidad').selectOption('3')
  await page.reload()
  await page.getByRole('button', { name: 'Finalizar compra' }).waitFor()
  assert.equal(await page.getByLabel('Cantidad').inputValue(), '3')
  await page.getByLabel('Nombre *', { exact: true }).fill('Cliente de prueba')
  await page.getByLabel('Dirección de entrega aproximada').fill('Colonia Centro')
  await page.getByLabel('Teléfono').fill('5512345678')
  await page.getByLabel('Correo').fill('cliente@example.com')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'mobile overflow')
  await page.screenshot({ path: join(screenshots, 'cart-mobile.png'), fullPage: true })
  await page.setViewportSize({ width: 1365, height: 900 })
  const columns = await page.locator('.checkout-form').evaluate((element) => getComputedStyle(element).gridTemplateColumns)
  assert.equal(columns.split(' ').length, 1, 'checkout must keep a single form column')
  await page.screenshot({ path: join(screenshots, 'cart-desktop.png'), fullPage: true })
  await page.getByRole('button', { name: 'Finalizar compra' }).click()
  await page.getByRole('alert').filter({ hasText: 'No pudimos confirmar' }).waitFor()
  assert.equal(await page.getByLabel('Cantidad').inputValue(), '3')
  await page.getByRole('button', { name: 'Finalizar compra' }).click()
  await page.getByRole('heading', { name: '¡Gracias por tu pedido!' }).waitFor()
  assert.equal(rpcCalls.length, 2)
  assert.equal(rpcCalls[0].p_request_id, rpcCalls[1].p_request_id)
  assert.equal(rpcCalls[1].p_items[0].quantity, 3)
  assert.equal(rpcCalls[1].p_items[0].expected_price, 125.5)
  assert.equal(await page.evaluate(() => localStorage.getItem('prartjewelry.cart.v1')), '[]')
  await page.getByRole('link', { name: 'Seguir viendo el catálogo' }).click()
  await page.getByRole('heading', { name: 'Catálogo', exact: true }).waitFor()
  await page.getByRole('link', { name: 'Carrito, 0 productos' }).click()
  await page.getByText('Tu carrito está vacío.').waitFor()
  await context.close()

  const admin = await browser.newContext({ viewport: { width: 1365, height: 900 } })
  await admin.route('**/*', mock)
  const payload = { sub: adminId, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }
  const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.test`
  await admin.addInitScript(({ token, adminId }) => {
    localStorage.setItem('sb-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'test', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user: { id: adminId, email: 'admin@example.com', aud: 'authenticated', role: 'authenticated' } }))
  }, { token, adminId })
  const adminPage = await admin.newPage()
  adminPage.on('pageerror', (error) => errors.push(error.message))
  await adminPage.goto('http://127.0.0.1:5179/#/admin/pedidos')
  await adminPage.getByText('1 pedidos encontrados.').waitFor()
  await adminPage.getByRole('button', { name: 'Ver detalle' }).click()
  await adminPage.getByText('SKU: AN-01', { exact: false }).waitFor()
  await adminPage.getByLabel('Estado del pedido').selectOption('purchasing')
  await adminPage.getByText('Pedido #42: En compra / preparación.').waitFor()
  await adminPage.getByRole('button', { name: 'Ocultar detalle' }).waitFor()
  assert.equal(order.status, 'purchasing')
  assert.equal(await adminPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'admin desktop overflow')
  await adminPage.screenshot({ path: join(screenshots, 'orders-desktop.png'), fullPage: true })
  await adminPage.setViewportSize({ width: 390, height: 844 })
  await adminPage.screenshot({ path: join(screenshots, 'orders-mobile.png'), fullPage: true })
  const overflow = await adminPage.evaluate(() => [...document.querySelectorAll('body *')].filter((element) => element.getBoundingClientRect().right > window.innerWidth + 1).map((element) => element.className || element.tagName))
  assert.equal(await adminPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `admin mobile overflow: ${overflow.join(', ')}; screenshot: ${screenshots}`)
  assert.deepEqual(errors, [], 'no uncaught browser errors')
  console.log(`Browser checks passed: cart persistence, mobile/desktop layout, checkout retry, receipt, admin detail and status. Screenshots: ${screenshots}`)
} finally {
  await browser.close()
  await server.close()
}
