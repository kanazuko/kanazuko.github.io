import { useCallback, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import SafeImage from '../components/catalog/SafeImage'
import LoadingState from '../components/feedback/LoadingState'
import { useCart } from '../hooks/useCart'
import { useAsyncData } from '../hooks/useAsyncData'
import { getCartProducts } from '../services/catalogService'
import { finishCheckout, placeOrder } from '../services/orderService'
import { cartTotal, MAX_ITEM_QUANTITY, validateCustomer } from '../utils/cart'
import { formatAvailability, formatCurrency } from '../utils/formatters'

export default function CartPage() {
  const { items, setQuantity, removeProduct, clearCart, storageError, submitting, setSubmitting } = useCart()
  const [customer, setCustomer] = useState({ name: '', address: '', phone: '', email: '' })
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState(null)
  const [revision, setRevision] = useState(0)
  const requestInFlight = useRef(false)
  const ids = JSON.stringify(items.map((item) => item.product_id).sort())
  const loader = useCallback(async () => ({ ids, revision, products: await getCartProducts(JSON.parse(ids)) }), [ids, revision])
  const products = useAsyncData(loader)
  const ready = !products.loading && !products.error && products.data?.ids === ids && products.data?.revision === revision
  const lines = items.map((item) => ({ ...item, product: products.data?.products.find((product) => product.id === item.product_id) }))
  const unavailable = lines.some((item) => !item.product || item.product.availability === 'out_of_stock')
  const total = cartTotal(lines)

  function changeCustomer(event) {
    setCustomer((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  async function submit(event) {
    event.preventDefault()
    if (requestInFlight.current || submitting || !ready || unavailable || !items.length) return
    const validationError = validateCustomer(customer)
    if (validationError) { setError(validationError); return }
    requestInFlight.current = true
    setSubmitting(true)
    setError('')
    try {
      const saved = await placeOrder(
        { name: customer.name.trim(), address: customer.address.trim(), phone: customer.phone.trim(), email: customer.email.trim().toLowerCase() },
        lines.map((item) => ({ product_id: item.product_id, quantity: item.quantity, expected_price: Number(item.product.price) })).sort((a, b) => a.product_id.localeCompare(b.product_id)),
      )
      setReceipt(saved)
      clearCart()
      finishCheckout()
      setCustomer({ name: '', address: '', phone: '', email: '' })
      window.scrollTo({ top: 0, behavior: 'instant' })
    } catch (saveError) {
      setError(saveError.code === 'P0001' ? saveError.message : 'No pudimos confirmar el pedido. Conservamos tu carrito; intenta finalizar de nuevo. Si ya se guardó, el reintento recuperará el mismo folio.')
    } finally {
      requestInFlight.current = false
      setSubmitting(false)
    }
  }

  if (receipt) return (
    <section className="section container order-confirmation">
      <p className="eyebrow">Pedido recibido</p>
      <h1>¡Gracias por tu pedido!</h1>
      <p role="status">Tu folio es <strong>#{receipt.order_number}</strong>. Guárdalo para consultar tu pedido.</p>
      <p>Total de productos: <strong>{formatCurrency(receipt.total)}</strong></p>
      <p>Nos pondremos en contacto contigo para confirmar disponibilidad, compra y entrega. No se ha realizado ningún cobro en línea.</p>
      <Link className="button" to="/catalogo">Seguir viendo el catálogo</Link>
    </section>
  )

  return (
    <section className="section container">
      <p className="eyebrow">Tu selección</p><h1>Carrito</h1>
      {storageError && <p role="status" className="form-banner">Tu navegador no permite guardar el carrito. Se conservará mientras mantengas abierta esta página.</p>}
      {!items.length ? <div><p>Tu carrito está vacío.</p><Link className="button" to="/catalogo">Explorar catálogo</Link></div> : (
        <div className="cart-layout">
          <section className="cart-products" aria-label="Productos del carrito">
            <div className="cart-products__heading"><h2>Productos</h2><button type="button" className="button button--secondary" disabled={submitting || products.loading} onClick={() => setRevision((current) => current + 1)}>Actualizar precios</button></div>
            {products.loading && <LoadingState label="Consultando precios y disponibilidad…" />}
            {products.error && <p className="form-banner form-banner--error" role="alert">No pudimos consultar los productos. Pulsa Actualizar precios para reintentar.</p>}
            {lines.map(({ product_id, quantity, product }) => (
              <article key={product_id} className="cart-item">
                <div className="cart-item__image">{product?.primaryImage ? <SafeImage key={product.primaryImage.url} src={product.primaryImage.url} alt={product.name} /> : <span>Sin imagen</span>}</div>
                <div className="cart-item__info">
                  <h3>{product ? <Link to={`/producto/${product.slug}`}>{product.name}</Link> : ready ? 'Producto no disponible' : 'Producto del carrito'}</h3>
                  {product && <><p>{formatCurrency(product.price)} por pieza · {formatAvailability(product.availability)}</p><small>{[product.material, product.color, product.size].filter(Boolean).join(' · ')}</small></>}
                  <div className="cart-item__actions">
                    <label htmlFor={`quantity-${product_id}`}>Cantidad</label>
                    <select id={`quantity-${product_id}`} value={quantity} disabled={submitting} onChange={(event) => setQuantity(product_id, Number(event.target.value))}>{Array.from({ length: MAX_ITEM_QUANTITY }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select>
                    <button type="button" disabled={submitting} onClick={() => removeProduct(product_id)} aria-label={`Quitar ${product?.name || 'producto'} del carrito`}>Quitar</button>
                  </div>
                </div>
                {product && <strong>{formatCurrency(Math.round(Number(product.price) * 100) * quantity / 100)}</strong>}
              </article>
            ))}
            {ready && unavailable && <p className="form-banner form-banner--error" role="alert">Quita los productos agotados o no disponibles para continuar.</p>}
          </section>
          <form className="admin-form-section checkout-form" onSubmit={submit}>
            <h2>Datos de entrega</h2>
            <p>Registra tu pedido y coordinaremos contigo la compra y la entrega.</p>
            <fieldset disabled={submitting}>
              <div className="field"><label htmlFor="customer-name">Nombre *</label><input id="customer-name" name="name" autoComplete="name" required minLength="2" maxLength="150" value={customer.name} onChange={changeCustomer} /></div>
              <div className="field"><label htmlFor="customer-address">Dirección de entrega aproximada *</label><textarea id="customer-address" name="address" autoComplete="street-address" rows="3" required minLength="5" maxLength="1000" placeholder="Colonia, municipio y una referencia cercana" value={customer.address} onChange={changeCustomer} /></div>
              <div className="field"><label htmlFor="customer-phone">Teléfono *</label><input id="customer-phone" name="phone" type="tel" autoComplete="tel" required maxLength="30" value={customer.phone} onChange={changeCustomer} /></div>
              <div className="field"><label htmlFor="customer-email">Correo *</label><input id="customer-email" name="email" type="email" autoComplete="email" required maxLength="254" value={customer.email} onChange={changeCustomer} /></div>
            </fieldset>
            <p className="checkout-total">Total de productos <strong>{ready ? formatCurrency(total) : 'Por confirmar'}</strong></p>
            <p className="field-help">Sin pago en línea. Disponibilidad y cualquier costo de entrega se confirmarán contigo. Usaremos tus datos para atender este pedido.</p>
            {error && <p className="form-banner form-banner--error" role="alert">{error}</p>}
            <button className="button" type="submit" disabled={submitting || !ready || unavailable}>{submitting ? 'Guardando pedido…' : 'Finalizar compra'}</button>
          </form>
        </div>
      )}
    </section>
  )
}
