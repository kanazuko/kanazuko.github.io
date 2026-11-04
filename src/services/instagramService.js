import { supabase } from '../lib/supabase'

const messages = {
  UNAUTHORIZED: 'Tu sesión no es válida. Inicia sesión nuevamente.',
  FORBIDDEN: 'Tu usuario no tiene autorización administrativa.',
  SERVER_CONFIGURATION: 'Falta configurar el entorno de la función en Supabase.',
  AUTH_UNAVAILABLE: 'No se pudo validar tu sesión. Intenta de nuevo más tarde.',
  AUTHORIZATION_UNAVAILABLE: 'No se pudieron verificar tus permisos administrativos.',
  INSTAGRAM_NOT_CONFIGURED: 'Falta configurar el secreto INSTAGRAM_ACCESS_TOKEN en Supabase.',
  INSTAGRAM_TOKEN_INVALID: 'Meta rechazó el token. Puede haber expirado o sido revocado; reemplázalo en Supabase.',
  INSTAGRAM_PERMISSION_DENIED: 'Meta rechazó el acceso. Revisa instagram_basic y la cuenta autorizada en Unified Login.',
  INSTAGRAM_RATE_LIMIT: 'Meta limitó temporalmente las consultas. Intenta de nuevo más tarde.',
  INSTAGRAM_REJECTED: 'Meta rechazó la consulta. Revisa el token, los permisos y la configuración de Unified Login.',
  INSTAGRAM_INVALID_RESPONSE: 'Meta no devolvió información válida de la cuenta.',
  INSTAGRAM_ACCOUNT_NOT_FOUND: 'Meta no devolvió @prartjewelry entre las cuentas autorizadas. Revisa los activos compartidos.',
  CONNECTION_UNAVAILABLE: 'No fue posible completar la consulta. Revisa la conexión e intenta nuevamente.',
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
