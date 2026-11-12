import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { checkInstagramMaintenance, safeMaintenanceDiagnostic, diagnosticCodes } from '../scripts/check-instagram-maintenance.mjs'
import { publicTestKey, sessionJwt } from './helpers/instagram-session.js'
import { readFile } from 'node:fs/promises'

const env = () => ({ VITE_SUPABASE_PUBLISHABLE_KEY: publicTestKey, SUPABASE_ADMIN_ACCESS_TOKEN: sessionJwt() })
async function diagnose(fetchImpl, overrides = {}) {
  try { await checkInstagramMaintenance({ env: { ...env(), ...overrides }, fetchImpl }); assert.fail('Expected diagnostic') }
  catch (error) { return safeMaintenanceDiagnostic(error) }
}
test('local validation distinguishes missing, confused, expired and foreign credentials without HTTP', async () => {
  let calls = 0
  const fetchImpl = () => { calls++; throw new Error('must not call') }
  const cases = [
    [{ SUPABASE_ADMIN_ACCESS_TOKEN: '' }, 'INPUT_INVALID'],
    [{ SUPABASE_ADMIN_ACCESS_TOKEN: publicTestKey }, 'KEY_TOKEN_CONFUSED'],
    [{ SUPABASE_ADMIN_ACCESS_TOKEN: `Bearer ${sessionJwt()}` }, 'KEY_TOKEN_CONFUSED'],
    [{ SUPABASE_ADMIN_ACCESS_TOKEN: sessionJwt({ role: 'anon' }) }, 'KEY_TOKEN_CONFUSED'],
    [{ SUPABASE_ADMIN_ACCESS_TOKEN: sessionJwt({ role: 'service_role' }) }, 'KEY_TOKEN_CONFUSED'],
    [{ VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_sensitive' }, 'PUBLIC_KEY_INVALID'],
    [{ SUPABASE_ADMIN_ACCESS_TOKEN: sessionJwt({ exp: 1 }) }, 'SESSION_EXPIRED'],
    [{ SUPABASE_ADMIN_ACCESS_TOKEN: sessionJwt({ iss: 'https://other.supabase.co/auth/v1' }) }, 'PROJECT_MISMATCH'],
  ]
  for (const [overrides, code] of cases) assert.deepEqual(await diagnose(fetchImpl, overrides), { phase: 'local_validation', code })
  assert.equal(calls, 0)
})
test('connection and TLS diagnostics do not forward external messages or arbitrary error codes', async () => {
  for (const [causeCode, phase, code] of [['ENOTFOUND','connection','DNS_FAILED'],['ECONNRESET','connection','CONNECTION_FAILED'],['CERT_HAS_EXPIRED','tls','TLS_FAILED'],['UNABLE_TO_VERIFY_LEAF_SIGNATURE','tls','TLS_FAILED'],['UND_ERR_CONNECT_TIMEOUT','connection','REQUEST_TIMEOUT']]) {
    const value = await diagnose(async () => { throw new Error('sensitive-message', { cause: { code: causeCode, headers: { Authorization: 'sensitive-token' } } }) })
    assert.deepEqual(value, { phase, code, function_name: 'instagram-status' })
    assert.equal(JSON.stringify(value).includes('sensitive'), false)
  }
})
test('HTTP errors keep status but never read the sensitive error body', async () => {
  for (const status of [200,301,401,403,429,500]) {
    const value = await diagnose(async () => ({ status, json() { throw new Error('Error body must not be read') } }))
    assert.equal(value.phase, 'http'); assert.equal(value.http_status, status)
    assert.equal(value.code, status === 401 ? 'HTTP_UNAUTHORIZED' : status === 403 ? 'HTTP_FORBIDDEN' : 'HTTP_UNEXPECTED')
  }
})
test('response diagnostics distinguish JSON, maintenance code, marker and cache policy', async () => {
  const valid = { error: { code: 'INSTAGRAM_MAINTENANCE' } }
  const headers = { 'X-Instagram-Maintenance-Bridge': 'prartjewelry-v1', 'Cache-Control': 'no-store' }
  const cases = [
    [() => new Response('private-non-json', { status: 423 }), 'RESPONSE_JSON_INVALID'],
    [() => Response.json({ private: 'do-not-print' }, { status: 423, headers }), 'RESPONSE_CODE_MISMATCH'],
    [() => Response.json(valid, { status: 423, headers: { ...headers, 'X-Instagram-Maintenance-Bridge': 'secret-never-print' } }), 'BRIDGE_MARKER_MISMATCH'],
    [() => Response.json(valid, { status: 423, headers: { ...headers, 'Cache-Control': 'private' } }), 'CACHE_POLICY_MISMATCH'],
  ]
  for (const [response, code] of cases) {
    const value = await diagnose(async () => response())
    assert.deepEqual(value, { phase: 'response', code, function_name: 'instagram-status', http_status: 423 })
  }
  assert.deepEqual(safeMaintenanceDiagnostic({ phase: 'http', code: 'JWT_SECRET', httpStatus: 401 }), { phase: 'internal', code: 'UNEXPECTED_FAILURE' })
})
test('real Node stdin worker reports local rejection without leaking a fake JWT', () => {
  const token = sessionJwt({ exp: 1 })
  const child = spawnSync(process.execPath, ['scripts/verify-instagram-maintenance-input.mjs'], { input: JSON.stringify({ key: publicTestKey, token }), encoding: 'utf8' })
  assert.equal(child.status, 1)
  assert.deepEqual(JSON.parse(child.stdout).diagnostic, { phase: 'local_validation', code: 'SESSION_EXPIRED' })
  assert.equal(child.stdout.includes(token), false); assert.equal(child.stderr.includes(token), false)
})
test('PowerShell serialization and private stdin preserve distinct fields into Node', { skip: process.platform !== 'win32' }, () => {
  const worker = fileURLToPath(new URL('../scripts/verify-instagram-maintenance-input.mjs', import.meta.url)).replaceAll("'", "''")
  const node = process.execPath.replaceAll("'", "''")
  const token = sessionJwt({ exp: 1 }) // Guaranteed local rejection; no live request.
  const script = `
    $ErrorActionPreference='Stop'
    Add-Type -AssemblyName System.Web.Extensions
    $serializer=New-Object System.Web.Script.Serialization.JavaScriptSerializer
    $payload=$serializer.Serialize(@{ key='${publicTestKey}'; token='${token}' })
    $start=New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName='${node}'
    $start.Arguments='"${worker}"'
    $start.UseShellExecute=$false; $start.CreateNoWindow=$true
    $start.RedirectStandardInput=$true; $start.RedirectStandardOutput=$true; $start.RedirectStandardError=$true
    $child=New-Object System.Diagnostics.Process; $child.StartInfo=$start
    if (-not $child.Start()) { throw 'Failed' }
    $output=$child.StandardOutput.ReadToEndAsync(); $stderr=$child.StandardError.ReadToEndAsync()
    $child.StandardInput.Write($payload); $child.StandardInput.Close(); $payload=$null
    if (-not $child.WaitForExit(10000)) { $child.Kill(); throw 'Timed out' }
    Write-Output ($output.GetAwaiter().GetResult())
    $child.Dispose()
  `
  const child = spawnSync('powershell.exe', ['-NoProfile','-NonInteractive','-Command',script], { encoding: 'utf8', timeout: 15000 })
  assert.equal(child.status, 0, child.stderr)
  assert.deepEqual(JSON.parse(child.stdout).diagnostic, { phase: 'local_validation', code: 'SESSION_EXPIRED' })
  assert.equal(child.stdout.includes(token), false); assert.equal(child.stderr.includes(token), false)
})
test('PowerShell only forwards diagnostic phases/codes from the same static allowlist', async () => {
  const script = await readFile(new URL('../scripts/verify-instagram-maintenance-local.ps1', import.meta.url), 'utf8')
  for (const code of diagnosticCodes) assert.ok(script.includes(`'${code}'`), `Missing code ${code}`)
  assert.doesNotMatch(script, /\$_\.(Exception|ErrorDetails)|Write-(Output|Error).*StandardError/)
})
