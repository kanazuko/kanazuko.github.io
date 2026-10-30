import { useEffect, useRef, useState } from 'react'
import SafeImage from './SafeImage'

export default function ProductGallery({ images, productName }) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [viewerOpen, setViewerOpen] = useState(false)
  const dialogRef = useRef(null)
  const selectedImage = images[selectedIndex]

  useEffect(() => {
    if (!viewerOpen) return
    const dialog = dialogRef.current
    if (!dialog) return
    const previousOverflow = document.body.style.overflow
    dialog.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      dialog.close()
      document.body.style.overflow = previousOverflow
    }
  }, [viewerOpen])

  function openImage(index) {
    setSelectedIndex(index)
    setViewerOpen(true)
  }

  function navigateImage(direction) {
    setSelectedIndex((current) => (current + direction + images.length) % images.length)
  }

  if (!selectedImage) {
    return <div className="product-gallery__placeholder">Fotografías próximamente</div>
  }

  return (
    <div className="product-gallery">
      <button className="product-gallery__main" type="button" onClick={() => openImage(selectedIndex)} aria-label={`Ampliar fotografía de ${productName}`} aria-haspopup="dialog">
        <SafeImage
          key={selectedImage.id}
          src={selectedImage.url}
          alt={selectedImage.alt_text || productName}
          fetchPriority="high"
        />
        <span className="product-gallery__zoom-hint">Toca para ampliar</span>
      </button>
      {images.length > 1 && (
        <div className="product-gallery__thumbs" aria-label="Fotografías del producto">
          {images.map((image, index) => (
            <button
              key={image.id}
              className={index === selectedIndex ? 'product-gallery__thumb is-active' : 'product-gallery__thumb'}
              type="button"
              onClick={() => openImage(index)}
              aria-label={`Ampliar fotografía ${index + 1} de ${productName}`}
              aria-haspopup="dialog"
              aria-pressed={index === selectedIndex}
            >
              <SafeImage key={image.id} src={image.url} alt="" loading="lazy" fallback="×" />
            </button>
          ))}
        </div>
      )}
      <dialog
        ref={dialogRef}
        className="product-image-viewer"
        aria-label={`Fotografías de ${productName}`}
        onCancel={(event) => { event.preventDefault(); setViewerOpen(false) }}
        onClick={(event) => { if (event.target === event.currentTarget) setViewerOpen(false) }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault()
            navigateImage(event.key === 'ArrowLeft' ? -1 : 1)
          }
        }}
      >
        {viewerOpen && (
          <>
            <button className="product-image-viewer__close" type="button" onClick={() => setViewerOpen(false)} autoFocus aria-label="Cerrar imagen ampliada">Cerrar ×</button>
            <div className="product-image-viewer__image">
              <SafeImage key={selectedImage.id} src={selectedImage.url} alt={selectedImage.alt_text || productName} />
            </div>
            <div className="product-image-viewer__controls">
              {images.length > 1 && <button type="button" onClick={() => navigateImage(-1)} aria-label="Fotografía anterior">←</button>}
              <span aria-live="polite">{selectedIndex + 1} / {images.length}</span>
              {images.length > 1 && <button type="button" onClick={() => navigateImage(1)} aria-label="Fotografía siguiente">→</button>}
            </div>
          </>
        )}
      </dialog>
    </div>
  )
}
