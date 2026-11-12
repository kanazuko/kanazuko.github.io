import { pathToFileURL } from 'node:url'

export const maintenanceProjectRef = 'blsezjyhiholzwmqewef'
export const maintenanceFunctions = ['instagram-status', 'instagram-prepare', 'instagram-publish']
export const diagnosticPhases = ['credential_entry', 'input_transport', 'local_validation', 'connection', 'tls', 'http', 'response', 'internal']
export const diagnosticCodes = ['CREDENTIAL_UI_FAILED','INPUT_CANCELLED','INPUT_INVALID','INPUT_JSON_INVALID','INPUT_TOO_LARGE','INPUT_ENCODING_FAILED','INPUT_PIPE_FAILED','WORKER_START_FAILED','WORKER_TIMEOUT','WORKER_OUTPUT_INVALID','PUBLIC_KEY_INVALID','SESSION_INVALID','KEY_TOKEN_CONFUSED','SESSION_EXPIRED','PROJECT_MISMATCH','DNS_FAILED','CONNECTION_FAILED','REQUEST_TIMEOUT','TLS_FAILED','HTTP_UNAUTHORIZED','HTTP_FORBIDDEN','HTTP_UNEXPECTED','RESPONSE_JSON_INVALID','RESPONSE_CODE_MISMATCH','BRIDGE_MARKER_MISMATCH','CACHE_POLICY_MISMATCH','UNEXPECTED_FAILURE']
export class MaintenanceDiagnostic extends Error {
  constructor(phase, code, functionName, httpStatus) {
    super(`Maintenance bridge not verified: ${code}`)
    this.phase = phase; this.code = code; this.functionName = functionName; this.httpStatus = httpStatus
  }
}
export function safeMaintenanceDiagnostic(error) {
  const known = error instanceof MaintenanceDiagnostic
  const diagnostic = {
    phase: known && diagnosticPhases.includes(error.phase) ? error.phase : 'internal',
    code: known && diagnosticCodes.includes(error.code) ? error.code : 'UNEXPECTED_FAILURE',
  }
  if (known && maintenanceFunctions.includes(error.functionName)) diagnostic.function_name = error.functionName
  if (known && Number.isInteger(error.httpStatus) && error.httpStatus >= 100 && error.httpStatus <= 599) diagnostic.http_status = error.httpStatus
  return diagnostic
}

function jwtPayload(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) return null
  try {
    const payload = JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString('utf8'))
    return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null
  } catch { return null }
}
export function validateMaintenanceCredentials(key, token) {
  if (typeof key !== 'string' || typeof token !== 'string' || !key.trim() || !token.trim() || key.length > 4096 || token.length > 32768) throw new MaintenanceDiagnostic('local_validation', 'INPUT_INVALID')
  key = key.trim(); token = token.trim()
  if (key === token || /^Bearer\s/i.test(token) || /^sb_(?:publishable|secret)_/.test(token)) throw new MaintenanceDiagnostic('local_validation', 'KEY_TOKEN_CONFUSED')
  const publicPayload = jwtPayload(key)
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key) && publicPayload?.role !== 'anon') throw new MaintenanceDiagnostic('local_validation', 'PUBLIC_KEY_INVALID')
  if (publicPayload?.ref && publicPayload.ref !== maintenanceProjectRef) throw new MaintenanceDiagnostic('local_validation', 'PROJECT_MISMATCH')
  const payload = jwtPayload(token)
  if (!payload || payload.role !== 'authenticated' || typeof payload.sub !== 'string' || !Number.isFinite(payload.exp)) throw new MaintenanceDiagnostic('local_validation', payload?.role === 'anon' || payload?.role === 'service_role' ? 'KEY_TOKEN_CONFUSED' : 'SESSION_INVALID')
  if (payload.exp <= Date.now() / 1000) throw new MaintenanceDiagnostic('local_validation', 'SESSION_EXPIRED')
  if ((payload.ref && payload.ref !== maintenanceProjectRef)
    || (payload.iss && payload.iss !== `https://${maintenanceProjectRef}.supabase.co/auth/v1`)) throw new MaintenanceDiagnostic('local_validation', 'PROJECT_MISMATCH')
  // These are format/mix-up checks only, not signature or administrator verification.
  // The configured gateway must validate the real session JWT.
  return { key, token }
}

