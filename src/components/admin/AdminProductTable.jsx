import { Link } from 'react-router-dom'
import { formatAvailability, formatCurrency } from '../../utils/formatters'

export default function AdminProductTable({ products, pendingId, onToggle, onAvailabilityChange, onDelete }) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Producto</th>
            <th>Categoría</th>
            <th>Precio</th>
            <th>Disponibilidad</th>
            <th>Estado</th>
            <th>Destacado</th>
            <th><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => {
            const pending = pendingId === product.id
            return (
              <tr key={product.id} aria-busy={pending}>
                <td data-label="Producto">
                  <div className="admin-product-name"><strong>{product.name}</strong><small>{product.sku || product.slug}</small></div>
                </td>
                <td data-label="Categoría">{product.category?.name || 'Sin categoría'}</td>
                <td data-label="Precio">{formatCurrency(product.price)}</td>
                <td data-label="Disponibilidad">
                  <select
                    className={`admin-availability-select admin-status--${product.availability}`}
                    value={product.availability}
                    disabled={pending}
                    onChange={(event) => onAvailabilityChange(product, event.target.value)}
                    aria-label={`Disponibilidad de ${product.name}`}
                  >
                    <option value="available">{formatAvailability('available')}</option>
                    <option value="out_of_stock">{formatAvailability('out_of_stock')}</option>
                    <option value="made_to_order">{formatAvailability('made_to_order')}</option>
                  </select>
                </td>
                <td data-label="Estado">
                  <button className={`admin-status-button ${product.is_published ? 'is-active' : ''}`} type="button" disabled={pending} onClick={() => onToggle(product, 'is_published')}>
                    <span aria-hidden="true" />{product.is_published ? 'Publicado' : 'Borrador'}
                  </button>
                </td>
                <td data-label="Destacado">
                  <button className={`admin-icon-toggle ${product.is_featured ? 'is-active' : ''}`} type="button" disabled={pending} onClick={() => onToggle(product, 'is_featured')} aria-label={product.is_featured ? `Quitar ${product.name} de destacados` : `Destacar ${product.name}`} aria-pressed={product.is_featured}>☆</button>
                </td>
                <td data-label="Acciones">
                  <div className="admin-row-actions">
                    <Link to={`/admin/productos/${product.id}/editar`}>Editar</Link>
                    <button type="button" onClick={() => onDelete(product)}>Eliminar</button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
