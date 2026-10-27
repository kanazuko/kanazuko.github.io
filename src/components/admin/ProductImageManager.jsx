import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import ConfirmDialog from '../feedback/ConfirmDialog'
import ErrorState from '../feedback/ErrorState'
import LoadingState from '../feedback/LoadingState'
import Notification from '../feedback/Notification'
import {
  deleteProductImage,
  getAdminProductImages,
  reorderProductImages,
  updateProductImageAlt,
  uploadProductImage,
} from '../../services/adminImageService'
import {
  fileFingerprint,
  formatFileSize,
  optimizeImage,
  validateImageFile,
  validateProcessedImage,
} from '../../utils/imageProcessing'

function AdminImageCard({ image, index, total, busy, onMove, onDelete, onAltSaved, onDragStart, onDrop }) {
  const [altText, setAltText] = useState(image.alt_text ?? '')
  const [savingAlt, setSavingAlt] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)

  async function saveAlt() {
    setSavingAlt(true)
    await onAltSaved(image, altText)
    setSavingAlt(false)
  }

  return (
    <article
      className="admin-image-card"
      draggable={!busy}
      onDragStart={() => onDragStart(index)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={() => onDrop(index)}
    >
      <div className="admin-image-card__visual">
        {imageFailed ? <span>No se pudo cargar</span> : <img src={image.url} alt={image.alt_text || ''} loading="lazy" onError={() => setImageFailed(true)} />}
        {index === 0 && <span className="primary-label">Principal</span>}
        <span className="drag-label" aria-hidden="true">Arrastrar</span>
      </div>
      <div className="admin-image-card__body">
        <label htmlFor={`alt-${image.id}`}>Texto alternativo</label>
        <div className="admin-image-alt-row">
          <input id={`alt-${image.id}`} value={altText} onChange={(event) => setAltText(event.target.value)} placeholder="Describe la fotografía" />
          <button type="button" onClick={saveAlt} disabled={busy || savingAlt || altText === (image.alt_text ?? '')}>{savingAlt ? '…' : 'Guardar'}</button>
        </div>
        <div className="admin-image-card__actions">
          <button type="button" onClick={() => onMove(index, index - 1)} disabled={busy || index === 0} aria-label="Mover fotografía antes">←</button>
          <button type="button" onClick={() => onMove(index, index + 1)} disabled={busy || index === total - 1} aria-label="Mover fotografía después">→</button>
          <button className="danger-link" type="button" onClick={() => onDelete(image)} disabled={busy}>Eliminar</button>
        </div>
      </div>
    </article>
  )
}

