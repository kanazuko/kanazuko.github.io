export const CART_STORAGE_KEY = 'prartjewelry.cart.v1'
export const MAX_CART_PRODUCTS = 50
export const MAX_ITEM_QUANTITY = 99

export function normalizeCart(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  return value.filter((item) => {
    if (!item || typeof item.product_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.product_id)
      || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_ITEM_QUANTITY || seen.has(item.product_id)) return false
    seen.add(item.product_id)
    return true
  }).slice(0, MAX_CART_PRODUCTS).map(({ product_id, quantity }) => ({ product_id, quantity }))
}

export function cartTotal(items) {
  return items.reduce((total, item) => total + Math.round(Number(item.product?.price ?? 0) * 100) * item.quantity, 0) / 100
}

export function validateCustomer(customer) {
  if (customer.name.trim().length < 2 || customer.name.trim().length > 150) return 'Ingresa tu nombre (entre 2 y 150 caracteres).'
  if (customer.address.trim().length < 5 || customer.address.trim().length > 1000) return 'Ingresa una dirección aproximada de entrega (al menos 5 caracteres).'
  const phone = customer.phone.trim()
  if (!/^[+0-9() .-]+$/.test(phone) || phone.length > 30 || phone.replace(/\D/g, '').length < 7 || phone.replace(/\D/g, '').length > 15) return 'Ingresa un teléfono válido, incluyendo la lada.'
  if (customer.email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim())) return 'Ingresa un correo válido.'
  return ''
}
