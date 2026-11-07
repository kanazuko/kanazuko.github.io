import { useEffect, useState } from 'react'
import '../../instagram.css'
import { DEFAULT_INSTAGRAM_TEMPLATE, createInstagramJpeg, generateInstagramCaption, selectPreviewImages, validateInstagramDraft } from '../../utils/instagram'
import { advanceInstagramPublication, checkInstagramPublishingAccess, deleteInstagramDraft, instagramErrorMessage, loadInstagramCatalog, loadInstagramDrafts, loadInstagramPublishedProductIds, preparedImageUrl, prepareInstagramDraft, reviewInstagramPublication, saveInstagramDraft, sourceImageUrl } from '../../services/instagramService'

const freshDraft = () => ({ id: crypto.randomUUID(), revision: 0, mode: 'single', product_ids: [], image_ids: [], caption: '', template: DEFAULT_INSTAGRAM_TEMPLATE, status: 'draft', prepared_images: [] })
const canDelete = row => row.revision > 0 && !row.publish_attempt_id && !row.container_id && !row.instagram_id && ['draft', 'preparing', 'prepared', 'preparation_failed', 'cleanup_failed', 'cleaning', 'uploading'].includes(row.status)
const canCancel = row => row.status === 'publishing' && row.publish_progress?.phase === 'creating' && !row.container_id && !row.instagram_id && Array.isArray(row.publish_progress.children) && row.publish_progress.children.length === 0
const canContinue = row => row.status === 'publishing' && !row.instagram_id && ['creating', 'waiting', 'ready'].includes(row.publish_progress?.phase)
const displayState = row => row.instagram_id ? 'Publicado' : canCancel(row) ? 'Pendiente de continuar · aún sin envío' : stateNames[row.status] || row.status
const stateNames = { draft: 'Borrador', preparing: 'Preparación incompleta', uploading: 'Operación en curso', prepared: 'Preparado', preparation_failed: 'Preparación fallida', cleaning: 'Limpiando', cleanup_failed: 'Limpieza pendiente', publishing: 'Publicando', publish_unknown: 'Resultado por conciliar', published: 'Publicado', publish_failed: 'Publicación fallida' }

