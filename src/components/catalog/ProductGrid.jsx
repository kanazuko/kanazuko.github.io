import EmptyState from '../feedback/EmptyState'
import ProductCard from './ProductCard'

export default function ProductGrid({
  products,
  emptyMessage = 'Todavía no hay piezas publicadas en esta sección.',
}) {
  if (!products.length) {
    return <EmptyState message={emptyMessage} />
  }

  return (
    <div className="product-grid">
      {products.map((product) => <ProductCard key={product.id} product={product} />)}
    </div>
  )
}
