import { authenticate, cors, json, safeFailure } from '../_shared/instagram.ts'

// Deliberate source-code gate for this stage. No request field, environment variable,
// database write or browser modification can enable publication. A subsequent reviewed
// implementation requires explicit administrator confirmation and a persisted attempt.
Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method !== 'POST') return json({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405)
  try {
    await authenticate(request)
    return json({ error: { code: 'PUBLISHING_DISABLED' } }, 423)
  } catch (error) { return safeFailure(error) }
})
