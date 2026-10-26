import { useParams } from 'react-router-dom'
import ProductGrid from '../components/catalog/ProductGrid'
import ErrorState from '../components/feedback/ErrorState'
import LoadingState from '../components/feedback/LoadingState'
import { useCategoryProducts } from '../hooks/useCatalog'
import { titleFromSlug } from '../utils/formatters'

export default function CategoryPage() {
  const { slug } = useParams()
  const { data, loading, error } = useCategoryProducts(slug)

  return (
    <section className="section container">
      <header className="page-heading">
        <p className="eyebrow">Colección</p>
        <h1>{data?.[0]?.category?.name || titleFromSlug(slug)}</h1>
      </header>
      {loading && <LoadingState label="Cargando colección…" />}
      {error && <ErrorState message="No se pudo cargar esta categoría." />}
      {data && <ProductGrid products={data} />}
    </section>
  )
}
