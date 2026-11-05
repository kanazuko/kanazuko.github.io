export class SafeError extends Error {
  code: string
  status: number
  constructor(code: string, status = 400) { super(code); this.code = code; this.status = status }
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
  return response.json()
}
export const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
export function publicImageUrl(bucket: 'product-images' | 'instagram-prepared', path: string) {
  if (!path || path.split('/').some((part) => !part || part === '.' || part === '..') || /[\\?#%]/.test(path)) throw new SafeError('INVALID_IMAGE_PATH')
  const base = new URL(env('SUPABASE_URL'))
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new SafeError('INVALID_MEDIA_ORIGIN', 503)
  return `${base.origin}/storage/v1/object/public/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`
}
export async function graph(path: string) {
  // Only fixed paths constructed by backend code; no user-supplied hosts/URLs.
  const token = env('INSTAGRAM_ACCESS_TOKEN')
  const response = await fetch(`https://graph.facebook.com/v26.0/${path}`, {
    headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(15000),
  })
  const body = await response.json()
  if (!response.ok || body.error) {
    const code = body.error?.code
    throw new SafeError(code === 190 ? 'INSTAGRAM_TOKEN_INVALID' : [10, 200].includes(code) ? 'INSTAGRAM_PERMISSION_DENIED'
      : response.status === 429 || [4, 17, 32, 613].includes(code) ? 'INSTAGRAM_RATE_LIMIT' : 'INSTAGRAM_REJECTED', 502)
  }
  return body
}
export async function checkPublishingAccess() {
  // Capability check against the actual account. Meta's Unified Login reference for
  // content_publishing_limit requires BOTH instagram_basic and instagram_content_publish.
  // Avoid treating /me/permissions (User API) as a guaranteed SUAT endpoint.
  let after = ''
  for (let page = 0; page < 10; page++) {
    const result = await graph(`me/assigned_instagram_accounts?fields=id,username&limit=100${after ? `&after=${encodeURIComponent(after)}` : ''}`)
    const account = Array.isArray(result.data) ? result.data.find((item: { id: string; username: string }) => item?.username === 'prartjewelry' && typeof item.id === 'string' && /^\d+$/.test(item.id)) : undefined
    if (account) {
      const limit = await graph(`${account.id}/content_publishing_limit?fields=config,quota_usage`)
      const quota = limit.data?.[0]
      if (!Number.isInteger(quota?.quota_usage) || quota.quota_usage < 0 || !Number.isInteger(quota?.config?.quota_total) || quota.config.quota_total < 1) throw new SafeError('PUBLISH_LIMIT_UNVERIFIED', 502)
      if (quota.quota_usage >= quota.config.quota_total) throw new SafeError('INSTAGRAM_RATE_LIMIT', 429)
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
