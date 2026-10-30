import { Link, useLocation } from 'react-router-dom'
import { formatAvailability, formatCurrency } from '../../utils/formatters'
import { saveScrollPosition } from '../../hooks/useScrollPosition'
import SafeImage from './SafeImage'
import AddToCartButton from './AddToCartButton'

export default function ProductCard({ product }) {
  const location = useLocation()
  const productPath = `/producto/${product.slug}`
  const productState = { returnTo: { pathname: location.pathname, search: location.search } }
  const rememberScrollPosition = () => saveScrollPosition(location.key)

  return (
    <article className="product-card">
      <Link to={productPath} state={productState} className="product-card__media" onClick={rememberScrollPosition}>
        {product.primaryImage ? (
          <SafeImage
            key={product.primaryImage.id}
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
        <h3><Link to={productPath} state={productState} onClick={rememberScrollPosition}>{product.name}</Link></h3>
        <div className="product-card__footer">
          <p className="price">{formatCurrency(product.price)}</p>
          <span className={`availability availability--${product.availability}`}>
            {formatAvailability(product.availability)}
          </span>
        </div>
        <AddToCartButton product={product} />
      </div>
    </article>
  )
}
