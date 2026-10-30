import { supabase } from '../lib/supabase'

export const ORDER_STATUSES = {
  pending: 'Pendiente',
  purchasing: 'En compra / preparación',
  ready: 'Listo para entregar',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
}

const REQUEST_KEY = 'prartjewelry.checkout.v1'
let lastRequest = null

export async function placeOrder(customer, items) {
  const payload = { customer, items }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)))
  const fingerprint = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  try { lastRequest = JSON.parse(sessionStorage.getItem(REQUEST_KEY)) || lastRequest } catch { /* In-memory retries still work when storage is blocked. */ }
  if (lastRequest?.fingerprint !== fingerprint) lastRequest = { fingerprint, id: crypto.randomUUID() }
  try { sessionStorage.setItem(REQUEST_KEY, JSON.stringify(lastRequest)) } catch { /* No customer details are stored in the browser. */ }
  const { data, error } = await supabase.rpc('place_catalog_order', { p_request_id: lastRequest.id, p_customer: customer, p_items: items })
  if (error) throw error
  return data
}

export function finishCheckout() {
  lastRequest = null
  try { sessionStorage.removeItem(REQUEST_KEY) } catch { /* Storage may be unavailable. */ }
}

export async function getAdminOrders({ status = '', page = 0 } = {}) {
  let query = supabase.from('orders').select('id, order_number, customer_name, phone, email, delivery_address, status, total, created_at, email_sent_at', { count: 'exact' }).order('created_at', { ascending: false }).order('id')
  if (status) query = query.eq('status', status)
  const { data, count, error } = await query.range(page * 25, page * 25 + 24)
  if (error) throw error
  return { orders: data, count }
}

export async function getAdminOrderItems(orderId) {
  const { data, error } = await supabase.from('order_items').select('id, product_id, product_name, product_sku, material, color, size, availability, unit_price, quantity').eq('order_id', orderId).order('product_name')
  if (error) throw error
  return data
}

export async function updateOrderStatus(id, status, previousStatus) {
  const { data, error } = await supabase.from('orders').update({ status }).eq('id', id).eq('status', previousStatus).select('id, status').maybeSingle()
  if (error) throw error
  if (!data) throw new Error('El pedido cambió en otra sesión. Actualiza la lista antes de continuar.')
  return data
}
