import { useState } from 'react'
import { slugify, toTitleCase } from '../../utils/formatters'

const availabilityOptions = [
  { value: 'available', label: 'Disponible' },
  { value: 'out_of_stock', label: 'Agotado' },
  { value: 'made_to_order', label: 'Sobre pedido' },
]

const emptyProduct = {
  category_id: '',
  sku: '',
  name: '',
  slug: '',
  description: '',
  price: '',
  compare_at_price: '',
  material: 'Acero Inoxidable',
  color: '',
  size: '',
  attributes: '{}',
  availability: 'available',
  is_published: true,
  is_featured: false,
  sort_order: '0',
}

function createInitialValues(product, categories) {
  if (!product) {
    const aretesCategory = categories.find((category) => category.name.trim().toLocaleLowerCase('es-MX') === 'aretes')
    return { ...emptyProduct, category_id: aretesCategory?.id ?? '' }
  }
  return {
    category_id: product.category_id ?? '',
    sku: product.sku ?? '',
    name: product.name ?? '',
    slug: product.slug ?? '',
    description: product.description ?? '',
    price: String(product.price ?? ''),
    compare_at_price: product.compare_at_price == null ? '' : String(product.compare_at_price),
    material: product.material ?? '',
    color: product.color ?? '',
    size: product.size ?? '',
    attributes: JSON.stringify(product.attributes ?? {}, null, 2),
    availability: product.availability ?? 'available',
    is_published: Boolean(product.is_published),
    is_featured: Boolean(product.is_featured),
    sort_order: String(product.sort_order ?? 0),
  }
}

function validate(values) {
  const errors = {}
  const price = Number(values.price)
  const comparePrice = values.compare_at_price === '' ? null : Number(values.compare_at_price)
  const sortOrder = Number(values.sort_order)

  if (!values.name.trim()) errors.name = 'El nombre es obligatorio.'
  if (!values.slug.trim()) errors.slug = 'El slug es obligatorio.'
  if (values.price === '' || Number.isNaN(price) || price < 0) errors.price = 'Ingresa un precio igual o mayor que cero.'
  if (comparePrice !== null && (Number.isNaN(comparePrice) || comparePrice <= price)) {
    errors.compare_at_price = 'El precio anterior debe ser mayor que el precio actual.'
  }
  if (!Number.isInteger(sortOrder)) errors.sort_order = 'El orden debe ser un número entero.'

  try {
    const attributes = JSON.parse(values.attributes || '{}')
    if (!attributes || Array.isArray(attributes) || typeof attributes !== 'object') {
      errors.attributes = 'Los atributos deben ser un objeto JSON.'
    }
  } catch {
    errors.attributes = 'El JSON de atributos no es válido.'
  }

  return errors
}

function nullable(value) {
  const trimmed = value.trim()
  return trimmed || null
}

