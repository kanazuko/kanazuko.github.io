import { pathToFileURL } from 'node:url'
import { checkInstagramMaintenance, maintenanceProjectRef, MaintenanceDiagnostic, safeMaintenanceDiagnostic } from './check-instagram-maintenance.mjs'

// Credential input is an anonymous stdin pipe from the local masked dialog.
// It is never an argument, environment variable, file, stdout or stderr value.
export async function verifyMaintenanceSession(input, fetchImpl = fetch) {
  if (!input || typeof input.key !== 'string' || typeof input.token !== 'string'
    || !input.key.trim() || !input.token.trim() || input.key.length > 4096 || input.token.length > 32768) throw new MaintenanceDiagnostic('local_validation', 'INPUT_INVALID')
  const functions = await checkInstagramMaintenance({ env: {
    VITE_SUPABASE_URL: `https://${maintenanceProjectRef}.supabase.co`,
    VITE_SUPABASE_PUBLISHABLE_KEY: input.key,
    SUPABASE_ADMIN_ACCESS_TOKEN: input.token,
  }, fetchImpl })
  return { project_ref: maintenanceProjectRef, bridge_verified: true, drain_verified: false, functions }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let raw = '', input, result, code = 1
  const chunks = []
  try {
    let size = 0
    for await (const chunk of process.stdin) {
      size += chunk.length
      if (size > 65536) throw new MaintenanceDiagnostic('input_transport', 'INPUT_TOO_LARGE')
      chunks.push(chunk)
    }
    const bytes = Buffer.concat(chunks)
    try { raw = bytes.toString('utf8') } finally { bytes.fill(0) }
    try { input = JSON.parse(raw) } catch { throw new MaintenanceDiagnostic('input_transport', 'INPUT_JSON_INVALID') }
    result = await verifyMaintenanceSession(input)
    code = 0
  } catch (error) {
    // Never print request objects, headers, credentials or raw exception messages.
    result = { project_ref: maintenanceProjectRef, bridge_verified: false, drain_verified: false,
      diagnostic: safeMaintenanceDiagnostic(error) }
  } finally {
    raw = ''
    if (input) { input.key = ''; input.token = '' }
    for (const chunk of chunks) chunk.fill(0)
    chunks.length = 0
  }
  // Explicitly terminate this dedicated worker after flushing sanitized output.
  // Managed strings may have had copies: this is not a promise of forensic erasure.
  process.stdout.write(`${JSON.stringify(result)}\n`, () => process.exit(code))
}
