const MAX_FILE_SIZE = 5 * 1024 * 1024
const MAX_DIMENSION = 1600
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])

export function validateImageFile(file) {
  if (!ALLOWED_TYPES.has(file.type)) return 'Formato no permitido. Usa JPEG, PNG, WebP o AVIF.'
  if (file.size > MAX_FILE_SIZE) return 'El archivo original supera el límite de 5 MB.'
  return null
}

export function fileFingerprint(file) {
  return `${file.name}:${file.size}:${file.lastModified}`
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

export async function optimizeImage(file) {
  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return file
  }

  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    if (scale === 1 && file.type === 'image/webp') return file

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return file

    context.drawImage(bitmap, 0, 0, width, height)
    const webpBlob = await canvasToBlob(canvas, 'image/webp', 0.86)
    if (!webpBlob || webpBlob.type !== 'image/webp') return file

    const optimized = new File(
      [webpBlob],
      `${file.name.replace(/\.[^.]+$/, '')}.webp`,
      { type: 'image/webp', lastModified: file.lastModified },
    )

    return optimized.size < file.size || scale < 1 ? optimized : file
  } finally {
    bitmap.close()
  }
}

export function validateProcessedImage(file) {
  if (!ALLOWED_TYPES.has(file.type)) return 'El navegador no pudo generar un formato permitido.'
  if (file.size > MAX_FILE_SIZE) return 'La imagen optimizada todavía supera los 5 MB.'
  return null
}

export function extensionForImage(file) {
  const extensions = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/avif': 'avif',
  }
  return extensions[file.type]
}

export function formatFileSize(bytes) {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
