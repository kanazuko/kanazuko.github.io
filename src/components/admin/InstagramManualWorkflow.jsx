import { useCallback, useEffect, useState } from 'react'
import '../../instagram.css'
import InstagramManualPhoto from './InstagramManualPhoto'
import LoadingState from '../feedback/LoadingState'
import { useAsyncData } from '../../hooks/useAsyncData'
import { loadManualInstagramWorkspace, saveManualInstagramPost } from '../../services/instagramManualService'
import { DEFAULT_INSTAGRAM_TEMPLATE, generateInstagramCaption } from '../../utils/instagram'

function ManualWorkspace({ products, records: initialRecords, publishedProductIds, onDirtyChange }) {
  const [records, setRecords] = useState(initialRecords)
  const [productId, setProductId] = useState('')
  const [caption, setCaption] = useState('')
  const [url, setUrl] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [search, setSearch] = useState('')
  const [featuredOnly, setFeaturedOnly] = useState(false)
  useEffect(() => { onDirtyChange?.(dirty || busy) }, [dirty, busy, onDirtyChange])
  const categories = [...new Map(products.filter(item => item.category).map(item => [item.category.id, item.category])).values()].sort((a, b) => a.name.localeCompare(b.name, 'es'))
  const visibleProducts = products.filter(item => (!categoryId || item.category?.id === categoryId) && (!featuredOnly || item.is_featured) && item.name.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')))
  const publishedIds = new Set([...publishedProductIds, ...records.filter(item => item.completed_at).map(item => item.product_id)])
  const product = products.find(item => item.id === productId)
  const record = records.find(item => item.product_id === productId)

  function selectProduct(id) {
    if (dirty && !window.confirm('¿Descartar los cambios sin guardar?')) return
    const saved = records.find(item => item.product_id === id)
    setProductId(id); setCaption(saved?.caption || ''); setUrl(saved?.instagram_url || '')
    setConfirmed(false); setDirty(false); setError(''); setNotice('')
  }

  async function save(completed) {
    if (busy || !product || (completed && !record?.completed_at && !confirmed)) return
    setBusy(true); setError(''); setNotice('')
    try {
      const saved = await saveManualInstagramPost(product, record, caption, url, completed)
      setRecords(current => [saved, ...current.filter(item => item.id !== saved.id)])
      setUrl(saved.instagram_url); setDirty(false); setConfirmed(false)
      setNotice(saved.completed_at ? 'Producto marcado como completado. Enlace guardado.' : 'Borrador guardado.')
    } catch (failure) { setError(failure.message) } finally { setBusy(false) }
  }

  return <div className="instagram-workspace">
    {error && <p className="form-banner form-banner--error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <fieldset className="instagram-fields" disabled={busy}>
      <legend>1. Selecciona un producto</legend>
      <label>Buscar producto<input type="search" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <label>Categoría<select aria-label="Categoría" value={categoryId} onChange={event => setCategoryId(event.target.value)}><option value="">Todas las categorías</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <label><span><input type="checkbox" checked={featuredOnly} onChange={event => setFeaturedOnly(event.target.checked)} /> Solo destacados</span></label>
      <label>Producto<select aria-label="Producto" value={productId} onChange={event => selectProduct(event.target.value)}>
        <option value="">Seleccionar producto…</option>
        {product && !visibleProducts.some(item => item.id === productId) && <option value={productId}>{publishedIds.has(productId) ? '✓ Publicado · ' : ''}{product.name} (seleccionado fuera del filtro)</option>}
        {visibleProducts.map(item => <option key={item.id} value={item.id}>{publishedIds.has(item.id) ? '✓ Publicado · ' : ''}{item.name}</option>)}
      </select></label>
      {!visibleProducts.length && products.length > 0 && <p>No hay productos que coincidan con los filtros.</p>}
      <small>✓ Publicado en Instagram mediante la API o completado manualmente.</small>
      {!products.length && <p>No hay productos en el catálogo.</p>}
    </fieldset>
    {product && <>
      <fieldset className="instagram-fields" disabled={busy}>
        <legend>2. Prepara la descripción</legend>
        <button type="button" className="admin-button admin-button--secondary" onClick={() => {
          if (caption && !window.confirm('¿Reemplazar la descripción actual?')) return
          setCaption(generateInstagramCaption([product], DEFAULT_INSTAGRAM_TEMPLATE)); setDirty(true)
        }}>Generar descripción</button>
        <label>Descripción editable<textarea rows={8} value={caption} onChange={event => { setCaption(event.target.value); setDirty(true) }} /></label>
        <small>{[...caption].length}/2200 caracteres</small>
        <div className="instagram-actions">
          <button type="button" className="admin-button admin-button--secondary" disabled={!caption} onClick={async () => {
            try { await navigator.clipboard.writeText(caption); setNotice('Descripción copiada.'); setError('') }
            catch { setError('No se pudo copiar. Selecciona el texto y cópialo manualmente.') }
          }}>Copiar descripción</button>
          <button type="button" className="admin-button" onClick={() => save(Boolean(record?.completed_at))}>Guardar {record?.completed_at ? 'cambios' : 'borrador'}</button>
        </div>
      </fieldset>
      <fieldset className="instagram-fields" disabled={busy}>
        <legend>3. Descarga las fotos</legend>
        <p>Las miniaturas usan JPEG a resolución original, sin recortes ni márgenes añadidos. Puedes abrirlas, arrastrarlas o descargarlas. Si Instagram no acepta el arrastre desde otra pestaña, descarga el JPG y arrastra el archivo.</p>
        <div className="instagram-image-grid">{product.images.map((image, index) => <InstagramManualPhoto key={`${image.id}:${image.url}`} image={image} index={index} productName={product.name} />)}</div>
        {!product.images.length && <p>Este producto no tiene fotos. Añádelas desde la edición del producto.</p>}
      </fieldset>
      <section>
        <h2>4. Publica en Instagram</h2>
        <p>Abre Instagram con la cuenta de la tienda, crea una publicación, sube las fotos descargadas y pega la descripción.</p>
        <a className="admin-button admin-button--secondary" href="https://www.instagram.com/" target="_blank" rel="noopener noreferrer">Abrir Instagram</a>
      </section>
      <fieldset className="instagram-fields" disabled={busy}>
        <legend>5. Registra la publicación</legend>
        <label>Enlace de la publicación<input type="url" placeholder="https://www.instagram.com/p/…/" value={url} onChange={event => { setUrl(event.target.value); setDirty(true) }} /></label>
        {record?.completed_at ? <p>✓ Completado el {new Date(record.completed_at).toLocaleString('es-MX')}. Puedes corregir el enlace y guardar los cambios.</p> : <>
          <label><span><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> Ya publiqué este producto manualmente en Instagram.</span></label>
          <button type="button" className="admin-button" disabled={!confirmed || !url.trim()} onClick={() => save(true)}>Marcar como completado</button>
        </>}
        {record?.instagram_url && <a href={record.instagram_url} target="_blank" rel="noopener noreferrer">Ver publicación guardada</a>}
      </fieldset>
      {dirty && <p role="status">Hay cambios sin guardar.</p>}
    </>}
    <section className="instagram-history">
      <h2>Publicaciones completadas manualmente</h2>
      {!records.some(item => item.completed_at) && <p>Aún no hay publicaciones completadas.</p>}
      {records.filter(item => item.completed_at).map(item => <article key={item.id}>
        <div><strong>{item.product_name}</strong><p>{new Date(item.completed_at).toLocaleString('es-MX')}</p></div>
        <a href={item.instagram_url} target="_blank" rel="noopener noreferrer">Ver en Instagram</a>
      </article>)}
    </section>
  </div>
}

export default function InstagramManualWorkflow({ onDirtyChange }) {
  const [revision, setRevision] = useState(0)
  const loader = useCallback(async () => ({ ...await loadManualInstagramWorkspace(), revision }), [revision])
  const { data, loading, error } = useAsyncData(loader)
  return <div className="admin-page">
    <header className="admin-page__header"><div><h1>Instagram · publicación manual</h1><p>Prepara el contenido aquí, publícalo desde Instagram y registra el enlace al terminar.</p></div></header>
    {loading ? <LoadingState label="Cargando productos y publicaciones…" /> : error ? <div><p role="alert">{error.message}</p><button type="button" className="admin-button" onClick={() => setRevision(value => value + 1)}>Reintentar</button></div> : data && <ManualWorkspace {...data} onDirtyChange={onDirtyChange} />}
  </div>
}
