export class SafeError extends Error {
  code: string
  status: number
  constructor(code: string, status = 400) { super(code); this.code = code; this.status = status }
}
export class MetaNotSentError extends SafeError {}
export const instagramAccountId = '17841465479111585'
export const instagramSchemaVersion = 2
export async function requireInstagramRuntime(allowMaintenance = false) {
  let state
  try { state = await database('rpc/instagram_runtime_status', 'POST', {}) }
  catch { throw new SafeError('INSTAGRAM_SCHEMA_INCOMPATIBLE', 503) }
  if (state?.schema_version !== instagramSchemaVersion || typeof state.maintenance !== 'boolean') throw new SafeError('INSTAGRAM_SCHEMA_INCOMPATIBLE', 503)
  if (state.maintenance && !allowMaintenance) throw new SafeError('INSTAGRAM_MAINTENANCE', 423)
  return state
}
export async function instagramHealth(functionName: string) {
  await requireInstagramRuntime(true)
  const runtime = await database('rpc/register_instagram_backend', 'POST', { p_name: functionName, p_version: instagramSchemaVersion })
  return { function_name: functionName, backend_version: instagramSchemaVersion, runtime }
}
export async function instagramMaintenanceProbe(): Promise<never> {
  const state = await requireInstagramRuntime(true)
  // A rollout probe must never become a provider lookup if maintenance changes.
  throw new SafeError(state.maintenance ? 'INSTAGRAM_MAINTENANCE' : 'INSTAGRAM_MAINTENANCE_REQUIRED', state.maintenance ? 423 : 409)
}
export async function acknowledgeInstagramWrite(context: MetaContext) {
  if (!context.post_id || !context.attempt_id) return
  await database('rpc/ack_instagram_write', 'POST', {
    p_actor: context.actor_id, p_account: instagramAccountId, p_post: context.post_id, p_attempt: context.attempt_id,
  })
}
export type MetaContext = { actor_id: string; post_id?: string; revision?: number; attempt_id?: string }
export async function auditEvent(context: MetaContext, operation: string, details: Record<string, unknown> = {}) {
  const recordedAt = new Date().toISOString()
  await database('instagram_events', 'POST', { ...context, operation, started_at: recordedAt, finished_at: recordedAt, ...details })
}

