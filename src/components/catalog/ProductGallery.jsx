import { useState } from 'react'
import SafeImage from './SafeImage'

export default function ProductGallery({ images, productName }) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const selectedImage = images[selectedIndex]

  if (!selectedImage) {
    return <div className="product-gallery__placeholder">Fotografías próximamente</div>
  }

  return (
    <div className="product-gallery">
      <div className="product-gallery__main">
        <SafeImage
          key={selectedImage.id}
          src={selectedImage.url}
          alt={selectedImage.alt_text || productName}
          fetchPriority="high"
        />
      </div>
      {images.length > 1 && (
        <div className="product-gallery__thumbs" aria-label="Fotografías del producto">
          {images.map((image, index) => (
            <button
              key={image.id}
              className={index === selectedIndex ? 'product-gallery__thumb is-active' : 'product-gallery__thumb'}
              type="button"
              onClick={() => setSelectedIndex(index)}
              aria-label={`Mostrar fotografía ${index + 1} de ${productName}`}
              aria-pressed={index === selectedIndex}
            >
              <SafeImage key={image.id} src={image.url} alt="" loading="lazy" fallback="×" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
