import { useState } from 'react'

export default function SafeImage({ src, alt, fallback = 'Imagen no disponible', ...props }) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return <span className="image-fallback" role="img" aria-label={alt || 'Imagen no disponible'}>{fallback}</span>
  }

  return <img src={src} alt={alt} onError={() => setFailed(true)} {...props} />
}