export default function ProductImageManager({ productId, productName }) {
  const [images, setImages] = useState([])
  const [queue, setQueue] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const [dragIndex, setDragIndex] = useState(null)
  const [busy, setBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [notification, setNotification] = useState(null)
  const previewUrls = useRef(new Set())
  const knownFingerprints = useRef(new Set())
  const inputRef = useRef(null)

  useEffect(() => {
    let active = true
    getAdminProductImages(productId)
      .then((data) => {
        if (active) setImages(data)
      })
      .catch((error) => {
        console.error(error)
        if (active) setLoadError('No fue posible cargar las fotografías.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    const urls = previewUrls.current
    return () => {
      active = false
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [productId])

  function addFiles(fileList) {
    const additions = []
    Array.from(fileList).forEach((file) => {
      const fingerprint = fileFingerprint(file)
      if (knownFingerprints.current.has(fingerprint)) return
      knownFingerprints.current.add(fingerprint)
      const previewUrl = URL.createObjectURL(file)
      previewUrls.current.add(previewUrl)
      const validationError = validateImageFile(file)
      additions.push({
        id: crypto.randomUUID(),
        file,
        fingerprint,
        previewUrl,
        altText: productName,
        status: validationError ? 'error' : 'ready',
        error: validationError,
        retryable: false,
        finalSize: null,
      })
    })
    if (additions.length) setQueue((current) => [...current, ...additions])
  }

  function updateQueue(id, changes) {
    setQueue((current) => current.map((item) => item.id === id ? { ...item, ...changes } : item))
  }

  function removeQueueItem(item) {
    URL.revokeObjectURL(item.previewUrl)
    previewUrls.current.delete(item.previewUrl)
    if (item.status !== 'done') knownFingerprints.current.delete(item.fingerprint)
    setQueue((current) => current.filter((queued) => queued.id !== item.id))
  }

  async function uploadAll() {
    const candidates = queue.filter((item) => item.status === 'ready' || item.status === 'error' && item.retryable)
    if (!candidates.length) return
    setBusy(true)
    setNotification(null)
    let nextOrder = images.length
    let uploadedCount = 0

    for (const item of candidates) {
      try {
        updateQueue(item.id, { status: 'optimizing', error: null, retryable: false })
        const optimized = await optimizeImage(item.file)
        const finalError = validateProcessedImage(optimized)
        if (finalError) throw new Error(finalError)
        updateQueue(item.id, { status: 'uploading', finalSize: optimized.size })
        const uploaded = await uploadProductImage({
          productId,
          file: optimized,
          altText: item.altText.trim() || productName,
          sortOrder: nextOrder,
          onUploaded: () => updateQueue(item.id, { status: 'registering' }),
        })
        setImages((current) => [...current, uploaded])
        updateQueue(item.id, { status: 'done' })
        nextOrder += 1
        uploadedCount += 1
      } catch (error) {
        console.error(error)
        updateQueue(item.id, { status: 'error', error: error.message || 'No se pudo subir esta fotografía.', retryable: true })
      }
    }

    setBusy(false)
    if (uploadedCount) setNotification({ type: 'success', message: `${uploadedCount} ${uploadedCount === 1 ? 'fotografía subida' : 'fotografías subidas'} correctamente.` })
  }

  async function persistOrder(nextImages) {
    setBusy(true)
    setNotification(null)
    try {
      const ordered = await reorderProductImages(productId, nextImages)
      setImages(ordered)
      setNotification({ type: 'success', message: 'Orden de fotografías actualizado.' })
    } catch (error) {
      console.error(error)
      setNotification({ type: 'error', message: error.message || 'No se pudo guardar el nuevo orden.' })
    } finally {
      setBusy(false)
    }
  }

  function moveImage(from, to) {
    if (to < 0 || to >= images.length || from === to) return
    const next = [...images]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    persistOrder(next)
  }

  async function handleAltSaved(image, altText) {
    try {
      const updated = await updateProductImageAlt(image.id, altText)
      setImages((current) => current.map((item) => item.id === updated.id ? updated : item))
      setNotification({ type: 'success', message: 'Texto alternativo actualizado.' })
    } catch (error) {
      console.error(error)
      setNotification({ type: 'error', message: error.message || 'No se pudo actualizar el texto alternativo.' })
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setBusy(true)
    try {
      await deleteProductImage(deleteTarget)
      const remaining = images.filter((image) => image.id !== deleteTarget.id)
      setImages(remaining)
      setDeleteTarget(null)
      setNotification({ type: 'success', message: 'Fotografía eliminada.' })
      if (remaining.length) await persistOrder(remaining)
    } catch (error) {
      console.error(error)
      setNotification({ type: 'error', message: error.message || 'No se pudo eliminar la fotografía.' })
    } finally {
      setBusy(false)
    }
  }

  const statusLabels = {
    ready: 'Lista para subir', optimizing: 'Optimizando…', uploading: 'Subiendo…', registering: 'Registrando…', done: 'Completada', error: 'Error',
  }

  return (
    <section className="admin-form-section image-manager">
      <div className="admin-form-section__heading"><h2>Fotografías</h2><p>La primera imagen será la portada. Máximo 5 MB por archivo.</p></div>
      <div>
        <Notification type={notification?.type} message={notification?.message} onDismiss={() => setNotification(null)} />
        {loading && <LoadingState label="Cargando fotografías…" />}
        {loadError && <ErrorState message={loadError} />}
        {!loading && !loadError && (
          <>
            <div
              className={dragActive ? 'image-dropzone is-active' : 'image-dropzone'}
              onDragEnter={(event) => { event.preventDefault(); setDragActive(true) }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragActive(false) }}
              onDrop={(event) => { event.preventDefault(); setDragActive(false); addFiles(event.dataTransfer.files) }}
            >
              <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple onChange={(event) => { addFiles(event.target.files); event.target.value = '' }} />
              <p><strong>Arrastra fotografías aquí</strong><span>o selecciónalas desde tu dispositivo</span></p>
              <button className="admin-button admin-button--secondary" type="button" onClick={() => inputRef.current?.click()}>Seleccionar fotografías</button>
              <small>JPEG, PNG, WebP o AVIF · hasta 5 MB · máximo 1600 px después de optimizar</small>
            </div>

            {queue.length > 0 && (
              <div className="upload-queue">
                <div className="upload-queue__heading"><h3>Archivos seleccionados</h3><button className="admin-button" type="button" onClick={uploadAll} disabled={busy || !queue.some((item) => item.status === 'ready' || item.status === 'error' && item.retryable)}>Subir fotografías</button></div>
                {queue.map((item) => (
                  <article className={`upload-item upload-item--${item.status}`} key={item.id}>
                    <img src={item.previewUrl} alt="Vista previa local" />
                    <div className="upload-item__details"><strong>{item.file.name}</strong><span>{formatFileSize(item.finalSize ?? item.file.size)} · {statusLabels[item.status]}</span>{item.error && <small role="alert">{item.error}</small>}<input value={item.altText} onChange={(event) => updateQueue(item.id, { altText: event.target.value })} aria-label={`Texto alternativo para ${item.file.name}`} placeholder="Texto alternativo" disabled={busy || item.status === 'done'} /></div>
                    <button type="button" onClick={() => removeQueueItem(item)} disabled={busy && item.status !== 'error'} aria-label={`Quitar ${item.file.name}`}>×</button>
                  </article>
                ))}
              </div>
            )}

            <div className="stored-images-heading"><h3>Fotografías guardadas</h3><span>{images.length}</span></div>
            {images.length === 0 ? <p className="image-manager-empty">Este producto todavía no tiene fotografías.</p> : (
              <div className="admin-image-grid">
                {images.map((image, index) => (
                  <AdminImageCard key={image.id} image={image} index={index} total={images.length} busy={busy} onMove={moveImage} onDelete={setDeleteTarget} onAltSaved={handleAltSaved} onDragStart={setDragIndex} onDrop={(targetIndex) => { if (dragIndex !== null) moveImage(dragIndex, targetIndex); setDragIndex(null) }} />
                ))}
              </div>
            )}
            <div className="image-manager__new-product">
              <Link className="admin-button admin-button--secondary" to="/admin/productos/nuevo">Crear producto nuevo</Link>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog open={Boolean(deleteTarget)} title="Eliminar fotografía" message="La fotografía se eliminará del producto y de Storage. Esta acción no se puede deshacer." confirmLabel="Eliminar fotografía" busy={busy} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
    </section>
  )
}