export function networkDiagnostic(error, name) {
  const code = error?.cause?.code || error?.code
  if (typeof code === 'string' && (/^ERR_(TLS|SSL)_/.test(code) || ['CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_VERIFY_LEAF_SIGNATURE','UNABLE_TO_GET_ISSUER_CERT_LOCALLY','CERT_SIGNATURE_FAILURE'].includes(code))) return new MaintenanceDiagnostic('tls', 'TLS_FAILED', name)
  if (['ENOTFOUND','EAI_AGAIN'].includes(code)) return new MaintenanceDiagnostic('connection', 'DNS_FAILED', name)
  if (['AbortError','TimeoutError'].includes(error?.name) || ['ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT'].includes(code)) return new MaintenanceDiagnostic('connection', 'REQUEST_TIMEOUT', name)
  return new MaintenanceDiagnostic('connection', 'CONNECTION_FAILED', name)
}

// Run only AFTER deploying the bridge. No draft IDs, revision numbers, publish
// actions or session tokens appear in the output. No retries or redirects.
export async function checkInstagramMaintenance({ env = process.env, fetchImpl = fetch }) {
  const { key, token } = validateMaintenanceCredentials(env.VITE_SUPABASE_PUBLISHABLE_KEY, env.SUPABASE_ADMIN_ACCESS_TOKEN)
  const base = `https://${maintenanceProjectRef}.supabase.co`
  if (env.VITE_SUPABASE_URL) {
    let url
    try { url = new URL(env.VITE_SUPABASE_URL) } catch { throw new MaintenanceDiagnostic('local_validation', 'PROJECT_MISMATCH') }
    if (url.origin !== base || url.username || url.password) throw new MaintenanceDiagnostic('local_validation', 'PROJECT_MISMATCH')
  }
  const results = []
  for (const name of maintenanceFunctions) {
    let response
    try { response = await fetchImpl(`${base}/functions/v1/${name}?action=maintenance-probe`, {
      method: 'POST', headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}', redirect: 'error', signal: AbortSignal.timeout(15000),
    }) } catch (error) { throw networkDiagnostic(error, name) }
    if (response.status !== 423) throw new MaintenanceDiagnostic('http', response.status === 401 ? 'HTTP_UNAUTHORIZED' : response.status === 403 ? 'HTTP_FORBIDDEN' : 'HTTP_UNEXPECTED', name, response.status)
    let body
    try { body = await response.json() } catch { throw new MaintenanceDiagnostic('response', 'RESPONSE_JSON_INVALID', name, response.status) }
    if (body?.error?.code !== 'INSTAGRAM_MAINTENANCE') throw new MaintenanceDiagnostic('response', 'RESPONSE_CODE_MISMATCH', name, response.status)
    if (response.headers.get('x-instagram-maintenance-bridge') !== 'prartjewelry-v1') throw new MaintenanceDiagnostic('response', 'BRIDGE_MARKER_MISMATCH', name, response.status)
    if (!response.headers.get('cache-control')?.includes('no-store')) throw new MaintenanceDiagnostic('response', 'CACHE_POLICY_MISMATCH', name, response.status)
    results.push({ function_name: name, http_status: 423, maintenance_code: 'INSTAGRAM_MAINTENANCE', bridge: 'prartjewelry-v1' })
  }
  return results
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkInstagramMaintenance({}).then(results => console.log(JSON.stringify({ project_ref: maintenanceProjectRef, bridge_verified: true, drain_verified: false, functions: results }, null, 2)))
    .catch(error => { console.log(JSON.stringify({ project_ref: maintenanceProjectRef, bridge_verified: false, drain_verified: false, diagnostic: safeMaintenanceDiagnostic(error) })); process.exitCode = 1 })
}
