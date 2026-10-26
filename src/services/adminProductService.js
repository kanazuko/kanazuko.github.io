import { supabase } from '../lib/supabase'

const adminProductFields = `
  id,
  category_id,
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
  category:categories(id, name, slug)
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
    .select('id, name, slug, is_active, sort_order')
    .order('sort_order', { ascending: true })

  if (error) throw error
  return data
}

export async function createAdminProduct(product) {
  const { data, error } = await supabase
    .from('products')
    .insert(product)
    .select(adminProductFields)
    .single()

  if (error) throw error
  return data
}

export async function updateAdminProduct(id, changes) {
  const { data, error } = await supabase
    .from('products')
    .update(changes)
    .eq('id', id)
    .select(adminProductFields)
    .single()

  if (error) throw error
  return data
}

export async function deleteAdminProduct(id) {
  const { error } = await supabase.from('products').delete().eq('id', id)
  if (error) throw error
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
