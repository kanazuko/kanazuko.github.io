export const DEFAULT_INSTAGRAM_TEMPLATE = '✨ {nombre}\n{precio}\n{descripcion}\n\nHaz tu pedido desde el enlace de nuestro perfil.\nO con un mensaje al privado.\n#PRArtJewelry #Joyería'
export const MAX_INSTAGRAM_IMAGES = 10 // Deliberately below Meta's current 20-image ceiling.
export function generateInstagramCaption(products, template) {
  return products.map((product) => template.replace(/\{(nombre|precio|descripcion)\}/g, (_, key) => ({
    nombre: product.name,
    precio: new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(product.price)) + ' MXN',
    descripcion: product.description || '',
  })[key])).join('\n\n──────────\n\n')
}
export function validateInstagramDraft({ mode, product_ids, image_ids, caption }, images) {
  if (!product_ids.length || product_ids.length > 10) return 'Selecciona entre 1 y 10 productos.'
  if (mode === 'single' && image_ids.length !== 1) return 'Una publicación individual necesita exactamente una fotografía.'
  if (mode === 'carousel' && (image_ids.length < 2 || image_ids.length > MAX_INSTAGRAM_IMAGES)) return 'El carrusel de esta versión admite entre 2 y 10 fotografías.'
  if (new Set(image_ids).size !== image_ids.length) return 'No repitas fotografías.'
  if (product_ids.some((id) => !images.some((image) => image.product_id === id && image_ids.includes(image.id)))) return 'Elige al menos una fotografía de cada producto seleccionado.'
  if ([...caption].length > 2200) return 'La descripción supera los 2200 caracteres.'
  if ((caption.match(/#[\p{L}\p{N}_]+/gu) || []).length > 30) return 'Usa como máximo 30 hashtags.'
  if ((caption.match(/@[a-zA-Z0-9_.]+/g) || []).length > 20) return 'Usa como máximo 20 menciones.'
  return ''
}

export function catalogImageUrl(supabase, image) {
  const path = image.storage_path
  if (typeof path !== 'string' || !path.startsWith(`products/${image.product_id}/`) || /[\\?#%]/.test(path) || path.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error('La ruta de la fotografía no es válida.')
  return validatePublicMediaUrl(supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl, 'product-images')
}

export function validatePublicMediaUrl(value, bucket) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !url.pathname.startsWith(`/storage/v1/object/public/${bucket}/`)) {
    throw new Error('Las imágenes deben usar URLs públicas HTTPS de Storage, sin tokens ni firmas.')
  }
  return url.href
}

export function selectPreviewImages(draft, catalogImages, dirty) {
  return draft.image_ids.map((id) => {
    const saved = draft.images?.find((image) => image.id === id)
    const current = catalogImages.find((image) => image.id === id)
    return dirty ? current || saved : saved || current
  }).filter(Boolean)
}

export async function createInstagramJpeg(url, { nativeSize = false } = {}) {
  validatePublicMediaUrl(url, 'product-images')
  const response = await fetch(url, { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(20000) })
  if (!response.ok) throw new Error('No se pudo descargar la fotografía original.')
  const blob = await response.blob()
  if (blob.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(blob.type)) throw new Error('La fotografía original no tiene un formato o tamaño válido.')
  let bitmap
  try { bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' }) } catch { throw new Error('El navegador no pudo abrir esta fotografía. Prueba con Chrome o Edge actualizado.') }
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 40000000) throw new Error('La fotografía original tiene dimensiones demasiado grandes.')
    const canvas = document.createElement('canvas')
    canvas.width = nativeSize ? bitmap.width : 1080
    canvas.height = nativeSize ? bitmap.height : 1080
    const ctx = canvas.getContext('2d', { colorSpace: 'srgb' })
    if (!ctx) throw new Error('No se pudo preparar la fotografía.')
    if (!nativeSize) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, 1080, 1080)
      const scale = Math.min(1080 / bitmap.width, 1080 / bitmap.height)
      const width = Math.round(bitmap.width * scale)
      const height = Math.round(bitmap.height * scale)
      ctx.drawImage(bitmap, (1080 - width) / 2, (1080 - height) / 2, width, height)
    } else {
      ctx.drawImage(bitmap, 0, 0)
    }
    const jpeg = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
    if (!jpeg || jpeg.type !== 'image/jpeg' || jpeg.size > 8 * 1024 * 1024) throw new Error('No se pudo generar un JPEG compatible.')
    return jpeg
  } finally { bitmap.close() }
}
