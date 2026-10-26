import { supabase } from '../lib/supabase'
import { extensionForImage } from '../utils/imageProcessing'

const bucket = supabase.storage.from('product-images')

function belongsToProduct(storagePath, productId) {
  return storagePath.startsWith(`products/${productId}/`)
}

function withPublicUrl(image) {
  return {
    ...image,
    url: bucket.getPublicUrl(image.storage_path).data.publicUrl,
  }
}

export async function getAdminProductImages(productId) {
  const { data, error } = await supabase
    .from('product_images')
    .select('id, product_id, storage_path, alt_text, sort_order, created_at')
    .eq('product_id', productId)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return data.map(withPublicUrl)
}

export async function uploadProductImage({ productId, file, altText, sortOrder, onUploaded }) {
  const extension = extensionForImage(file)
  if (!extension) throw new Error('No se pudo determinar la extensión de la imagen.')

  const storagePath = `products/${productId}/${crypto.randomUUID()}.${extension}`
  const { error: uploadError } = await bucket.upload(storagePath, file, {
    cacheControl: '31536000',
    contentType: file.type,
    upsert: false,
  })
  if (uploadError) throw uploadError
  onUploaded?.()

  const { data, error: insertError } = await supabase
    .from('product_images')
    .insert({
      product_id: productId,
      storage_path: storagePath,
      alt_text: altText || null,
      sort_order: sortOrder,
    })
    .select('id, product_id, storage_path, alt_text, sort_order, created_at')
    .single()

  if (insertError) {
    const { error: cleanupError } = await bucket.remove([storagePath])
    if (cleanupError) {
      insertError.message = `${insertError.message} El archivo se subió, pero tampoco pudo limpiarse de Storage.`
    }
    throw insertError
  }

  return withPublicUrl(data)
}

export async function updateProductImageAlt(imageId, altText) {
  const { data, error } = await supabase
    .from('product_images')
    .update({ alt_text: altText.trim() || null })
    .eq('id', imageId)
    .select('id, product_id, storage_path, alt_text, sort_order, created_at')
    .single()

  if (error) throw error
  return withPublicUrl(data)
}

export async function reorderProductImages(productId, images) {
  if (images.some((image) => image.product_id !== productId || !belongsToProduct(image.storage_path, productId))) {
    throw new Error('No se pudo verificar la pertenencia de todas las fotografías.')
  }

  const rows = images.map((image, index) => ({
    id: image.id,
    product_id: productId,
    storage_path: image.storage_path,
    alt_text: image.alt_text,
    sort_order: index,
  }))

  const { data, error } = await supabase
    .from('product_images')
    .upsert(rows, { onConflict: 'id' })
    .select('id, product_id, storage_path, alt_text, sort_order, created_at')

  if (error) throw error
  return data.sort((a, b) => a.sort_order - b.sort_order).map(withPublicUrl)
}

export async function deleteProductImage(image) {
  if (!belongsToProduct(image.storage_path, image.product_id)) {
    throw new Error('La ruta de esta fotografía no pertenece al producto.')
  }

  const { error: deleteRecordError } = await supabase
    .from('product_images')
    .delete()
    .eq('id', image.id)
    .eq('product_id', image.product_id)
    .eq('storage_path', image.storage_path)

  if (deleteRecordError) throw deleteRecordError

  const { error: storageError } = await bucket.remove([image.storage_path])
  if (!storageError) return

  const { error: recoveryError } = await supabase.from('product_images').insert({
    id: image.id,
    product_id: image.product_id,
    storage_path: image.storage_path,
    alt_text: image.alt_text,
    sort_order: image.sort_order,
    created_at: image.created_at,
  })

  const error = new Error(
    recoveryError
      ? 'No se eliminó el archivo y tampoco se pudo restaurar su registro. Revisa Storage y product_images.'
      : 'No se pudo eliminar el archivo de Storage. El registro fue restaurado.',
  )
  error.recovered = !recoveryError
  throw error
}
