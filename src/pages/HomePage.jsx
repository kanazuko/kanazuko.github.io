import { Link } from 'react-router-dom'
import CategoryCard from '../components/catalog/CategoryCard'
import ProductGrid from '../components/catalog/ProductGrid'
import SafeImage from '../components/catalog/SafeImage'
import EmptyState from '../components/feedback/EmptyState'
import ErrorState from '../components/feedback/ErrorState'
import LoadingState from '../components/feedback/LoadingState'
import { useCategories, useProducts } from '../hooks/useCatalog'

export default function HomePage() {
  const categories = useCategories()
  const featured = useProducts({ featured: true })

  return (
    <>
      <section className="hero-section">
        <div className="container hero-section__grid">
          <div className="hero-section__content">
            <p className="eyebrow">Joyería contemporánea</p>
            <h1>Detalles que permanecen.</h1>
            <p>Una colección cuidada de piezas que celebran la belleza en lo esencial y acompañan cada historia.</p>
            <div className="hero-actions">
              <Link className="button" to="/catalogo">Descubrir colección</Link>
              <a className="text-link" href="#categorias">Explorar categorías ↓</a>
            </div>
          </div>
          <div className="hero-visual" aria-label={featured.data?.[0] ? `Pieza destacada: ${featured.data[0].name}` : 'PRArtJewelry'}>
            {featured.data?.[0]?.primaryImage ? (
              <SafeImage key={featured.data[0].primaryImage.id} src={featured.data[0].primaryImage.url} alt={featured.data[0].primaryImage.alt_text || featured.data[0].name} fallback="PRArtJewelry" />
            ) : (
              <div className="hero-monogram" aria-hidden="true"><span>PR</span><small>Art · Jewelry</small></div>
            )}
          </div>
        </div>
      </section>

      <section className="section container" id="categorias">
        <div className="section-heading">
          <div><p className="eyebrow">Explora</p><h2>Categorías</h2></div>
        </div>
        {categories.loading && <LoadingState label="Cargando categorías…" />}
        {categories.error && <ErrorState message="No se pudieron cargar las categorías." />}
        {categories.data?.length === 0 && <EmptyState message="Aún no hay categorías disponibles." />}
        {categories.data?.length > 0 && (
          <div className="category-grid">
            {categories.data.filter((category) => !category.parent_id).map((category) => <CategoryCard key={category.id} category={category} />)}
          </div>
        )}
      </section>

      <section className="section section--soft">
        <div className="container">
          <div className="section-heading">
            <div><p className="eyebrow">Selección especial</p><h2>Piezas destacadas</h2></div>
            <Link className="text-link" to="/catalogo">Ver todo →</Link>
          </div>
          {featured.loading && <LoadingState label="Cargando piezas…" />}
          {featured.error && <ErrorState message="No se pudieron cargar las piezas destacadas." />}
          {featured.data && <ProductGrid products={featured.data} />}
        </div>
      </section>

      <section className="brand-story section">
        <div className="container brand-story__grid">
          <p className="brand-story__mark" aria-hidden="true">PR</p>
          <div>
            <p className="eyebrow">Nuestra esencia</p>
            <h2>Joyería para hacerla tuya.</h2>
            <p>Cada pieza de PRArtJewelry se presenta con una mirada limpia y personal. Creemos en los detalles que elevan lo cotidiano, en la elegancia sin exceso y en elegir con intención.</p>
            <Link className="text-link" to="/catalogo">Conocer la colección →</Link>
          </div>
        </div>
      </section>
    </>
  )
}
