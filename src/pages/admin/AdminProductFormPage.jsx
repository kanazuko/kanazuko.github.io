import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ProductForm from '../../components/admin/ProductForm'
import ErrorState from '../../components/feedback/ErrorState'
import LoadingState from '../../components/feedback/LoadingState'
import {
  createAdminProduct,
  getAdminCategories,
  getAdminProductById,
  getProductMutationError,
  updateAdminProduct,
} from '../../services/adminProductService'

export default function AdminProductFormPage() {
  const { id } = useParams()
  const editing = Boolean(id)
  const navigate = useNavigate()
  const [product, setProduct] = useState(null)
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const [categoryData, productData] = await Promise.all([
          getAdminCategories(),
          editing ? getAdminProductById(id) : Promise.resolve(null),
        ])
        if (active) {
          setCategories(categoryData)
          setProduct(productData)
        }
      } catch (error) {
        console.error(error)
        if (active) setLoadError(editing ? 'No fue posible cargar este producto.' : 'No fue posible preparar el formulario.')
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [editing, id])

  async function handleSubmit(values) {
    setSubmitting(true)
    setServerError('')
    try {
      if (editing) await updateAdminProduct(id, values)
      else await createAdminProduct(values)

      navigate('/admin/productos', {
        replace: true,
        state: { notice: { type: 'success', message: editing ? 'Producto actualizado correctamente.' : 'Producto creado correctamente.' } },
      })
    } catch (error) {
      console.error(error)
      setServerError(getProductMutationError(error))
      setSubmitting(false)
    }
  }

  if (loading) return <LoadingState label={editing ? 'Cargando producto…' : 'Preparando formulario…'} />
  if (loadError) return <ErrorState message={loadError} />

  return (
    <div className="admin-page admin-page--form">
      <div className="admin-breadcrumb"><Link to="/admin/productos">Productos</Link><span>/</span><span>{editing ? 'Editar' : 'Nuevo'}</span></div>
      <header className="admin-page__header">
        <div><p className="eyebrow">{editing ? 'Edición' : 'Nueva pieza'}</p><h1>{editing ? product.name : 'Agregar producto'}</h1><p>Las fotografías se gestionarán en una fase posterior.</p></div>
      </header>
      <ProductForm
        product={product}
        categories={categories}
        submitting={submitting}
        serverError={serverError}
        onSubmit={handleSubmit}
        onCancel={() => navigate('/admin/productos')}
      />
    </div>
  )
}