export default function InstagramComposer() {
  const [catalog, setCatalog] = useState([])
  const [history, setHistory] = useState([])
  const [publishedProductIds, setPublishedProductIds] = useState(new Set())
  const [draft, setDraft] = useState(freshDraft)
  const [dirty, setDirty] = useState(true)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [productPriority, setProductPriority] = useState('name')
  const [previewIndex, setPreviewIndex] = useState(0)
  const [review, setReview] = useState(null)
  const [reviewAccepted, setReviewAccepted] = useState(false)
  const locked = busy || loading || draft.status !== 'draft'
  const categories = [...new Map(catalog.filter(product => product.category).map(product => [product.category.id, product.category])).values()].sort((a, b) => a.name.localeCompare(b.name, 'es'))
  const priority = product => productPriority === 'featured' ? Boolean(product.is_featured) : productPriority === `category:${product.category?.id}`
  const visibleProducts = catalog
    .filter(product => product.name.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')))
    .sort((a, b) => Number(priority(b)) - Number(priority(a)) || a.name.localeCompare(b.name, 'es'))
  const products = catalog.filter((product) => draft.product_ids.includes(product.id))
  const images = catalog.flatMap((product) => product.images)
  const selectedImages = selectPreviewImages(draft, images, dirty)
  const previewImage = selectedImages[previewIndex] || selectedImages[0]
  const prepared = draft.prepared_images?.find((image) => image.image_id === previewImage?.id && image.sha256)
  let previewUrl = ''
  try { previewUrl = prepared ? preparedImageUrl(prepared.path) : previewImage ? sourceImageUrl(previewImage) : '' } catch { /* Invalid source paths are not rendered. */ }

  async function reload() {
    const [rows, publishedIds] = await Promise.all([loadInstagramDrafts(), loadInstagramPublishedProductIds()])
    setHistory(rows)
    setPublishedProductIds(publishedIds)
    return rows
  }
  useEffect(() => {
    let active = true
    Promise.all([loadInstagramCatalog(), loadInstagramDrafts(), loadInstagramPublishedProductIds()]).then(([items, rows, publishedIds]) => {
      if (active) { setCatalog(items); setHistory(rows); setPublishedProductIds(publishedIds) }
    }).catch((failure) => { if (active) setError(failure.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  function change(changes) {
    setDraft((current) => ({ ...current, ...changes }))
    setDirty(true); setNotice(''); setError('')
  }
  function toggleProduct(product) {
    const selected = draft.product_ids.includes(product.id)
    change({ product_ids: selected ? draft.product_ids.filter((id) => id !== product.id) : [...draft.product_ids, product.id], image_ids: selected ? draft.image_ids.filter((id) => !product.images.some((image) => image.id === id)) : draft.image_ids })
    setPreviewIndex(0)
  }
  function moveImage(index, direction) {
    const next = [...draft.image_ids]
    ;[next[index], next[index + direction]] = [next[index + direction], next[index]]
    change({ image_ids: next }); setPreviewIndex(0)
  }
  async function save() {
    const validation = validateInstagramDraft(draft, images)
    if (validation) { setError(validation); return }
    setBusy(true); setError(''); setNotice('')
    try {
      setDraft(await saveInstagramDraft(draft)); setDirty(false)
      setNotice('Borrador guardado. No se envió contenido a Instagram.')
      await reload()
    } catch (failure) { setError(failure.message) } finally { setBusy(false) }
  }
  async function prepare() {
    setBusy(true); setError(''); setNotice('Verificando permisos de publicación…')
    try {
      let current = draft.status === 'draft' ? await prepareInstagramDraft(draft, 'begin') : draft
      setDraft(current)
      for (const [index, image] of current.images.entries()) {
        if (current.prepared_images[index]?.sha256) continue
        setNotice(`Preparando fotografía ${index + 1} de ${current.images.length}…`)
        const jpeg = await createInstagramJpeg(sourceImageUrl(image))
        current = await prepareInstagramDraft(current, 'upload', image.id, jpeg)
        setDraft(current)
      }
      setNotice('Verificando archivos públicos y permisos…')
      current = await prepareInstagramDraft(current, 'finish')
      setDraft(current)
      setNotice('Preparación completa. Revisa los JPEG finales y pulsa «Revisar antes de publicar» para confirmar el envío.')
      await reload()
    } catch (failure) {
      setNotice(''); setError(failure.message)
      try { const rows = await reload(); const current = rows.find((row) => row.id === draft.id); if (current) setDraft(current) } catch { /* Keep saved ID for recovery. */ }
    } finally { setBusy(false) }
  }
  async function reset() {
    setBusy(true); setError(''); setNotice('')
    try {
      setDraft(await prepareInstagramDraft(draft, 'reset')); setDirty(false)
      setNotice('Copias preparadas eliminadas. Puedes editar el borrador; las fotografías originales se conservan.')
      await reload()
    } catch (failure) { setError(failure.message) } finally { setBusy(false) }
  }
  async function removeDraft(row) {
    if (!window.confirm('¿Eliminar este borrador y sus copias preparadas? Las fotografías originales de los productos se conservarán. Esta acción no se puede deshacer.')) return
    setBusy(true); setError(''); setNotice('')
    try {
      await deleteInstagramDraft(row)
      setHistory(current => current.filter(item => item.id !== row.id))
      if (draft.id === row.id) { setDraft(freshDraft()); setDirty(true); setPreviewIndex(0); setReview(null); setReviewAccepted(false) }
      setNotice('Borrador eliminado. Las fotografías originales se conservaron.')
    } catch (failure) {
      setError(failure.message)
      try { const rows = await reload(); const current = rows.find(item => item.id === draft.id); if (current && !dirty) setDraft(current) } catch { /* Keep the saved record available for recovery. */ }
    } finally { setBusy(false) }
  }
  async function checkAccess() {
    setBusy(true); setError(''); setNotice('Verificando acceso de publicación sin modificar el borrador…')
    try {
      const access = await checkInstagramPublishingAccess(draft)
      setNotice(`Acceso de publicación y cuota disponibles para @${access.username} (ID ${access.account_id}), comprobados el ${new Date(access.checked_at).toLocaleString('es-MX')}. No se creó contenido en Meta.`)
    } catch (failure) { setNotice(''); setError(failure.message) } finally { setBusy(false) }
  }
  async function publishStep(action, target = draft) {
    if (target.id !== draft.id && dirty && (draft.product_ids.length || draft.caption) && !window.confirm('¿Descartar los cambios sin guardar para abrir este registro?')) return
    if (action === 'cancel' && !window.confirm('¿Cancelar este intento antes del envío? Volverá a Preparado y podrás eliminar el borrador.')) return
    if (action === 'start' && (!reviewAccepted || !review?.publishing_enabled || !window.confirm(`¿Publicar este borrador, revisión ${draft.revision}, en @prartjewelry? Esta acción enviará el contenido a Instagram.`))) return
    setBusy(true); setError(''); setNotice('Procesando un paso del intento…')
    try {
      const current = await advanceInstagramPublication(target, action, review?.digest)
      setDraft(current); setDirty(false); setReview(null); setReviewAccepted(false)
      setNotice(action === 'cancel' ? 'Intento cancelado antes del envío. Puedes continuar editando o eliminar el borrador.' : current.status === 'published' ? 'Publicación confirmada por Meta.' : 'Paso guardado. Revisa el estado antes de continuar. No cierres ni dupliques el intento.')
      await reload()
    } catch (failure) {
      setNotice(''); setError(failure.message)
      try { const rows = await reload(); const current = rows.find(row => row.id === draft.id); if (current) setDraft(current) } catch { /* Never retry a write after a lost response. */ }
    } finally { setBusy(false) }
  }
  function open(row) {
    if (dirty && (draft.product_ids.length || draft.caption) && !window.confirm('¿Descartar los cambios sin guardar?')) return
    setReview(null); setReviewAccepted(false)
    setDraft(row); setDirty(false); setPreviewIndex(0); setError(''); setNotice('')
  }

  return (
    <div className="instagram-workspace">
      <section className="admin-form-section">
        <div className="admin-form-section__heading"><h2>Preparar publicación</h2><p>Guarda un borrador y prepara sus imágenes antes de publicar.</p></div>
        <p><strong>Estado:</strong> {displayState(draft)}{dirty ? ' · cambios sin guardar' : ''}</p>
        <button className="admin-button admin-button--secondary" type="button" disabled={busy || loading} onClick={() => { if (!dirty || (!draft.product_ids.length && !draft.caption) || window.confirm('¿Descartar los cambios sin guardar?')) { setDraft(freshDraft()); setDirty(true); setPreviewIndex(0); setError(''); setNotice('') } }}>Nuevo borrador</button>
        <fieldset disabled={locked} className="instagram-fields">
          <legend>Productos y fotografías</legend>
          <label>Buscar productos<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre del producto" /></label>
          <small>✓ indica que el producto ya tiene una publicación en Instagram.</small>
          <label>Mostrar primero<select value={productPriority} onChange={event => setProductPriority(event.target.value)}>
            <option value="name">Nombre (A–Z)</option>
            <option value="featured">Destacados</option>
            {categories.map(category => <option key={category.id} value={`category:${category.id}`}>Categoría: {category.name}</option>)}
          </select></label>
          <div className="instagram-product-list">
            {visibleProducts.map((product) => (
              <label key={product.id}><span className="instagram-published-marker" title={publishedProductIds.has(product.id) ? 'Publicado en Instagram' : undefined} role={publishedProductIds.has(product.id) ? 'img' : undefined} aria-label={publishedProductIds.has(product.id) ? 'Publicado en Instagram' : undefined} aria-hidden={publishedProductIds.has(product.id) ? undefined : true}>{publishedProductIds.has(product.id) ? '✓' : ''}</span><input type="checkbox" checked={draft.product_ids.includes(product.id)} disabled={!draft.product_ids.includes(product.id) && draft.product_ids.length >= 10} onChange={() => toggleProduct(product)} />{product.name} · ${Number(product.price).toFixed(2)} MXN</label>
            ))}
            {!loading && !visibleProducts.length && <p>No se encontraron productos.</p>}
          </div>
          {products.map((product) => <div key={product.id}><h3>{product.name}</h3><div className="instagram-image-grid">
            {product.images.map((image) => <label key={image.id} className="instagram-image-choice"><img src={image.url} alt={image.alt_text || product.name} loading="lazy" /><span><input type="checkbox" checked={draft.image_ids.includes(image.id)} disabled={!draft.image_ids.includes(image.id) && draft.image_ids.length >= 10} onChange={() => { change({ image_ids: draft.image_ids.includes(image.id) ? draft.image_ids.filter((id) => id !== image.id) : [...draft.image_ids, image.id] }); setPreviewIndex(0) }} />Seleccionar foto</span></label>)}
            {!product.images.length && <p>Este producto no tiene fotografías.</p>}
          </div></div>)}
          <label>Formato<select value={draft.mode} onChange={(event) => change({ mode: event.target.value })}><option value="single">Individual · 1 fotografía</option><option value="carousel">Carrusel · 2 a 10 fotografías</option></select></label>
          <ol className="instagram-order-list">{selectedImages.map((image, index) => <li key={image.id}><span>Foto {index + 1} · {catalog.find((product) => product.id === image.product_id)?.name || 'Producto guardado'}</span><button type="button" disabled={index === 0} aria-label={`Subir foto ${index + 1}`} onClick={() => moveImage(index, -1)}>↑</button><button type="button" disabled={index === selectedImages.length - 1} aria-label={`Bajar foto ${index + 1}`} onClick={() => moveImage(index, 1)}>↓</button></li>)}</ol>
        </fieldset>
        <fieldset disabled={locked} className="instagram-fields">
          <legend>Descripción</legend>
          <label>Plantilla por producto<textarea rows={5} maxLength={4000} value={draft.template} onChange={(event) => change({ template: event.target.value })} /></label>
          <small>Campos disponibles: {'{nombre}'}, {'{precio}'}, {'{descripcion}'}. La plantilla se guarda en este borrador.</small>
          <button className="admin-button admin-button--secondary" type="button" disabled={!products.length} onClick={() => { if (!draft.caption || window.confirm('¿Reemplazar la descripción actual con la plantilla?')) change({ caption: generateInstagramCaption(products, draft.template) }) }}>Generar descripción</button>
          <label>Descripción editable<textarea rows={8} value={draft.caption} onChange={(event) => change({ caption: event.target.value })} /></label>
          <small>{[...draft.caption].length}/2200 caracteres · máximo 30 hashtags y 20 menciones</small>
        </fieldset>
        {error && <p className="form-banner form-banner--error" role="alert">{error}</p>}
        {draft.error_code && !error && <p className="form-banner form-banner--error" role="alert">{instagramErrorMessage(draft.error_code)}</p>}
        <p role="status" aria-live="polite">{loading ? 'Cargando productos e historial…' : notice}</p>
        <div className="instagram-actions">
          <button className="admin-button" type="button" disabled={locked || !dirty} onClick={save}>Guardar borrador</button>
          <button className="admin-button" type="button" disabled={busy || dirty || !draft.revision || !['draft', 'preparing'].includes(draft.status)} onClick={prepare}>{draft.status === 'preparing' ? 'Continuar preparación' : 'Preparar imágenes y verificar permisos'}</button>
          <button className="admin-button admin-button--secondary" type="button" disabled={busy || dirty || !draft.revision} onClick={checkAccess}>Verificar permisos de publicación</button>
          {canDelete(draft) && <button className="admin-button instagram-delete" type="button" disabled={busy} onClick={() => removeDraft(draft)}>Eliminar borrador</button>}
          {draft.revision > 0 && draft.status !== 'draft' && !['publishing', 'published', 'publish_unknown'].includes(draft.status) && <button className="admin-button admin-button--secondary" type="button" disabled={busy} onClick={reset}>Limpiar preparación y editar</button>}
        </div>
      </section>
      <section className="admin-form-section">
        <div className="admin-form-section__heading"><h2>Vista previa</h2><p>{prepared ? 'JPEG validado por el servidor.' : 'Composición aproximada. Las copias finales se verifican al preparar.'}</p></div>
        <div className="instagram-preview">
          <strong>@prartjewelry</strong>
          {previewUrl ? <img src={previewUrl} alt={`Vista previa de la foto ${previewIndex + 1}`} /> : <p>Selecciona una fotografía.</p>}
          {selectedImages.length > 1 && <div className="instagram-actions"><button type="button" onClick={() => setPreviewIndex((index) => Math.max(0, index - 1))} disabled={previewIndex === 0}>Anterior</button><span>{Math.min(previewIndex + 1, selectedImages.length)} / {selectedImages.length}</span><button type="button" onClick={() => setPreviewIndex((index) => Math.min(selectedImages.length - 1, index + 1))} disabled={previewIndex >= selectedImages.length - 1}>Siguiente</button></div>}
          <p className="instagram-caption">{draft.caption || 'Tu descripción aparecerá aquí.'}</p>
        </div>
        {draft.permission_checked_at && <p>Permisos y cuota comprobados: {new Date(draft.permission_checked_at).toLocaleString('es-MX')}. Se deberán comprobar nuevamente al publicar.</p>}
        {draft.instagram_id && <p>ID de publicación: {draft.instagram_id}</p>}
        {draft.published_at && <p>Publicado: {new Date(draft.published_at).toLocaleString('es-MX')}</p>}
        {/^https:\/\/(www\.)?instagram\.com\//.test(draft.instagram_url || '') && <p><a href={draft.instagram_url} target="_blank" rel="noopener noreferrer">Ver publicación en Instagram</a></p>}
        <button className="admin-button" type="button" disabled={busy || dirty || draft.status !== 'prepared' || review?.id !== draft.id || review?.revision !== draft.revision || !review?.publishing_enabled || !reviewAccepted} onClick={() => publishStep('start')} aria-describedby="instagram-publish-lock">Publicar en Instagram</button>
        {draft.status === 'publishing' && ['creating', 'waiting', 'ready', 'metadata'].includes(draft.publish_progress?.phase) && <div>
          <p>Paso: {draft.publish_progress.phase}. Si espera un contenedor, deja transcurrir un minuto entre consultas. El envío requiere que Meta confirme que está listo.</p>
          <button className="admin-button" type="button" disabled={busy} onClick={() => publishStep('continue')}>Continuar intento confirmado</button>
        </div>}
        {draft.status === 'publish_unknown' && <button className="admin-button admin-button--secondary" type="button" disabled={busy} onClick={() => publishStep('reconcile')}>Consultar resultado sin reenviar</button>}
        {canCancel(draft) && <button className="admin-button admin-button--secondary" type="button" disabled={busy} onClick={() => publishStep('cancel')}>Cancelar intento sin enviar</button>}
        {draft.instagram_id && !draft.instagram_url && <button className="admin-button admin-button--secondary" type="button" disabled={busy} onClick={() => publishStep('reconcile')}>Recuperar enlace sin reenviar</button>}
        <button className="admin-button admin-button--secondary" type="button" disabled={busy || dirty || draft.status !== 'prepared'} onClick={async () => {
          setBusy(true); setError(''); setReview(null); setReviewAccepted(false)
          try { setReview(await reviewInstagramPublication(draft)) } catch (failure) { setError(failure.message) } finally { setBusy(false) }
        }}>Revisar antes de publicar</button>
        {review && review.id === draft.id && review.revision === draft.revision && draft.status === 'prepared' && !dirty && <div role="region" aria-label="Revisión de publicación">
          <p>Destino: @{review.username} · ID {review.account_id}</p>
          <p>Borrador {review.id} · revisión {review.revision} · {review.image_count} foto(s)</p>
          <p className="instagram-caption">{review.caption}</p>
          <label><input type="checkbox" checked={reviewAccepted} onChange={event => setReviewAccepted(event.target.checked)} />He revisado las fotografías, su orden y la descripción.</label>
          <p>{reviewAccepted ? review.publishing_enabled ? 'Revisión completada. Pulsa «Publicar en Instagram» y confirma el envío.' : 'Revisión completada. El servidor no ha habilitado el envío para esta cuenta.' : 'Revisa también todas las fotografías de la vista previa.'}</p>
        </div>}
        <p id="instagram-publish-lock">{review?.publishing_enabled ? 'Publicación habilitada para @prartjewelry. Cada envío requiere tu confirmación.' : 'Abre un borrador preparado y pulsa «Revisar antes de publicar» para comprobar si puedes enviarlo. Preparar no publica contenido.'}</p>
      </section>
      <section className="admin-form-section">
        <div className="admin-form-section__heading"><h2>Historial</h2><p>Últimos 50 borradores y publicaciones.</p></div>
        <button className="admin-button admin-button--secondary" type="button" disabled={busy} onClick={async () => { try { await reload(); setError('') } catch (failure) { setError(failure.message) } }}>Actualizar historial</button>
        <div className="instagram-history">{history.map((row) => <article key={row.id}>
          <div><strong>{displayState(row)}</strong><p>{row.products.map((product) => product.name).join(', ')}</p><small>{new Date(row.created_at).toLocaleString('es-MX')} · {row.image_ids.length} foto(s)</small>{row.error_code && <p>{instagramErrorMessage(row.error_code)}</p>}</div>
          <div className="instagram-actions">
            <button className="admin-button admin-button--secondary" type="button" disabled={busy} onClick={() => open(row)}>Abrir borrador</button>
            {canContinue(row) && <button className="admin-button" type="button" disabled={busy} onClick={() => publishStep('continue', row)}>Continuar publicación</button>}
            {canCancel(row) && <button className="admin-button admin-button--secondary" type="button" disabled={busy} onClick={() => publishStep('cancel', row)}>Cancelar intento sin enviar</button>}
            {row.instagram_id && !row.instagram_url && <button className="admin-button admin-button--secondary" type="button" disabled={busy} onClick={() => publishStep('reconcile', row)}>Recuperar enlace sin reenviar</button>}
            {canDelete(row) && <button className="admin-button instagram-delete" type="button" disabled={busy} onClick={() => removeDraft(row)}>Eliminar borrador</button>}
          </div>
        </article>)}</div>
        {!loading && !history.length && <p>Aún no hay borradores guardados.</p>}
      </section>
    </div>
  )
}
