import { useEffect, useState } from 'react'
import { CartContext } from './cartContext'
import { CART_STORAGE_KEY, MAX_CART_PRODUCTS, MAX_ITEM_QUANTITY, normalizeCart } from '../utils/cart'

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try { return normalizeCart(JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]')) }
    catch { return [] }
  })
  const [storageError, setStorageError] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let failed = false
    let active = true
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items))
    } catch { failed = true }
    Promise.resolve().then(() => { if (active) setStorageError(failed) })
    return () => { active = false }
  }, [items])

  function addProduct(productId) {
    if (submitting) return
    setItems((current) => {
      const existing = current.find((item) => item.product_id === productId)
      if (existing) return current.map((item) => item.product_id === productId ? { ...item, quantity: Math.min(MAX_ITEM_QUANTITY, item.quantity + 1) } : item)
      if (current.length >= MAX_CART_PRODUCTS) return current
      return [...current, { product_id: productId, quantity: 1 }]
    })
  }

  function setQuantity(productId, quantity) {
    if (submitting || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_ITEM_QUANTITY) return
    setItems((current) => current.map((item) => item.product_id === productId ? { ...item, quantity } : item))
  }

  function removeProduct(productId) {
    if (!submitting) setItems((current) => current.filter((item) => item.product_id !== productId))
  }

  return <CartContext.Provider value={{ items, addProduct, setQuantity, removeProduct, clearCart: () => setItems([]), count: items.reduce((sum, item) => sum + item.quantity, 0), storageError, submitting, setSubmitting }}>{children}</CartContext.Provider>
}
