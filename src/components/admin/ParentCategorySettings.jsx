import { useState } from 'react'
import { createAdminCategory, updateAdminCategory } from '../../services/adminProductService'
import { slugify, toTitleCase } from '../../utils/formatters'

const emptyValues = { name: '', slug: '', sort_order: '0', is_active: true }

export default function ParentCategorySettings({ categories, disabled, onSaved, onNotify }) {
  const [values, setValues] = useState(emptyValues)
  const [editingId, setEditingId] = useState(null)
  const [slugEdited, setSlugEdited] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const busy = disabled || saving

  function reset() {
    setValues(emptyValues)
    setEditingId(null)
    setSlugEdited(false)
    setError('')
  }

  function edit(category) {
    setValues({ name: category.name, slug: category.slug, sort_order: String(category.sort_order), is_active: category.is_active })
    setEditingId(category.id)
    setSlugEdited(true)
    setError('')
    document.getElementById('parent-category-name')?.focus()
  }

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    const payload = { name: toTitleCase(values.name), slug: slugify(values.slug), sort_order: Number(values.sort_order), is_active: values.is_active }
    if (!payload.name.trim() || !payload.slug) {
      setError('Ingresa un nombre y un slug válido.')
      return
    }
    if (!Number.isInteger(payload.sort_order) || payload.sort_order < -2147483648 || payload.sort_order > 2147483647) {
      setError('El orden debe ser un número entero válido.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const saved = editingId ? await updateAdminCategory(editingId, payload) : await createAdminCategory(payload)
      onSaved(saved)
      onNotify({ type: 'success', message: editingId ? 'Categoría padre actualizada.' : 'Categoría padre creada.' })
      reset()
    } catch (saveError) {
      setError(saveError.code === '23505' ? 'Ya existe una categoría o subcategoría con ese slug.' : saveError.message || 'No fue posible guardar la categoría padre.')
    } finally {
      setSaving(false)
    }
  }

  async function toggle(category) {
    if (busy) return
    setSaving(true)
    try {
      const saved = await updateAdminCategory(category.id, { is_active: !category.is_active })
      onSaved(saved)
      if (editingId === saved.id) setValues((current) => ({ ...current, is_active: saved.is_active }))
      onNotify({ type: 'success', message: saved.is_active ? 'Categoría padre activada.' : 'Categoría padre desactivada.' })
    } catch (saveError) {
      onNotify({ type: 'error', message: saveError.message || 'No fue posible cambiar el estado de la categoría.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="admin-settings-grid admin-defaults-form" aria-label="Categorías padre">
      <form className="admin-form-section" onSubmit={submit}>
        <div className="admin-form-section__heading">
          <h2>{editingId ? 'Editar categoría padre' : 'Nueva categoría padre'}</h2>
          <p>Organiza las categorías principales del catálogo.</p>
        </div>
        <div className="admin-form-grid">
          <div className="field">
            <label htmlFor="parent-category-name">Nombre *</label>
            <input id="parent-category-name" required disabled={busy} value={values.name} onChange={(event) => {
              const name = event.target.value
              setValues((current) => ({ ...current, name, slug: slugEdited ? current.slug : slugify(name) }))
            }} />
          </div>
          <div className="field">
            <label htmlFor="parent-category-slug">Slug *</label>
            <input id="parent-category-slug" required disabled={busy} value={values.slug} onChange={(event) => {
              setSlugEdited(true)
              setValues((current) => ({ ...current, slug: slugify(event.target.value) }))
            }} />
          </div>
          <div className="field">
            <label htmlFor="parent-category-order">Orden</label>
            <input id="parent-category-order" type="number" step="1" min="-2147483648" max="2147483647" disabled={busy} value={values.sort_order} onChange={(event) => setValues((current) => ({ ...current, sort_order: event.target.value }))} />
          </div>
          <label className="toggle-field">
            <input type="checkbox" disabled={busy} checked={values.is_active} onChange={(event) => setValues((current) => ({ ...current, is_active: event.target.checked }))} />
            <span><strong>Activa</strong><small>Visible en la lista pública de categorías. Desactivarla conserva sus productos y subcategorías.</small></span>
          </label>
        </div>
        {error && <p className="form-banner form-banner--error" role="alert">{error}</p>}
        <div className="admin-form-actions">
          <button className="admin-button admin-button--secondary" type="button" disabled={busy} onClick={reset}>Cancelar</button>
          <button className="admin-button" disabled={busy}>{saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear categoría padre'}</button>
        </div>
      </form>
      <section className="admin-form-section">
        <div className="admin-form-section__heading"><h2>Categorías padre</h2><p>{categories.length} registradas.</p></div>
        <div className="admin-subcategory-list">
          {categories.map((category) => (
            <article key={category.id}>
              <div><strong>{category.name}</strong><small>{category.slug} · {category.is_active ? 'Activa' : 'Inactiva'} · Orden {category.sort_order}</small></div>
              <div>
                <button type="button" disabled={busy} onClick={() => edit(category)}>Editar</button>
                <button type="button" disabled={busy} onClick={() => toggle(category)}>{category.is_active ? 'Desactivar' : 'Activar'}</button>
              </div>
            </article>
          ))}
          {!categories.length && <p className="image-manager-empty">Aún no hay categorías padre.</p>}
        </div>
      </section>
    </section>
  )
}
