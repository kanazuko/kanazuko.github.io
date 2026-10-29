import { supabase } from '../lib/supabase'

const productFields = `
  id,
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
  is_featured,
  category:categories!products_category_id_fkey(id, name, slug),
  subcategory:categories!products_subcategory_id_fkey(id, name, slug),
  tags:product_tags(tag:tags(id, name, slug)),
  images:product_images(id, storage_path, alt_text, sort_order)
`

function withImageUrls(product) {
  const images = [...(product.images ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((image) => ({
      ...image,
      url: supabase.storage.from('product-images').getPublicUrl(image.storage_path).data.publicUrl,
    }))

  return { ...product, images, primaryImage: images[0] ?? null, tags: (product.tags ?? []).map(({ tag }) => tag).filter(Boolean) }
}

export async function getCategories() {
  const { data, error } = await supabase
    .from('categories')
    .select('id, parent_id, name, slug, description, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return data
}

export async function getProducts({ featured = false } = {}) {
  let query = supabase
    .from('products')
    .select(productFields)
    .eq('is_published', true)
    .order('sort_order', { ascending: true })

  if (featured) query = query.eq('is_featured', true)

  const { data, error } = await query
  if (error) throw error
  return data.map(withImageUrls)
}

export async function getProductsByCategory(slug) {
  const { data: category, error: categoryError } = await supabase
    .from('categories')
    .select('id, parent_id')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()

  if (categoryError) throw categoryError
  if (!category) return []

  const { data, error } = await supabase
    .from('products')
    .select(productFields)
    .eq('is_published', true)
    .eq(category.parent_id ? 'subcategory_id' : 'category_id', category.id)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return data.map(withImageUrls)
}

export async function getProductBySlug(slug) {
  const { data, error } = await supabase
    .from('products')
    .select(productFields)
    .eq('is_published', true)
    .eq('slug', slug)
    .single()

  if (error) throw error
  return withImageUrls(data)
}

export async function getRelatedProducts(categoryId, productId, limit = 4) {
  if (!categoryId) return []

  const { data, error } = await supabase
    .from('products')
    .select(productFields)
    .eq('is_published', true)
    .eq('category_id', categoryId)
    .neq('id', productId)
    .order('sort_order', { ascending: true })
    .limit(limit)

  if (error) throw error
  return data.map(withImageUrls)
}
