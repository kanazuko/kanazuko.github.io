import { useEffect, useState } from 'react'
import { createInstagramJpeg } from '../../utils/instagram'

export default function InstagramManualPhoto({ image, index, productName }) {
  const [photo, setPhoto] = useState(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    let objectUrl
    createInstagramJpeg(image.url, { nativeSize: true }).then(blob => {
      if (!active) return
      objectUrl = URL.createObjectURL(blob)
      setPhoto({ url: objectUrl, blob })
    }).catch(failure => { if (active) setError(failure.message) })
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [image.url, retry])
  const filename = `producto-${image.product_id}-${index + 1}.jpg`
  return <div className="instagram-image-choice">
    {error ? <><p role="alert">{error}</p><button type="button" className="admin-button admin-button--secondary" onClick={() => { setError(''); setRetry(value => value + 1) }}>Reintentar foto</button></> : !photo ? <p role="status">Preparando foto {index + 1} en JPEG…</p> : <>
      <a href={photo.url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir foto ${index + 1} en JPEG`} draggable={false}>
        <img src={photo.url} alt={image.alt_text || productName} draggable onDragStart={event => {
          event.dataTransfer.items.add(new File([photo.blob], filename, { type: 'image/jpeg' }))
          event.dataTransfer.setData('DownloadURL', `image/jpeg:${filename}:${photo.url}`)
          event.dataTransfer.effectAllowed = 'copy'
        }} />
      </a>
      <a className="admin-button admin-button--secondary" href={photo.url} download={filename}>Descargar foto {index + 1} en JPG</a>
    </>}
  </div>
}
