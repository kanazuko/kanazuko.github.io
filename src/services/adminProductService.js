import { supabase } from '../lib/supabase'

const adminProductFields = `
  id,
  category_id,
  subcategory_id,
  sku,
  name,
  slug,
  description,
  price,
  compare_at_price,
  material,
  color,
  size,
  attributes,
  availability,
  is_published,
  is_featured,
  sort_order,
  created_at,
  updated_at,
  category:categories!products_category_id_fkey(id, name, slug),
  subcategory:categories!products_subcategory_id_fkey(id, name, slug, parent_id),
  tags:product_tags(tag:tags(id, name, slug))
`

export async function getAdminProducts() {
  const { data, error } = await supabase
    .from('products')
    .select(adminProductFields)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export async function getAdminProductById(id) {
  const { data, error } = await supabase
    .from('products')
    .select(adminProductFields)
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export async function getAdminCategories() {
  const { data, error } = await supabase
    .from('categories')
    .select('id, parent_id, name, slug, is_active, sort_order')
    .order('sort_order', { ascending: true })

  if (error) throw error
  return data
}

export async function getAdminProductDefaults() {
  const { data, error } = await supabase
    .from('product_form_defaults')
    .select('category_id, subcategory_id, material, color, is_published')
    .eq('id', true)
    .maybeSingle()
  if (error) throw error
  return data ?? { category_id: null, subcategory_id: null, material: '', color: '', is_published: true }
}

export async function updateAdminProductDefaults(defaults) {
  const { data, error } = await supabase
    .from('product_form_defaults')
    .upsert({ id: true, ...defaults })
    .select('category_id, subcategory_id, material, color, is_published')
    .single()
  if (error) throw error
  return data
}

export async function createAdminSubcategory(subcategory) {
  const { data, error } = await supabase
    .from('categories')
    .insert(subcategory)
    .select('id, parent_id, name, slug, is_active, sort_order')
    .single()
  if (error) throw error
  return data
}

export async function updateAdminSubcategory(id, changes) {
  const { data, error } = await supabase
    .from('categories')
    .update(changes)
    .eq('id', id)
    .select('id, parent_id, name, slug, is_active, sort_order')
    .single()
  if (error) throw error
  return data
}

export async function deleteAdminSubcategory(id) {
  const { count, error: countError } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('subcategory_id', id)
  if (countError) throw countError
  if (count) throw new Error('No puedes eliminar esta subcategoría porque tiene productos asignados.')

  const { error } = await supabase.from('categories').delete().eq('id', id)
  if (error) throw error
}

export async function createAdminProduct(product) {
  const { tags, ...productData } = product
  const { data, error } = await supabase
    .from('products')
    .insert(productData)
    .select(adminProductFields)
    .single()

  if (error) throw error
  await syncProductTags(data.id, tags)
  return data
}

export async function updateAdminProduct(id, changes) {
  const { tags, ...productChanges } = changes
  const { data, error } = await supabase
    .from('products')
    .update(productChanges)
    .eq('id', id)
    .select(adminProductFields)
    .single()

  if (error) throw error
  if (tags !== undefined) await syncProductTags(id, tags)
  return data
}

async function syncProductTags(productId, tagNames = []) {
  const uniqueNames = [...new Map((tagNames ?? []).map((name) => [name.toLocaleLowerCase('es-MX'), name])).values()]
  const tags = []
  for (const name of uniqueNames) {
    const slug = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    if (!slug) continue
    let { data: tag, error } = await supabase.from('tags').select('id').eq('slug', slug).maybeSingle()
    if (error) throw error
    if (!tag) {
      const result = await supabase.from('tags').insert({ name, slug }).select('id').single()
      if (result.error) throw result.error
      tag = result.data
    }
    tags.push(tag)
  }
  const { error: deleteError } = await supabase.from('product_tags').delete().eq('product_id', productId)
  if (deleteError) throw deleteError
  if (!tags.length) return
  const { error } = await supabase.from('product_tags').insert(tags.map((tag) => ({ product_id: productId, tag_id: tag.id })))
  if (error) throw error
}

export async function updateAdminProductsSubcategory(productIds, subcategory) {
  const { error } = await supabase
    .from('products')
    .update({ category_id: subcategory.parent_id, subcategory_id: subcategory.id })
    .in('id', productIds)
  if (error) throw error
}

export async function deleteAdminProduct(id) {
  const { data: images, error: imageError } = await supabase
    .from('product_images')
    .select('storage_path')
    .eq('product_id', id)

  if (imageError) throw imageError

  const expectedPrefix = `products/${id}/`
  const paths = images.map((image) => image.storage_path)
  if (paths.some((path) => !path.startsWith(expectedPrefix))) {
    throw new Error('Se canceló el borrado porque no se pudo verificar la pertenencia de todas las fotografías.')
  }

  const { error } = await supabase.from('products').delete().eq('id', id)
  if (error) throw error
  if (!paths.length) return

  let { error: cleanupError } = await supabase.storage.from('product-images').remove(paths)
  if (cleanupError) {
    const retry = await supabase.storage.from('product-images').remove(paths)
    cleanupError = retry.error
  }

  if (cleanupError) {
    const partialError = new Error('El producto fue eliminado, pero algunos archivos no pudieron limpiarse de Storage. Las rutas afectadas se registraron en la consola.')
    partialError.productDeleted = true
    partialError.orphanedPaths = paths
    throw partialError
  }
}

export function getProductMutationError(error) {
  if (error?.code === '23505') {
    if (error.message?.includes('slug')) return 'Ya existe un producto con ese slug.'
    if (error.message?.includes('sku')) return 'Ya existe un producto con ese SKU.'
    return 'Ya existe un producto con uno de esos valores únicos.'
  }
  if (error?.code === '23514') return 'Uno de los valores no cumple las reglas del catálogo.'
  if (error?.code === '42501') return 'Tu cuenta no tiene permiso para realizar esta operación.'
  return error?.message || 'No fue posible guardar los cambios.'
}
