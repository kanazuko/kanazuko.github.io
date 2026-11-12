import { pathToFileURL } from 'node:url'
import { maintenanceProjectRef as projectRef, maintenanceFunctions, validateMaintenanceCredentials, MaintenanceDiagnostic, safeMaintenanceDiagnostic, networkDiagnostic } from './check-instagram-maintenance.mjs'

export async function verifyStage3Session(input, functionName, expectedEpoch, fetchImpl = fetch) {
  if (!maintenanceFunctions.includes(functionName) || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(expectedEpoch || '')) throw new MaintenanceDiagnostic('local_validation','INPUT_INVALID')
  const { key, token } = validateMaintenanceCredentials(input?.key, input?.token)
  const base = `https://${projectRef}.supabase.co`
  const stateMatches = state => state?.schema_version === 2 && state.maintenance === true && state.frontend_ready === false && state.deployment_epoch === expectedEpoch
  async function call(path, authenticated, expectedStatus) {
    let response
    try {
      response = await fetchImpl(`${base}${path}`, {
        method: authenticated ? 'POST' : 'GET',
        headers: { apikey: key, ...(authenticated ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : {}) },
        body: authenticated ? '{}' : undefined, redirect: 'error', signal: AbortSignal.timeout(15000),
      })
    } catch (error) { throw networkDiagnostic(error, functionName) }
    if (response.status !== expectedStatus) throw new MaintenanceDiagnostic('http', response.status === 401 ? 'HTTP_UNAUTHORIZED' : response.status === 403 ? 'HTTP_FORBIDDEN' : 'HTTP_UNEXPECTED',functionName,response.status)
    let body
    try { body = await response.json() } catch { throw new MaintenanceDiagnostic('response','RESPONSE_JSON_INVALID',functionName,response.status) }
    if (authenticated && !response.headers.get('cache-control')?.includes('no-store')) throw new MaintenanceDiagnostic('response','CACHE_POLICY_MISMATCH',functionName,response.status)
    return body
  }
  const statusPath = '/rest/v1/rpc/instagram_runtime_status'
  if (!stateMatches(await call(statusPath,false,200))) throw new MaintenanceDiagnostic('response','RESPONSE_CODE_MISMATCH',functionName,200)
  // Health is the only permitted write: it registers this function's readiness.
  const health = await call(`/functions/v1/${functionName}?action=health`,true,200)
  if (health.function_name !== functionName || health.backend_version !== 2 || !stateMatches(health.runtime)) throw new MaintenanceDiagnostic('response','RESPONSE_CODE_MISMATCH',functionName,200)
  const probe = await call(`/functions/v1/${functionName}?action=maintenance-probe`,true,423)
  if (probe?.error?.code !== 'INSTAGRAM_MAINTENANCE') throw new MaintenanceDiagnostic('response','RESPONSE_CODE_MISMATCH',functionName,423)
  const state = await call(statusPath,false,200)
  if (!stateMatches(state)) throw new MaintenanceDiagnostic('response','RESPONSE_CODE_MISMATCH',functionName,200)
  return { project_ref: projectRef, stage3_verified: true, function_name: functionName, backend_version: 2,
    health_http_status: 200, maintenance_http_status: 423,
    runtime: { schema_version: 2, maintenance: true, frontend_ready: false, deployment_epoch: expectedEpoch }, drain_verified: false }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let input, raw = '', result, code = 1
  const chunks = []
  try {
    let length = 0
    for await (const chunk of process.stdin) {
      length += chunk.length
      if (length > 65536) throw new MaintenanceDiagnostic('input_transport','INPUT_TOO_LARGE')
      chunks.push(chunk)
    }
    const bytes = Buffer.concat(chunks)
    try { raw = bytes.toString('utf8') } finally { bytes.fill(0) }
    try { input = JSON.parse(raw) } catch { throw new MaintenanceDiagnostic('input_transport','INPUT_JSON_INVALID') }
    result = await verifyStage3Session(input,process.argv[2],process.argv[3])
    code = 0
  } catch (error) {
    result = { project_ref: projectRef, stage3_verified: false, drain_verified: false, diagnostic: safeMaintenanceDiagnostic(error) }
  } finally {
    raw = ''
    if (input) { input.key = ''; input.token = '' }
    for (const chunk of chunks) chunk.fill(0)
    chunks.length = 0
  }
  process.stdout.write(`${JSON.stringify(result)}\n`, () => process.exit(code))
}
