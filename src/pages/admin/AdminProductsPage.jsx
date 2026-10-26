import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import AdminProductFilters from '../../components/admin/AdminProductFilters'
import AdminProductTable from '../../components/admin/AdminProductTable'
import ConfirmDialog from '../../components/feedback/ConfirmDialog'
import EmptyState from '../../components/feedback/EmptyState'
import ErrorState from '../../components/feedback/ErrorState'
import LoadingState from '../../components/feedback/LoadingState'
import Notification from '../../components/feedback/Notification'
import {
  deleteAdminProduct,
  getAdminCategories,
  getAdminProducts,
  getProductMutationError,
  updateAdminProduct,
} from '../../services/adminProductService'

const initialFilters = { query: '', category: '', published: '', availability: '', sort: 'catalog' }

function normalize(value = '') {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')
}

export default function AdminProductsPage() {
  const location = useLocation()
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [pendingId, setPendingId] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [filters, setFilters] = useState(initialFilters)
  const [notification, setNotification] = useState(() => location.state?.notice ?? null)

  const fetchData = useCallback(async () => {
    const [productData, categoryData] = await Promise.all([
        getAdminProducts(),
        getAdminCategories(),
    ])
    return { productData, categoryData }
  }, [])

  useEffect(() => {
    let active = true
    fetchData()
      .then(({ productData, categoryData }) => {
        if (!active) return
        setProducts(productData)
        setCategories(categoryData)
      })
      .catch((error) => {
        console.error(error)
        if (active) setLoadError('No fue posible cargar los productos administrativos.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [fetchData])

  async function handleRetry() {
    setLoading(true)
    setLoadError('')
    try {
      const { productData, categoryData } = await fetchData()
      setProducts(productData)
      setCategories(categoryData)
    } catch (error) {
      console.error(error)
      setLoadError('No fue posible cargar los productos administrativos.')
    } finally {
      setLoading(false)
    }
  }

  const visibleProducts = useMemo(() => {
    const query = normalize(filters.query.trim())
    const filtered = products.filter((product) => {
      const searchable = normalize([product.name, product.sku, product.slug].filter(Boolean).join(' '))
      return (!query || searchable.includes(query))
        && (!filters.category || product.category_id === filters.category)
        && (!filters.availability || product.availability === filters.availability)
        && (!filters.published || (filters.published === 'published' ? product.is_published : !product.is_published))
    })

    return [...filtered].sort((a, b) => {
      if (filters.sort === 'newest') return new Date(b.created_at) - new Date(a.created_at)
      if (filters.sort === 'name-asc') return a.name.localeCompare(b.name, 'es')
      if (filters.sort === 'name-desc') return b.name.localeCompare(a.name, 'es')
      if (filters.sort === 'price-asc') return Number(a.price) - Number(b.price)
      if (filters.sort === 'price-desc') return Number(b.price) - Number(a.price)
      return a.sort_order - b.sort_order
    })
  }, [filters, products])

  function changeFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }))
  }

  async function handleToggle(product, field) {
    setPendingId(product.id)
    setNotification(null)
    try {
      const updated = await updateAdminProduct(product.id, { [field]: !product[field] })
      setProducts((current) => current.map((item) => item.id === updated.id ? updated : item))
      setNotification({ type: 'success', message: field === 'is_published' ? 'Estado de publicación actualizado.' : 'Estado destacado actualizado.' })
    } catch (error) {
      console.error(error)
      setNotification({ type: 'error', message: getProductMutationError(error) })
    } finally {
      setPendingId(null)
    }
  }

  async function handleAvailabilityChange(product, availability) {
    setPendingId(product.id)
    setNotification(null)
    try {
      const updated = await updateAdminProduct(product.id, { availability })
      setProducts((current) => current.map((item) => item.id === updated.id ? updated : item))
      setNotification({ type: 'success', message: 'Disponibilidad actualizada.' })
    } catch (error) {
      console.error(error)
      setNotification({ type: 'error', message: getProductMutationError(error) })
    } finally {
      setPendingId(null)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setPendingId(deleteTarget.id)
    try {
      await deleteAdminProduct(deleteTarget.id)
      setProducts((current) => current.filter((product) => product.id !== deleteTarget.id))
      setNotification({ type: 'success', message: `“${deleteTarget.name}” fue eliminado.` })
      setDeleteTarget(null)
    } catch (error) {
      console.error(error)
      if (error.productDeleted) {
        console.error('Rutas pendientes de limpieza:', error.orphanedPaths)
        setProducts((current) => current.filter((product) => product.id !== deleteTarget.id))
        setDeleteTarget(null)
      }
      setNotification({ type: 'error', message: getProductMutationError(error) })
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="admin-page">
      <header className="admin-page__header">
        <div><p className="eyebrow">Catálogo</p><h1>Productos</h1><p>Administra todas las piezas, publicadas y en borrador.</p></div>
        <Link className="admin-button" to="/admin/productos/nuevo">Agregar producto</Link>
      </header>

      <Notification type={notification?.type} message={notification?.message} onDismiss={() => setNotification(null)} />

      {loading && <LoadingState label="Cargando productos…" />}
      {loadError && <><ErrorState message={loadError} /><button className="admin-button admin-retry" type="button" onClick={handleRetry}>Reintentar</button></>}
      {!loading && !loadError && (
        <>
          <AdminProductFilters filters={filters} categories={categories} onChange={changeFilter} resultCount={visibleProducts.length} />
          {products.length === 0 ? (
            <div className="admin-empty"><EmptyState message="Todavía no hay productos. Crea la primera pieza del catálogo." /><Link className="admin-button" to="/admin/productos/nuevo">Crear producto</Link></div>
          ) : visibleProducts.length === 0 ? (
            <EmptyState message="Ningún producto coincide con los filtros seleccionados." />
          ) : (
            <AdminProductTable products={visibleProducts} pendingId={pendingId} onToggle={handleToggle} onAvailabilityChange={handleAvailabilityChange} onDelete={setDeleteTarget} />
          )}
        </>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Eliminar producto"
        message={deleteTarget ? `Se eliminará “${deleteTarget.name}” permanentemente. Esta acción no se puede deshacer.` : ''}
        confirmLabel="Eliminar producto"
        busy={pendingId === deleteTarget?.id}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
