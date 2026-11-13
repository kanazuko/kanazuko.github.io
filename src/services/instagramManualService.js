import { supabase } from '../lib/supabase'
import { catalogImageUrl } from '../utils/instagram'
import { normalizeInstagramPostUrl } from '../utils/instagramManual'
import { loadInstagramPublishedProductIds } from './instagramService'

export async function loadManualInstagramWorkspace() {
  const [catalog, history, publishedProductIds] = await Promise.all([
    supabase.from('products').select('id,name,price,description,is_featured,category:categories!products_category_id_fkey(id,name),images:product_images(id,product_id,storage_path,alt_text,sort_order)').order('name'),
    supabase.from('instagram_manual_posts').select('*').order('updated_at', { ascending: false }),
    loadInstagramPublishedProductIds({ includeManual: false }),
  ])
  if (catalog.error) throw new Error('No se pudo cargar el catálogo.')
  if (history.error) throw new Error('No se pudo cargar el registro manual. Comprueba que se haya aplicado la migración 20261114120000_instagram_manual_posts.sql y que tengas acceso de administrador.')
  return {
    products: catalog.data.map(product => ({ ...product, images: (product.images || []).sort((a, b) => a.sort_order - b.sort_order).map(image => ({ ...image, url: catalogImageUrl(supabase, image) })) })),
    records: history.data,
    publishedProductIds,
  }
}

export async function saveManualInstagramPost(product, record, caption, url, completed) {
  if ([...caption].length > 2200) throw new Error('La descripción supera los 2200 caracteres.')
  const instagram_url = url.trim() ? normalizeInstagramPostUrl(url) : ''
  if (completed && !instagram_url) throw new Error('Añade el enlace de Instagram antes de marcar el producto como completado.')
  const values = { product_id: product.id, product_name: product.name, caption, instagram_url, completed_at: record?.completed_at || (completed ? new Date().toISOString() : null) }
  const query = record
    ? supabase.from('instagram_manual_posts').update(values).eq('id', record.id).eq('updated_at', record.updated_at)
    : supabase.from('instagram_manual_posts').insert(values)
  const { data, error } = await query.select('*').maybeSingle()
  if (error?.code === '23505' || (!error && !data)) throw new Error('El registro cambió en otra sesión. Recarga la página antes de guardar.')
  if (error) throw new Error('No se pudo guardar el registro manual. Inténtalo de nuevo.')
  return data
}
