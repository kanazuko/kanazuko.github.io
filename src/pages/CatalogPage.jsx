import { useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import CatalogControls from '../components/catalog/CatalogControls'
import ProductGrid from '../components/catalog/ProductGrid'
import ErrorState from '../components/feedback/ErrorState'
import LoadingState from '../components/feedback/LoadingState'
import { useCategories, useProducts } from '../hooks/useCatalog'
import { useRestoreScrollPosition } from '../hooks/useScrollPosition'

function normalize(value = '') {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')
}

export default function CatalogPage() {
  const location = useLocation()
  const products = useProducts()
  const categories = useCategories()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [subcategory, setSubcategory] = useState('')
  const [color, setColor] = useState('')
  const [tag, setTag] = useState('')
  const [sort, setSort] = useState('featured')

  useRestoreScrollPosition(location.key, Boolean(products.data))

  const visibleProducts = useMemo(() => {
    const search = normalize(query.trim())
    const filtered = (products.data ?? []).filter((product) => {
      const matchesCategory = !category || product.category?.slug === category
      const matchesSubcategory = !subcategory || product.subcategory?.slug === subcategory
      const productColors = (product.color ?? '').split(',').map((item) => normalize(item.trim())).filter(Boolean)
      const matchesColor = !color || productColors.includes(normalize(color))
      const matchesTag = !tag || product.tags?.some((item) => item.slug === tag)
      const searchable = normalize([
        product.name,
        product.description,
        product.material,
        product.color,
      ].filter(Boolean).join(' '))
      return matchesCategory && matchesSubcategory && matchesColor && matchesTag && (!search || searchable.includes(search))
    })

    return [...filtered].sort((a, b) => {
      if (sort === 'price-asc') return Number(a.price) - Number(b.price)
      if (sort === 'price-desc') return Number(b.price) - Number(a.price)
      if (sort === 'name-asc') return a.name.localeCompare(b.name, 'es')
      if (sort === 'name-desc') return b.name.localeCompare(a.name, 'es')
      return 0
    })
  }, [category, color, products.data, query, sort, subcategory, tag])

  const colors = useMemo(() => [...new Set((products.data ?? []).flatMap((product) => (product.color ?? '').split(',').map((item) => item.trim()).filter(Boolean)))].sort((a, b) => a.localeCompare(b, 'es')), [products.data])
  const tags = useMemo(() => {
    const unique = new Map()
    ;(products.data ?? []).flatMap((product) => product.tags ?? []).forEach((item) => unique.set(item.slug, item))
    return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [products.data])

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
            onCategoryChange={(value) => { setCategory(value); setSubcategory('') }}
            subcategory={subcategory}
            onSubcategoryChange={setSubcategory}
            color={color}
            onColorChange={setColor}
            tag={tag}
            onTagChange={setTag}
            colors={colors}
            tags={tags}
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
