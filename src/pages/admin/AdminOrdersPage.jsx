import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import LoadingState from '../../components/feedback/LoadingState'
import Notification from '../../components/feedback/Notification'
import { useAsyncData } from '../../hooks/useAsyncData'
import { getAdminOrderItems, getAdminOrders, ORDER_STATUSES, updateOrderStatus } from '../../services/orderService'
import { formatAvailability, formatCurrency } from '../../utils/formatters'

function OrderDetail({ order }) {
  const [retry, setRetry] = useState(0)
  const loader = useCallback(async () => ({ items: await getAdminOrderItems(order.id), retry }), [order.id, retry])
  const { data, loading, error } = useAsyncData(loader)
  return (
    <div className="order-detail">
      <dl className="order-customer">
        <div><dt>Cliente</dt><dd>{order.customer_name}</dd></div>
        <div><dt>Teléfono</dt><dd><a href={`tel:${order.phone.replace(/[^+\d]/g, '')}`}>{order.phone}</a></dd></div>
        <div><dt>Correo</dt><dd><a href={`mailto:${order.email}`}>{order.email}</a></dd></div>
        <div><dt>Dirección aproximada</dt><dd className="order-address">{order.delivery_address}</dd></div>
      </dl>
      {loading ? <LoadingState label="Cargando piezas…" /> : error ? <div><p role="alert">No pudimos cargar las piezas.</p><button className="admin-button admin-button--secondary" onClick={() => setRetry((current) => current + 1)}>Reintentar</button></div> : (
        <div className="order-items">
          {data?.items.map((item) => <article key={item.id}>
            <div><strong>{item.product_name}</strong><p>{[item.product_sku && `SKU: ${item.product_sku}`, item.material, item.color, item.size].filter(Boolean).join(' · ')}</p><small>{formatAvailability(item.availability)} al pedir</small>{item.product_id && <p><Link to={`/admin/productos/${item.product_id}/editar`}>Ver producto actual</Link></p>}</div>
            <div><span>{item.quantity} × {formatCurrency(item.unit_price)}</span><strong>{formatCurrency(Math.round(Number(item.unit_price) * 100) * item.quantity / 100)}</strong></div>
          </article>)}
        </div>
      )}
      {order.email_sent_at && <p className="field-help">Confirmación enviada por correo el {new Date(order.email_sent_at).toLocaleString('es-MX')}.</p>}
    </div>
  )
}

export default function AdminOrdersPage() {
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(0)
  const [revision, setRevision] = useState(0)
  const [expandedId, setExpandedId] = useState(null)
  const [savingId, setSavingId] = useState(null)
  const [notification, setNotification] = useState(null)
  const loader = useCallback(async () => ({ ...await getAdminOrders({ status, page }), status, page, revision }), [status, page, revision])
  const { data, loading, error } = useAsyncData(loader)
  const current = data?.status === status && data?.page === page && data?.revision === revision

  async function changeStatus(order, nextStatus) {
    if (savingId || order.status === nextStatus) return
    setSavingId(order.id)
    try {
      await updateOrderStatus(order.id, nextStatus, order.status)
      setNotification({ type: 'success', message: `Pedido #${order.order_number}: ${ORDER_STATUSES[nextStatus]}.` })
      setRevision((value) => value + 1)
    } catch (saveError) {
      setNotification({ type: 'error', message: saveError.message || 'No fue posible actualizar el pedido.' })
    } finally { setSavingId(null) }
  }

  return (
    <div className="admin-page">
      <header className="admin-page__header"><div><p className="eyebrow">Venta por catálogo</p><h1>Pedidos</h1><p>Consulta las piezas solicitadas y organiza su compra y entrega.</p></div><button className="admin-button admin-button--secondary" disabled={loading || Boolean(savingId)} onClick={() => setRevision((value) => value + 1)}>Actualizar</button></header>
      <Notification type={notification?.type} message={notification?.message} onDismiss={() => setNotification(null)} />
      <div className="field orders-filter"><label htmlFor="orders-status">Estado</label><select id="orders-status" value={status} disabled={Boolean(savingId)} onChange={(event) => { setStatus(event.target.value); setPage(0); setExpandedId(null) }}><option value="">Todos</option>{Object.entries(ORDER_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      {error ? <p className="form-banner form-banner--error" role="alert">No pudimos cargar los pedidos. Pulsa Actualizar para reintentar.</p> : loading || !current ? <LoadingState label="Cargando pedidos…" /> : (
        <>
          <p>{data.count} pedidos encontrados.</p>
          <div className="orders-list">
            {data.orders.map((order) => <section className="admin-form-section" key={order.id}>
              <div className="order-heading">
                <div><h2>Pedido #{order.order_number}</h2><p>{order.customer_name} · {new Date(order.created_at).toLocaleString('es-MX')}</p><strong>{formatCurrency(order.total)}</strong></div>
                <div className="field"><label htmlFor={`status-${order.id}`}>Estado del pedido</label><select id={`status-${order.id}`} value={order.status} disabled={Boolean(savingId)} onChange={(event) => changeStatus(order, event.target.value)}>{Object.entries(ORDER_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                <button type="button" className="admin-button admin-button--secondary" aria-expanded={expandedId === order.id} aria-controls={`detail-${order.id}`} onClick={() => setExpandedId((currentId) => currentId === order.id ? null : order.id)}>{expandedId === order.id ? 'Ocultar detalle' : 'Ver detalle'}</button>
              </div>
              {expandedId === order.id && <div id={`detail-${order.id}`}><OrderDetail order={order} /></div>}
            </section>)}
            {!data.orders.length && <p>No hay pedidos en esta vista.</p>}
          </div>
          <div className="orders-pagination"><button className="admin-button admin-button--secondary" disabled={page === 0 || Boolean(savingId)} onClick={() => setPage((value) => value - 1)}>Anterior</button><span>Página {page + 1} de {Math.max(1, Math.ceil(data.count / 25))}</span><button className="admin-button admin-button--secondary" disabled={(page + 1) * 25 >= data.count || Boolean(savingId)} onClick={() => setPage((value) => value + 1)}>Siguiente</button></div>
        </>
      )}
    </div>
  )
}
