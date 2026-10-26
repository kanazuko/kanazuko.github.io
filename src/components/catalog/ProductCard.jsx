import { Link } from 'react-router-dom'
import { formatAvailability, formatCurrency } from '../../utils/formatters'

export default function ProductCard({ product }) {
  return (
    <article className="product-card">
      <Link to={`/producto/${product.slug}`} className="product-card__media">
        {product.primaryImage ? (
          <img
            src={product.primaryImage.url}
            alt={product.primaryImage.alt_text || product.name}
            loading="lazy"
          />
        ) : (
          <span>Imagen próximamente</span>
        )}
      </Link>
      <div className="product-card__body">
        {product.category && (
          <Link className="eyebrow" to={`/categoria/${product.category.slug}`}>
            {product.category.name}
          </Link>
        )}
        <h3><Link to={`/producto/${product.slug}`}>{product.name}</Link></h3>
        <div className="product-card__footer">
          <p className="price">{formatCurrency(product.price)}</p>
          <span className={`availability availability--${product.availability}`}>
            {formatAvailability(product.availability)}
          </span>
        </div>
      </div>
    </article>
  )
}
