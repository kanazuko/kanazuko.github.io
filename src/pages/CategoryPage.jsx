import { useLocation, useParams } from 'react-router-dom'
import ProductGrid from '../components/catalog/ProductGrid'
import ErrorState from '../components/feedback/ErrorState'
import LoadingState from '../components/feedback/LoadingState'
import { useCategories, useCategoryProducts } from '../hooks/useCatalog'
import CategoryCard from '../components/catalog/CategoryCard'
import { useRestoreScrollPosition } from '../hooks/useScrollPosition'
import { titleFromSlug } from '../utils/formatters'

export default function CategoryPage() {
  const { slug } = useParams()
  const location = useLocation()
  const { data, loading, error } = useCategoryProducts(slug)
  const categories = useCategories()
  const category = categories.data?.find((item) => item.slug === slug)
  const subcategories = categories.data?.filter((item) => item.parent_id === category?.id) ?? []

  useRestoreScrollPosition(location.key, Boolean(data))

  return (
    <section className="section container">
      <header className="page-heading">
        <p className="eyebrow">Colección</p>
        <h1>{category?.name || data?.[0]?.subcategory?.name || data?.[0]?.category?.name || titleFromSlug(slug)}</h1>
      </header>
      {subcategories.length > 0 && (
        <section className="category-subcategories">
          <div className="section-heading"><div><p className="eyebrow">Explora</p><h2>Subcategorías</h2></div></div>
          <div className="category-grid">{subcategories.map((item) => <CategoryCard key={item.id} category={item} />)}</div>
        </section>
      )}
      {loading && <LoadingState label="Cargando colección…" />}
      {error && <ErrorState message="No se pudo cargar esta categoría." />}
      {data && <ProductGrid products={data} />}
    </section>
  )
}