export default function ProductForm({ product, categories, submitting, serverError, onSubmit, onCancel }) {
  const [values, setValues] = useState(() => createInitialValues(product, categories))
  const [errors, setErrors] = useState({})
  const [slugEdited, setSlugEdited] = useState(Boolean(product?.slug))

  function change(name, value) {
    setValues((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: undefined }))
  }

  function handleNameChange(value) {
    setValues((current) => ({
      ...current,
      name: value,
      slug: slugEdited ? current.slug : slugify(value),
    }))
    setErrors((current) => ({ ...current, name: undefined, slug: undefined }))
  }

  function handleSubmit(event) {
    event.preventDefault()
    const validationErrors = validate(values)
    setErrors(validationErrors)
    if (Object.keys(validationErrors).length) return

    onSubmit({
      category_id: values.category_id || null,
      sku: nullable(values.sku),
      name: toTitleCase(values.name),
      slug: values.slug.trim(),
      description: nullable(values.description),
      price: Number(values.price),
      compare_at_price: values.compare_at_price === '' ? null : Number(values.compare_at_price),
      material: nullable(values.material),
      color: nullable(values.color),
      size: nullable(values.size),
      attributes: JSON.parse(values.attributes || '{}'),
      availability: values.availability,
      is_published: values.is_published,
      is_featured: values.is_featured,
      sort_order: Number(values.sort_order),
    })
  }

  return (
    <form className="product-form" onSubmit={handleSubmit} noValidate>
      {serverError && <p className="form-banner form-banner--error" role="alert">{serverError}</p>}

      <section className="admin-form-section">
        <div className="admin-form-section__heading"><h2>Información principal</h2><p>Los datos que identifican la pieza en el catálogo.</p></div>
        <div className="admin-form-grid">
          <div className="field field--wide">
            <label htmlFor="product-name">Nombre *</label>
            <input id="product-name" value={values.name} onChange={(event) => handleNameChange(event.target.value)} aria-invalid={Boolean(errors.name)} />
            {errors.name && <small className="field-error">{errors.name}</small>}
          </div>
          <div className="field">
            <label htmlFor="product-slug">Slug *</label>
            <input id="product-slug" value={values.slug} onChange={(event) => { setSlugEdited(true); change('slug', slugify(event.target.value)) }} aria-invalid={Boolean(errors.slug)} />
            {errors.slug && <small className="field-error">{errors.slug}</small>}
          </div>
          <div className="field">
            <label htmlFor="product-sku">SKU</label>
            <input id="product-sku" value={values.sku} onChange={(event) => change('sku', event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="product-category">Categoría</label>
            <select id="product-category" value={values.category_id} onChange={(event) => change('category_id', event.target.value)}>
              <option value="">Sin categoría</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.is_active ? '' : ' (inactiva)'}</option>)}
            </select>
          </div>
          <div className="field field--wide">
            <label htmlFor="product-description">Descripción</label>
            <textarea id="product-description" rows="5" value={values.description} onChange={(event) => change('description', event.target.value)} />
          </div>
        </div>
      </section>

      <section className="admin-form-section">
        <div className="admin-form-section__heading"><h2>Precio y características</h2><p>Información comercial y detalles de la pieza.</p></div>
        <div className="admin-form-grid">
          <div className="field"><label htmlFor="product-price">Precio *</label><input id="product-price" type="number" min="0" step="0.01" value={values.price} onChange={(event) => change('price', event.target.value)} aria-invalid={Boolean(errors.price)} />{errors.price && <small className="field-error">{errors.price}</small>}</div>
          <div className="field"><label htmlFor="product-compare-price">Precio anterior</label><input id="product-compare-price" type="number" min="0" step="0.01" value={values.compare_at_price} onChange={(event) => change('compare_at_price', event.target.value)} aria-invalid={Boolean(errors.compare_at_price)} />{errors.compare_at_price && <small className="field-error">{errors.compare_at_price}</small>}</div>
          <div className="field"><label htmlFor="product-material">Material</label><input id="product-material" value={values.material} onChange={(event) => change('material', event.target.value)} /></div>
          <div className="field"><label htmlFor="product-color">Color</label><input id="product-color" value={values.color} onChange={(event) => change('color', event.target.value)} /></div>
          <div className="field"><label htmlFor="product-size">Talla</label><input id="product-size" value={values.size} onChange={(event) => change('size', event.target.value)} /></div>
          <div className="field"><label htmlFor="product-availability">Disponibilidad</label><select id="product-availability" value={values.availability} onChange={(event) => change('availability', event.target.value)}>{availabilityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
          <div className="field"><label htmlFor="product-order">Orden</label><input id="product-order" type="number" step="1" value={values.sort_order} onChange={(event) => change('sort_order', event.target.value)} aria-invalid={Boolean(errors.sort_order)} />{errors.sort_order && <small className="field-error">{errors.sort_order}</small>}</div>
          <div className="field field--wide"><label htmlFor="product-attributes">Atributos adicionales (JSON)</label><textarea id="product-attributes" className="code-input" rows="5" value={values.attributes} onChange={(event) => change('attributes', event.target.value)} aria-invalid={Boolean(errors.attributes)} />{errors.attributes && <small className="field-error">{errors.attributes}</small>}<small className="field-help">Ejemplo: {`{"acabado": "mate"}`}</small></div>
        </div>
      </section>

      <section className="admin-form-section">
        <div className="admin-form-section__heading"><h2>Visibilidad</h2><p>Controla cómo aparece la pieza en la tienda.</p></div>
        <div className="toggle-grid">
          <label className="toggle-field"><input type="checkbox" checked={values.is_published} onChange={(event) => change('is_published', event.target.checked)} /><span><strong>Publicado</strong><small>Visible en el catálogo público.</small></span></label>
          <label className="toggle-field"><input type="checkbox" checked={values.is_featured} onChange={(event) => change('is_featured', event.target.checked)} /><span><strong>Destacado</strong><small>Aparece en la selección de inicio.</small></span></label>
        </div>
      </section>

      <div className="admin-form-actions">
        <button className="admin-button admin-button--secondary" type="button" onClick={onCancel} disabled={submitting}>Cancelar</button>
        <button className="admin-button" type="submit" disabled={submitting}>{submitting ? 'Guardando…' : product ? 'Guardar cambios' : 'Crear producto'}</button>
      </div>
    </form>
  )
}