// Only structured, allowlisted provider diagnostics are retained. Never persist messages,
// response bodies, request parameters, tokens or paging URLs.
export function metaErrorCode(status: number, code?: number) {
  return status === 401 || code === 190 ? 'INSTAGRAM_TOKEN_INVALID'
    : status === 429 || [4, 17, 32, 613].includes(code || 0) ? 'INSTAGRAM_RATE_LIMIT'
      : code === 368 ? 'INSTAGRAM_ACCOUNT_RESTRICTED'
        : status === 403 || [10, 200].includes(code || 0) ? 'INSTAGRAM_PERMISSION_DENIED'
          : status >= 500 ? 'INSTAGRAM_TEMPORARY_ERROR' : 'INSTAGRAM_REJECTED'
}
export async function metaRequest(path: string, context: MetaContext, fields?: Record<string, string>, signal?: AbortSignal) {
  if (!/^(?:me\/assigned_instagram_accounts|\d+(?:\/(?:media|media_publish|content_publishing_limit))?)(?:\?|$)/.test(path)) throw new SafeError('INVALID_REQUEST')
  let token: string
  // The transactional guard and request ledger must be durable before contacting Meta.
  // All three functions use the same fixed account scope, including discovery calls.
  let reservation
  try {
    await requireInstagramRuntime()
    token = env('INSTAGRAM_ACCESS_TOKEN')
    reservation = await database('rpc/begin_instagram_request', 'POST', {
      p_actor: context.actor_id, p_account: instagramAccountId, p_post: context.post_id || null,
      p_revision: context.revision || null, p_attempt: context.attempt_id || null,
      p_operation: fields ? path.split('?')[0].endsWith('/media_publish') ? 'publish_media' : 'create_container'
        : path.startsWith('me/') ? 'discover_account' : path.includes('/content_publishing_limit') ? 'read_quota'
          : path.includes('fields=status_code') ? 'poll_container' : 'read_metadata',
      p_endpoint: path.split('?')[0], p_method: fields ? 'POST' : 'GET',
    })
    if (reservation.error_code) throw new SafeError(reservation.error_code, 429)
    if (typeof reservation.id !== 'string') throw new SafeError('DATABASE_UNAVAILABLE', 503)
  } catch (error) {
    // A failure before fetch proves no remote write was sent; it is safe to retain
    // the previous checkpoint. Anything after fetch remains conservative.
    throw new MetaNotSentError(error instanceof SafeError ? error.code : 'DATABASE_UNAVAILABLE', error instanceof SafeError ? error.status : 503)
  }
  let response: Response | undefined
  let result: Record<string, any> = {}
  let failure: string | undefined
  try {
    response = await fetch(`https://graph.facebook.com/v26.0/${path}`, {
      method: fields ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}` },
      body: fields ? new URLSearchParams(fields) : undefined, redirect: 'error',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(fields ? 20000 : 15000)]) : AbortSignal.timeout(fields ? 20000 : 15000),
    })
    result = await response.json()
    if (!result || typeof result !== 'object') { result = {}; failure = 'INSTAGRAM_INVALID_RESPONSE' }
    if (!response.ok || result.error) failure = metaErrorCode(response.status, result.error?.code)
    if (fields && (typeof result.id !== 'string' || !/^\d+$/.test(result.id))) failure ||= 'INSTAGRAM_INVALID_RESPONSE'
  } catch { failure = response && !response.ok ? metaErrorCode(response.status) : 'CONNECTION_UNAVAILABLE' }
  const retryHeader = response?.headers.get('retry-after')
  const retryDate = retryHeader ? Date.parse(retryHeader) : NaN
  const retrySeconds = retryHeader && /^\d+$/.test(retryHeader) ? Number(retryHeader) : Number.isFinite(retryDate) ? Math.ceil((retryDate - Date.now()) / 1000) : 0
  const code = result.error?.code
  const subcode = result.error?.error_subcode
  // If finalizing the audit fails after a write, the caller must retain its uncertain lock.
  await database('rpc/finish_instagram_request', 'POST', {
    p_id: reservation.id, p_error: failure || null, p_http_status: response?.status || null,
    p_meta_code: Number.isSafeInteger(code) ? code : null,
    p_meta_subcode: Number.isSafeInteger(subcode) ? subcode : null,
    p_trace: typeof result.error?.fbtrace_id === 'string' && /^[\w-]{1,128}$/.test(result.error.fbtrace_id) ? result.error.fbtrace_id : null,
    p_remote_id: typeof result.id === 'string' && /^\d+$/.test(result.id) ? result.id : null,
    p_container_status: ['IN_PROGRESS', 'FINISHED', 'PUBLISHED', 'ERROR', 'EXPIRED'].includes(result.status_code) ? result.status_code : null,
    p_retry_seconds: Number.isFinite(retrySeconds) ? Math.max(0, Math.min(retrySeconds, 2147483647)) : 0,
  })
  if (failure) throw new SafeError(failure, 502)
  return result
}
export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
export function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { ...cors, 'Cache-Control': 'no-store' } })
}
export function safeFailure(error: unknown) {
  return json({ error: { code: error instanceof SafeError ? error.code : 'OPERATION_FAILED' } }, error instanceof SafeError ? error.status : 503)
}
export function env(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new SafeError('SERVER_CONFIGURATION', 503)
  return value
}
export async function authenticate(request: Request) {
  const authorization = request.headers.get('authorization')
  if (!authorization || !/^Bearer \S+$/i.test(authorization)) throw new SafeError('UNAUTHORIZED', 401)
  const headers = { apikey: env('SUPABASE_ANON_KEY'), Authorization: authorization }
  const auth = await fetch(`${env('SUPABASE_URL')}/auth/v1/user`, { headers, redirect: 'error', signal: AbortSignal.timeout(10000) })
  if (!auth.ok) throw new SafeError('UNAUTHORIZED', 401)
  const user = await auth.json()
  if (typeof user.id !== 'string' || user.is_anonymous) throw new SafeError('UNAUTHORIZED', 401)
  const membership = await fetch(`${env('SUPABASE_URL')}/rest/v1/admin_users?select=user_id&user_id=eq.${encodeURIComponent(user.id)}`, { headers, redirect: 'error', signal: AbortSignal.timeout(10000) })
  if (!membership.ok) throw new SafeError('AUTHORIZATION_UNAVAILABLE', 503)
  const rows = await membership.json()
  if (!Array.isArray(rows) || !rows.some((row) => row.user_id === user.id)) throw new SafeError('FORBIDDEN', 403)
  return user.id as string
}
export function serviceHeaders() {
  return { apikey: env('SUPABASE_SERVICE_ROLE_KEY'), Authorization: `Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}` }
}
export async function database(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(`${env('SUPABASE_URL')}/rest/v1/${path}`, {
    method, headers: { ...serviceHeaders(), 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new SafeError('DATABASE_UNAVAILABLE', 503)
  if (response.status === 204) return null
  return response.json()
}
export const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
export function publicImageUrl(bucket: 'product-images' | 'instagram-prepared', path: string) {
  if (!path || path.split('/').some((part) => !part || part === '.' || part === '..') || /[\\?#%]/.test(path)) throw new SafeError('INVALID_IMAGE_PATH')
  const base = new URL(env('SUPABASE_URL'))
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new SafeError('INVALID_MEDIA_ORIGIN', 503)
  return `${base.origin}/storage/v1/object/public/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`
}
export async function graph(path: string, context: MetaContext) {
  return metaRequest(path, context)
}
export async function checkPublishingAccess(context: MetaContext) {
  // Capability check against the actual account. Meta's Unified Login reference for
  // content_publishing_limit requires BOTH instagram_basic and instagram_content_publish.
  // Avoid treating /me/permissions (User API) as a guaranteed SUAT endpoint.
  let after = ''
  for (let page = 0; page < 10; page++) {
    const result = await graph(`me/assigned_instagram_accounts?fields=id,username&limit=100${after ? `&after=${encodeURIComponent(after)}` : ''}`, context)
    const account = Array.isArray(result.data) ? result.data.find((item: { id: string; username: string }) => item?.username === 'prartjewelry' && typeof item.id === 'string' && /^\d+$/.test(item.id)) : undefined
    if (account) {
      const limit = await graph(`${account.id}/content_publishing_limit?fields=config,quota_usage`, context)
      const quota = limit.data?.[0]
      if (!Number.isInteger(quota?.quota_usage) || quota.quota_usage < 0 || !Number.isInteger(quota?.config?.quota_total) || quota.config.quota_total < 1) throw new SafeError('PUBLISH_LIMIT_UNVERIFIED', 502)
      if (quota.quota_usage >= quota.config.quota_total) {
        await database('rpc/pause_instagram_account', 'POST', { p_account: instagramAccountId, p_reason: 'INSTAGRAM_RATE_LIMIT', p_seconds: 3600 })
        throw new SafeError('INSTAGRAM_RATE_LIMIT', 429)
      }
      return { account_id: account.id as string, checked_at: new Date().toISOString() }
    }
    if (!result.paging?.next) break
    const cursor = result.paging?.cursors?.after
    if (typeof cursor !== 'string' || !cursor || cursor === after) break
    after = cursor
  }
  throw new SafeError('INSTAGRAM_ACCOUNT_NOT_FOUND', 502)
}
export async function limitedBytes(request: Request | Response, limit: number) {
  if (Number(request.headers.get('content-length')) > limit) throw new SafeError('IMAGE_TOO_LARGE', 413)
  const reader = request.body?.getReader()
  if (!reader) throw new SafeError('INVALID_IMAGE')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) throw new SafeError('IMAGE_TOO_LARGE', 413)
      chunks.push(value)
    }
  } finally { await reader.cancel() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return bytes
}
