import { useCallback, useState } from 'react'
import '../../instagram.css'
import SafeImage from '../catalog/SafeImage'
import LoadingState from '../feedback/LoadingState'
import { useAsyncData } from '../../hooks/useAsyncData'
import { loadManualInstagramWorkspace, saveManualInstagramPost, downloadManualInstagramPhoto } from '../../services/instagramManualService'
import { DEFAULT_INSTAGRAM_TEMPLATE, generateInstagramCaption } from '../../utils/instagram'

function ManualWorkspace({ products, records: initialRecords }) {
  const [records, setRecords] = useState(initialRecords)
  const [productId, setProductId] = useState('')
  const [caption, setCaption] = useState('')
  const [url, setUrl] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
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

  async function download(image, index) {
    setBusy(true); setError(''); setNotice('')
    try {
      await downloadManualInstagramPhoto(image, index)
      setNotice(`Descarga de la foto ${index + 1} iniciada. Revisa las descargas de tu navegador.`)
    } catch (failure) { setError(failure.message || 'No se pudo descargar la foto.') } finally { setBusy(false) }
  }

  return <div className="instagram-workspace">
    {error && <p className="form-banner form-banner--error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <fieldset className="instagram-fields" disabled={busy}>
      <legend>1. Selecciona un producto</legend>
      <label>Producto<select aria-label="Producto" value={productId} onChange={event => selectProduct(event.target.value)}>
        <option value="">Seleccionar producto…</option>
        {products.map(item => <option key={item.id} value={item.id}>{records.some(saved => saved.product_id === item.id && saved.completed_at) ? '✓ Completado · ' : ''}{item.name}</option>)}
      </select></label>
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
        <p>Descarga las fotos que usarás y elige su orden al crear la publicación en Instagram.</p>
        <div className="instagram-image-grid">{product.images.map((image, index) => <div className="instagram-image-choice" key={image.id}>
          <SafeImage src={image.url} alt={image.alt_text || product.name} loading="lazy" />
          <button type="button" className="admin-button admin-button--secondary" onClick={() => download(image, index)}>Descargar foto {index + 1}</button>
        </div>)}</div>
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

export default function InstagramManualWorkflow() {
  const [revision, setRevision] = useState(0)
  const loader = useCallback(async () => ({ ...await loadManualInstagramWorkspace(), revision }), [revision])
  const { data, loading, error } = useAsyncData(loader)
  return <div className="admin-page">
    <header className="admin-page__header"><div><h1>Instagram · publicación manual</h1><p>Prepara el contenido aquí, publícalo desde Instagram y registra el enlace al terminar.</p></div></header>
    {loading ? <LoadingState label="Cargando productos y publicaciones…" /> : error ? <div><p role="alert">{error.message}</p><button type="button" className="admin-button" onClick={() => setRevision(value => value + 1)}>Reintentar</button></div> : data && <ManualWorkspace {...data} />}
  </div>
}
