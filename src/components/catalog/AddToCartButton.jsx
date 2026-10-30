import { useState } from 'react'
import { useCart } from '../../hooks/useCart'
import { MAX_CART_PRODUCTS, MAX_ITEM_QUANTITY } from '../../utils/cart'

export default function AddToCartButton({ product }) {
  const { items, addProduct, submitting } = useCart()
  const [added, setAdded] = useState(false)
  const quantity = items.find((item) => item.product_id === product.id)?.quantity ?? 0
  const unavailable = product.availability === 'out_of_stock'
  const atLimit = quantity >= MAX_ITEM_QUANTITY || (!quantity && items.length >= MAX_CART_PRODUCTS)

  return (
    <div className="add-to-cart">
      <button type="button" className="button" disabled={submitting || unavailable || atLimit} onClick={() => { addProduct(product.id); setAdded(true) }}>
        {unavailable ? 'Agotado' : atLimit ? 'Límite del carrito alcanzado' : 'Agregar al carrito'}
      </button>
      <span className="cart-feedback" role="status">{added && quantity > 0 ? `${quantity} en tu carrito` : ''}</span>
    </div>
  )
}
