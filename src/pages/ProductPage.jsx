import { useEffect } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import AvailabilityBadge from '../components/catalog/AvailabilityBadge'
import ProductGallery from '../components/catalog/ProductGallery'
import ProductGrid from '../components/catalog/ProductGrid'
import ErrorState from '../components/feedback/ErrorState'
import LoadingState from '../components/feedback/LoadingState'
import { useProduct, useRelatedProducts } from '../hooks/useCatalog'
import { formatAttributeName, formatCurrency } from '../utils/formatters'

const whatsappNumber = import.meta.env.VITE_WHATSAPP_NUMBER?.replace(/\D/g, '')

function ProductContent({ product, onBack, returnTo }) {
  const related = useRelatedProducts(product.category?.id, product.id)
  const attributes = Object.entries(product.attributes ?? {}).filter(([, value]) => (
    value !== null && value !== '' && typeof value !== 'object'
  ))
  const whatsappMessage = encodeURIComponent(`Hola, me interesa la pieza ${product.name}.`)
  const whatsappUrl = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`
    : null

  return (
    <>
      <article className="section container product-detail">
        <div className="product-detail__back"><button className="button button--secondary" type="button" onClick={onBack}>← Regresar a {returnTo?.pathname.startsWith('/categoria/') ? 'la colección' : 'catálogo'}</button></div>
        <ProductGallery key={product.id} images={product.images} productName={product.name} />
        <div className="product-detail__content">
          {product.category && (
            <Link className="eyebrow" to={`/categoria/${product.category.slug}`}>
              {product.category.name}
            </Link>
          )}
          <h1>{product.name}</h1>
          <div className="product-pricing">
            <p className="price price--large">{formatCurrency(product.price)}</p>
            {product.compare_at_price && (
              <p className="price price--previous">{formatCurrency(product.compare_at_price)}</p>
            )}
          </div>
          <AvailabilityBadge availability={product.availability} />

          {product.tags?.length > 0 && <p className="product-tags">{product.tags.map((tag) => <span key={tag.id}>{tag.name}</span>)}</p>}

          {product.description && <p className="product-description">{product.description}</p>}

          <dl className="product-meta">
            {product.material && <><dt>Material</dt><dd>{product.material}</dd></>}
            {product.color && <><dt>Color</dt><dd>{product.color}</dd></>}
            {product.size && <><dt>Talla</dt><dd>{product.size}</dd></>}
            {attributes.map(([name, value]) => (
              <div className="product-meta__row" key={name}>
                <dt>{formatAttributeName(name)}</dt>
                <dd>{String(value)}</dd>
              </div>
            ))}
          </dl>

          {whatsappUrl ? (
            <a className="button product-contact" href={whatsappUrl} target="_blank" rel="noreferrer">
              Consultar por WhatsApp
            </a>
          ) : (
            <p className="contact-unavailable">El contacto por WhatsApp estará disponible próximamente.</p>
          )}
          <p className="product-note">La disponibilidad puede cambiar. Confirma los detalles antes de realizar tu pedido.</p>
        </div>
      </article>

      {(related.loading || related.error || related.data?.length > 0) && (
        <section className="section section--soft related-section">
          <div className="container">
            <div className="section-heading">
              <div><p className="eyebrow">También te puede gustar</p><h2>Piezas relacionadas</h2></div>
            </div>
            {related.loading && <LoadingState label="Buscando piezas relacionadas…" />}
            {related.error && <ErrorState message="No pudimos cargar las piezas relacionadas." />}
            {related.data?.length > 0 && <ProductGrid products={related.data} />}
          </div>
        </section>
      )}
    </>
  )
}

export default function ProductPage() {
  const { slug } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { data: product, loading, error } = useProduct(slug)

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [slug])

  function handleBack() {
    if (location.state?.returnTo) navigate(-1)
    else navigate('/catalogo')
  }

  if (loading) return <LoadingState label="Cargando pieza…" fullPage />
  if (error || !product) {
    return <div className="section container"><ErrorState message="No encontramos esta pieza o ya no está disponible." /></div>
  }

  return <ProductContent product={product} onBack={handleBack} returnTo={location.state?.returnTo} />
}
