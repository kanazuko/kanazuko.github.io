import { useMemo, useState } from 'react'
import CatalogControls from '../components/catalog/CatalogControls'
import ProductGrid from '../components/catalog/ProductGrid'
import ErrorState from '../components/feedback/ErrorState'
import LoadingState from '../components/feedback/LoadingState'
import { useCategories, useProducts } from '../hooks/useCatalog'

function normalize(value = '') {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')
}

export default function CatalogPage() {
  const products = useProducts()
  const categories = useCategories()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [sort, setSort] = useState('featured')

  const visibleProducts = useMemo(() => {
    const search = normalize(query.trim())
    const filtered = (products.data ?? []).filter((product) => {
      const matchesCategory = !category || product.category?.slug === category
      const searchable = normalize([
        product.name,
        product.description,
        product.material,
        product.color,
      ].filter(Boolean).join(' '))
      return matchesCategory && (!search || searchable.includes(search))
    })

    return [...filtered].sort((a, b) => {
      if (sort === 'price-asc') return Number(a.price) - Number(b.price)
      if (sort === 'price-desc') return Number(b.price) - Number(a.price)
      if (sort === 'name-asc') return a.name.localeCompare(b.name, 'es')
      if (sort === 'name-desc') return b.name.localeCompare(a.name, 'es')
      return 0
    })
  }, [category, products.data, query, sort])

  return (
    <>
      <header className="catalog-hero">
        <div className="container page-heading">
          <p className="eyebrow">Colección PRArtJewelry</p>
          <h1>Catálogo</h1>
          <p>Encuentra la pieza que hable de ti. Explora por colección, material o detalle.</p>
        </div>
      </header>

      <section className="catalog-section container">
        {!products.loading && !products.error && (
          <CatalogControls
            categories={categories.data ?? []}
            category={category}
            onCategoryChange={setCategory}
            query={query}
            onQueryChange={setQuery}
            sort={sort}
            onSortChange={setSort}
            resultCount={visibleProducts.length}
          />
        )}
        {products.loading && <LoadingState label="Preparando la colección…" />}
        {products.error && <ErrorState message="No pudimos cargar el catálogo. Intenta de nuevo más tarde." />}
        {products.data && (
          <ProductGrid
            products={visibleProducts}
            emptyMessage={products.data.length === 0
              ? 'Nuestra colección estará disponible muy pronto.'
              : 'No encontramos piezas que coincidan con tu búsqueda.'}
          />
        )}
      </section>
    </>
  )
}
