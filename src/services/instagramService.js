import { supabase } from '../lib/supabase'
import { catalogImageUrl } from '../utils/instagram'

const messages = {
  PUBLISHING_DISABLED: 'La publicación real está deshabilitada en esta etapa.',
  PUBLISH_LIMIT_UNVERIFIED: 'No se pudo comprobar la cuota de publicación de Meta. La preparación permanece bloqueada.',
  DRAFT_CONFLICT: 'El borrador cambió o está ocupado. Recarga el historial y vuelve a abrirlo.',
  OPERATION_IN_PROGRESS: 'Hay una operación en curso. Si quedó interrumpida, espera 10 minutos para recuperar y limpiar el borrador.',
  INVALID_CAPTION: 'Agrega una descripción de hasta 2200 caracteres, 30 hashtags y 20 menciones.',
  INVALID_JPEG: 'La imagen no es un JPEG válido de 1080 × 1080. Limpia la preparación y vuelve a intentarlo.',
  IMAGE_TOO_LARGE: 'La imagen supera el límite de 8 MB.',
  SOURCE_IMAGE_UNAVAILABLE: 'No se pudo verificar la fotografía original en Storage.',
  IMAGE_UPLOAD_FAILED: 'No se pudo guardar el JPEG. Limpia la preparación antes de reintentar.',
  PUBLIC_IMAGE_UNAVAILABLE: 'No se pudo verificar el acceso público o la integridad de un JPEG.',
  IMAGES_INCOMPLETE: 'Faltan fotografías por preparar.',
  CLEANUP_FAILED: 'No se completó la limpieza. Los archivos siguen registrados; vuelve a intentar limpiar.',
  OPERATION_FAILED: 'No se pudo completar la operación. Recarga el historial; no se ha publicado contenido.',
  DATABASE_UNAVAILABLE: 'No se pudo consultar el historial. Verifica que la nueva migración esté aplicada.',
  UNAUTHORIZED: 'Tu sesión no es válida. Inicia sesión nuevamente.',
  FORBIDDEN: 'Tu usuario no tiene autorización administrativa.',
  SERVER_CONFIGURATION: 'Falta configurar el entorno de la función en Supabase.',
  AUTH_UNAVAILABLE: 'No se pudo validar tu sesión. Intenta de nuevo más tarde.',
  AUTHORIZATION_UNAVAILABLE: 'No se pudieron verificar tus permisos administrativos.',
  INSTAGRAM_NOT_CONFIGURED: 'Falta configurar el secreto INSTAGRAM_ACCESS_TOKEN en Supabase.',
  INSTAGRAM_TOKEN_INVALID: 'Meta rechazó el token. Puede haber expirado o sido revocado; reemplázalo en Supabase.',
  INSTAGRAM_PERMISSION_DENIED: 'Meta rechazó el acceso. Para preparar, verifica instagram_basic, instagram_content_publish y la cuenta autorizada en Unified Login.',
  INSTAGRAM_RATE_LIMIT: 'Meta limitó temporalmente las consultas. Intenta de nuevo más tarde.',
  INSTAGRAM_REJECTED: 'Meta rechazó la consulta. Revisa el token, los permisos y la configuración de Unified Login.',
  INSTAGRAM_INVALID_RESPONSE: 'Meta no devolvió información válida de la cuenta.',
  INSTAGRAM_ACCOUNT_NOT_FOUND: 'Meta no devolvió @prartjewelry entre las cuentas autorizadas. Revisa los activos compartidos.',
  CONNECTION_UNAVAILABLE: 'No fue posible completar la consulta. Revisa la conexión e intenta nuevamente.',
}

export function instagramErrorMessage(code) { return messages[code] || 'No se pudo completar la operación. Revisa la configuración e inténtalo de nuevo.' }

export async function loadInstagramCatalog() {
  const { data, error } = await supabase.from('products').select('id,name,price,description,images:product_images(id,product_id,storage_path,alt_text,sort_order)').order('name')
  if (error) throw new Error('No se pudieron cargar los productos.')
  return data.map((product) => ({ ...product, images: product.images.sort((a, b) => a.sort_order - b.sort_order).map((image) => ({ ...image, url: catalogImageUrl(supabase, image) })) }))
}

export async function loadInstagramDrafts() {
  const { data, error } = await supabase.from('instagram_posts').select('*').order('created_at', { ascending: false }).limit(50)
  if (error) throw new Error('No se pudo cargar el historial. Aplica la migración de Instagram en Supabase.')
  return data
}

export async function saveInstagramDraft(draft) {
  const { data, error } = await supabase.rpc('save_instagram_draft', {
    p_id: draft.id, p_revision: draft.revision, p_mode: draft.mode,
    p_product_ids: draft.product_ids, p_image_ids: draft.image_ids,
    p_caption: draft.caption, p_template: draft.template,
  })
  if (error) throw new Error(error.message?.includes('DRAFT_CONFLICT') ? messages.DRAFT_CONFLICT : 'No se guardó el borrador. Revisa la selección, tus permisos y la migración.')
  return data
}

export function preparedImageUrl(path) {
  if (!/^[0-9a-f-]{36}\/[1-9][0-9]*\/[0-9a-f-]{36}\.jpg$/i.test(path)) return ''
  return supabase.storage.from('instagram-prepared').getPublicUrl(path).data.publicUrl
}

export function sourceImageUrl(image) { return catalogImageUrl(supabase, image) }

export async function prepareInstagramDraft(draft, action, imageId, body) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error(messages.UNAUTHORIZED)
  const query = new URLSearchParams({ id: draft.id, revision: String(draft.revision), action })
  if (imageId) query.set('image_id', imageId)
  const { data, error } = await supabase.functions.invoke(`instagram-prepare?${query}`, {
    method: 'POST', body,
    headers: { Authorization: `Bearer ${session.access_token}`, ...(body ? { 'Content-Type': 'image/jpeg' } : {}) },
  })
  if (error) {
    let response
    try { response = await error.context?.json() } catch { /* No raw error bodies. */ }
    throw new Error(instagramErrorMessage(response?.error?.code || (error.context?.status === 401 ? 'UNAUTHORIZED' : 'OPERATION_FAILED')))
  }
  if (!data?.draft) throw new Error(messages.OPERATION_FAILED)
  return data.draft
}

export async function getInstagramStatus() {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !session) throw new Error(messages.UNAUTHORIZED)
  const { data, error } = await supabase.functions.invoke('instagram-status', {
    method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` },
  })
  if (error) {
    let body
    try { body = await error.context?.json() } catch { /* Gateway errors may not be JSON. */ }
    const fallback = error.context?.status === 401 ? messages.UNAUTHORIZED
      : error.context?.status === 403 ? messages.FORBIDDEN
        : 'No se pudo consultar Instagram. Comprueba que la función esté desplegada y vuelve a intentarlo.'
    throw new Error(messages[body?.error?.code] || fallback)
  }
  if (data?.connected !== true || typeof data.account_id !== 'string' || data.username !== 'prartjewelry') {
    throw new Error(messages[data?.error?.code] || messages.INSTAGRAM_INVALID_RESPONSE)
  }
  return { connected: true, account_id: data.account_id, username: data.username }
}
