import { useEffect, useState } from 'react'
import ParentCategorySettings from '../../components/admin/ParentCategorySettings'
import ConfirmDialog from '../../components/feedback/ConfirmDialog'
import ErrorState from '../../components/feedback/ErrorState'
import LoadingState from '../../components/feedback/LoadingState'
import Notification from '../../components/feedback/Notification'
import {
  createAdminSubcategory,
  deleteAdminSubcategory,
  getAdminCategories,
  getAdminProductDefaults,
  updateAdminSubcategory,
  updateAdminProductDefaults,
} from '../../services/adminProductService'
import { slugify, toTitleCase } from '../../utils/formatters'

const emptyValues = { parent_id: '', name: '', slug: '', sort_order: '0', is_active: true }

export default function AdminSettingsPage() {
  const [categories, setCategories] = useState([])
  const [values, setValues] = useState(emptyValues)
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notification, setNotification] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [defaults, setDefaults] = useState({ category_id: '', subcategory_id: '', material: '', color: '', is_published: true })

  async function load(showLoading = false) {
    if (showLoading) setLoading(true)
    try {
      const [categoryData, defaultData] = await Promise.all([getAdminCategories(), getAdminProductDefaults()])
      setCategories(categoryData)
      setDefaults({ category_id: defaultData.category_id ?? '', subcategory_id: defaultData.subcategory_id ?? '', material: defaultData.material ?? '', color: defaultData.color ?? '', is_published: defaultData.is_published })
    } catch (loadError) {
      console.error(loadError)
      setError('No fue posible cargar la configuración de categorías.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    Promise.resolve().then(load)
  }, [])

  const parents = categories.filter((category) => !category.parent_id)
  const subcategories = categories.filter((category) => category.parent_id)

  function change(name, value) {
    setValues((current) => ({ ...current, [name]: value }))
  }

  function startEdit(category) {
    setEditingId(category.id)
    setValues({ parent_id: category.parent_id, name: category.name, slug: category.slug, sort_order: String(category.sort_order), is_active: category.is_active })
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function resetForm() {
    setEditingId(null)
    setValues(emptyValues)
    setError('')
  }

  async function handleDefaultsSubmit(event) {
    event.preventDefault()
    setSaving(true)
    try {
      const saved = await updateAdminProductDefaults({ category_id: defaults.category_id || null, subcategory_id: defaults.subcategory_id || null, material: defaults.material.trim() || null, color: defaults.color.trim() || null, is_published: defaults.is_published })
      setDefaults({ category_id: saved.category_id ?? '', subcategory_id: saved.subcategory_id ?? '', material: saved.material ?? '', color: saved.color ?? '', is_published: saved.is_published })
      setNotification({ type: 'success', message: 'Prellenado para nuevos productos actualizado.' })
    } catch (saveError) {
      console.error(saveError)
      setNotification({ type: 'error', message: saveError.message || 'No fue posible guardar el prellenado.' })
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!values.parent_id || !values.name.trim() || !values.slug.trim()) {
      setError('Selecciona una categoría principal e ingresa un nombre.')
      return
    }
    setSaving(true)
    setError('')
    const payload = { ...values, name: toTitleCase(values.name), slug: slugify(values.slug), sort_order: Number(values.sort_order) || 0 }
    try {
      if (editingId) await updateAdminSubcategory(editingId, payload)
      else await createAdminSubcategory(payload)
      await load()
      resetForm()
      setNotification({ type: 'success', message: editingId ? 'Subcategoría actualizada.' : 'Subcategoría creada.' })
    } catch (saveError) {
      console.error(saveError)
      setError(saveError.code === '23505' ? 'Ya existe una subcategoría con ese slug.' : saveError.message || 'No fue posible guardar la subcategoría.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setSaving(true)
    try {
      await deleteAdminSubcategory(deleteTarget.id)
      await load()
      if (editingId === deleteTarget.id) resetForm()
      setDeleteTarget(null)
      setNotification({ type: 'success', message: 'Subcategoría eliminada.' })
    } catch (deleteError) {
      console.error(deleteError)
      setNotification({ type: 'error', message: deleteError.message || 'No fue posible eliminar la subcategoría.' })
      setDeleteTarget(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-page admin-page--settings">
      <header className="admin-page__header"><div><p className="eyebrow">Catálogo</p><h1>Configuración</h1><p>Administra las categorías padre y subcategorías disponibles al crear y clasificar productos.</p></div></header>
      <Notification type={notification?.type} message={notification?.message} onDismiss={() => setNotification(null)} />
      {loading ? <LoadingState label="Cargando categorías padre…" /> : (
        <ParentCategorySettings
          categories={parents}
          disabled={saving || Boolean(error && !categories.length)}
          onSaved={(saved) => setCategories((current) => [...current.filter((category) => category.id !== saved.id), saved].sort((a, b) => a.sort_order - b.sort_order))}
          onNotify={setNotification}
        />
      )}
      <form className="admin-form-section admin-defaults-form" onSubmit={handleDefaultsSubmit}>
        <div className="admin-form-section__heading"><h2>Prellenado de productos nuevos</h2><p>Estos valores aparecerán automáticamente al abrir el formulario para crear una pieza.</p></div>
        <div className="admin-form-grid">
          <div className="field"><label htmlFor="default-category">Categoría</label><select id="default-category" value={defaults.category_id} onChange={(event) => setDefaults((current) => ({ ...current, category_id: event.target.value, subcategory_id: '' }))}><option value="">Sin categoría</option>{parents.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
          <div className="field"><label htmlFor="default-subcategory">Subcategoría</label><select id="default-subcategory" value={defaults.subcategory_id} onChange={(event) => setDefaults((current) => ({ ...current, subcategory_id: event.target.value }))} disabled={!defaults.category_id}><option value="">Sin subcategoría</option>{subcategories.filter((category) => category.parent_id === defaults.category_id).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
          <div className="field"><label htmlFor="default-material">Material</label><input id="default-material" value={defaults.material} onChange={(event) => setDefaults((current) => ({ ...current, material: event.target.value }))} placeholder="Ej. Acero Inoxidable" /></div>
          <div className="field"><label htmlFor="default-color">Color</label><input id="default-color" value={defaults.color} onChange={(event) => setDefaults((current) => ({ ...current, color: event.target.value }))} placeholder="Ej. Dorado" /></div>
          <label className="toggle-field"><input type="checkbox" checked={defaults.is_published} onChange={(event) => setDefaults((current) => ({ ...current, is_published: event.target.checked }))} /><span><strong>Publicado</strong><small>Los nuevos productos se crearán visibles en el catálogo.</small></span></label>
        </div>
        <div className="admin-form-actions"><button className="admin-button" disabled={saving}>{saving ? 'Guardando…' : 'Guardar prellenado'}</button></div>
      </form>
      <section className="admin-settings-grid">
        <form className="admin-form-section" onSubmit={handleSubmit}>
          <div className="admin-form-section__heading"><h2>{editingId ? 'Editar subcategoría' : 'Nueva subcategoría'}</h2><p>Asigna cada subcategoría a una categoría padre.</p></div>
          <div className="admin-form-grid">
            <div className="field"><label htmlFor="subcategory-parent">Categoría principal *</label><select id="subcategory-parent" value={values.parent_id} onChange={(event) => change('parent_id', event.target.value)}><option value="">Selecciona una categoría</option>{parents.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
            <div className="field"><label htmlFor="subcategory-name">Nombre *</label><input id="subcategory-name" value={values.name} onChange={(event) => { change('name', event.target.value); if (!editingId) change('slug', slugify(event.target.value)) }} /></div>
            <div className="field"><label htmlFor="subcategory-slug">Slug *</label><input id="subcategory-slug" value={values.slug} onChange={(event) => change('slug', slugify(event.target.value))} /></div>
            <div className="field"><label htmlFor="subcategory-order">Orden</label><input id="subcategory-order" type="number" value={values.sort_order} onChange={(event) => change('sort_order', event.target.value)} /></div>
            <label className="toggle-field"><input type="checkbox" checked={values.is_active} onChange={(event) => change('is_active', event.target.checked)} /><span><strong>Activa</strong><small>Disponible al asignar productos.</small></span></label>
          </div>
          {error && <p className="form-banner form-banner--error" role="alert">{error}</p>}
          <div className="admin-form-actions"><button className="admin-button admin-button--secondary" type="button" onClick={resetForm} disabled={saving}>Cancelar</button><button className="admin-button" disabled={saving}>{saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear subcategoría'}</button></div>
        </form>
        <section className="admin-form-section"><div className="admin-form-section__heading"><h2>Subcategorías</h2><p>{subcategories.length} registradas.</p></div>{loading ? <LoadingState label="Cargando subcategorías…" /> : error && !categories.length ? <ErrorState message={error} /> : <div className="admin-subcategory-list">{subcategories.map((category) => <article key={category.id}><div><strong>{category.name}</strong><small>{parents.find((parent) => parent.id === category.parent_id)?.name} · {category.is_active ? 'Activa' : 'Inactiva'} · Orden {category.sort_order}</small></div><div><button type="button" onClick={() => startEdit(category)}>Editar</button><button className="danger-link" type="button" onClick={() => setDeleteTarget(category)}>Eliminar</button></div></article>)}{subcategories.length === 0 && <p className="image-manager-empty">Aún no hay subcategorías.</p>}</div>}</section>
      </section>
      <ConfirmDialog open={Boolean(deleteTarget)} title="Eliminar subcategoría" message={deleteTarget ? `¿Eliminar “${deleteTarget.name}”? No se podrá eliminar si tiene productos asignados.` : ''} confirmLabel="Eliminar" busy={saving} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
    </div>
  )
}
