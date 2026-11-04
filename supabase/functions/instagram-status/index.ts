const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function reply(status: number, body: object) {
  return Response.json(body, { status, headers: { ...cors, 'Cache-Control': 'no-store' } })
}

function failure(status: number, code: string) {
  // Never forward provider bodies, exception messages, tokens or paging URLs.
  return reply(status, { connected: false, account_id: null, username: null, error: { code } })
}

// Unified Login documentation (checked 2026-11-04):
// https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/get-started
// /me represents the system user; assigned_instagram_accounts requires instagram_basic.
const graphEndpoint = 'https://graph.facebook.com/v26.0/me/assigned_instagram_accounts'
const expectedUsername = 'prartjewelry'

Deno.serve(async (request: Request) => {
  // Preflight has no data and performs no administrative operation.
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method !== 'POST') return failure(405, 'METHOD_NOT_ALLOWED')
  const authorization = request.headers.get('authorization')
  if (!authorization || !/^Bearer \S+$/i.test(authorization)) return failure(401, 'UNAUTHORIZED')

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !anonKey) return failure(503, 'SERVER_CONFIGURATION')
  const headers = { apikey: anonKey, Authorization: authorization }

  try {
    // Verify with Auth, never trust client claims or a supplied user ID.
    const auth = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers, signal: AbortSignal.timeout(10000), redirect: 'error',
    })
    if (!auth.ok) return failure(auth.status >= 500 ? 503 : 401, auth.status >= 500 ? 'AUTH_UNAVAILABLE' : 'UNAUTHORIZED')
    const user = await auth.json()
    if (typeof user.id !== 'string' || user.is_anonymous === true) return failure(401, 'UNAUTHORIZED')

    // The caller's JWT preserves the existing "Admins read own membership" RLS policy.
    const membership = await fetch(`${supabaseUrl}/rest/v1/admin_users?select=user_id&user_id=eq.${encodeURIComponent(user.id)}&limit=1`, {
      headers, signal: AbortSignal.timeout(10000), redirect: 'error',
    })
    if (!membership.ok) return failure(503, 'AUTHORIZATION_UNAVAILABLE')
    const admins = await membership.json()
    if (!Array.isArray(admins) || !admins.some((admin) => admin?.user_id === user.id)) return failure(403, 'FORBIDDEN')

    const token = Deno.env.get('INSTAGRAM_ACCESS_TOKEN')
    if (!token?.trim()) return failure(503, 'INSTAGRAM_NOT_CONFIGURED')
    // A shared deadline and bounded pagination avoid unbounded provider requests.
    const signal = AbortSignal.timeout(15000)
    let after: string | undefined
    for (let page = 0; page < 10; page += 1) {
      const url = new URL(graphEndpoint)
      url.searchParams.set('fields', 'id,username')
      url.searchParams.set('limit', '100')
      if (after) url.searchParams.set('after', after)
      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` }, signal, redirect: 'error',
      })
      const result = await response.json()
      if (!response.ok || result.error) {
        const code = result.error?.code
        if (code === 190) return failure(502, 'INSTAGRAM_TOKEN_INVALID')
        if (code === 10 || code === 200) return failure(502, 'INSTAGRAM_PERMISSION_DENIED')
        if (response.status === 429 || [4, 17, 32, 613].includes(code)) return failure(503, 'INSTAGRAM_RATE_LIMIT')
        return failure(502, 'INSTAGRAM_REJECTED')
      }
      if (!Array.isArray(result.data)) return failure(502, 'INSTAGRAM_INVALID_RESPONSE')
      const account = result.data.find((item: { username?: string }) => item?.username === expectedUsername)
      if (account) {
        if (typeof account.id !== 'string' || !/^\d+$/.test(account.id)) return failure(502, 'INSTAGRAM_INVALID_RESPONSE')
        return reply(200, { connected: true, account_id: account.id, username: account.username, error: null })
      }
      if (!result.paging?.next) return failure(502, 'INSTAGRAM_ACCOUNT_NOT_FOUND')
      // Do not follow Meta's paging.next URL (it can include a token).
      const cursor = result.paging?.cursors?.after
      if (typeof cursor !== 'string' || !cursor || cursor === after) return failure(502, 'INSTAGRAM_INVALID_RESPONSE')
      after = cursor
    }
    return failure(502, 'INSTAGRAM_ACCOUNT_NOT_FOUND')
  } catch {
    return failure(503, 'CONNECTION_UNAVAILABLE')
  }
})
