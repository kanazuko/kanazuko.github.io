import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { verifyMaintenanceSession } from '../scripts/verify-instagram-maintenance-input.mjs'
import { publicTestKey, sessionJwt } from './helpers/instagram-session.js'

test('isolated verification uses credentials only for the three fixed bridge URLs', async () => {
  const calls = []
  const input = { key: publicTestKey, token: sessionJwt() }
  const result = await verifyMaintenanceSession(input, async (url, options) => {
    calls.push(url)
    assert.equal(options.headers.apikey, input.key)
    assert.equal(options.headers.Authorization, `Bearer ${input.token}`)
    assert.equal(options.redirect, 'error')
    assert.equal(options.body, '{}')
    return Response.json({ error: { code: 'INSTAGRAM_MAINTENANCE' } }, { status: 423,
      headers: { 'X-Instagram-Maintenance-Bridge': 'prartjewelry-v1', 'Cache-Control': 'no-store' } })
  })
  assert.deepEqual(calls, ['instagram-status','instagram-prepare','instagram-publish'].map(name => `https://blsezjyhiholzwmqewef.supabase.co/functions/v1/${name}?action=maintenance-probe`))
  assert.equal(JSON.stringify(result).includes(input.token), false)
  assert.equal(JSON.stringify(result).includes(input.key), false)
  await assert.rejects(verifyMaintenanceSession({ key: '', token: '' }), error => error.phase === 'local_validation' && error.code === 'INPUT_INVALID')
})

test('stdin worker failures do not echo credential input or exceptions', () => {
  const value = 'fake-sensitive-value-that-must-not-appear'
  const child = spawnSync(process.execPath, ['scripts/verify-instagram-maintenance-input.mjs'], { input: `{invalid-${value}`, encoding: 'utf8' })
  assert.equal(child.status, 1)
  assert.equal(child.stdout.includes(value), false)
  assert.equal(child.stderr.includes(value), false)
  assert.equal(JSON.parse(child.stdout).bridge_verified, false)
  assert.equal(JSON.parse(child.stdout).diagnostic.phase, 'input_transport')
  assert.equal(JSON.parse(child.stdout).diagnostic.code, 'INPUT_JSON_INVALID')
})

test('local GUI is verification-only and does not persist credential values', async () => {
  const text = await readFile(new URL('../scripts/verify-instagram-maintenance-local.ps1', import.meta.url), 'utf8')
  assert.match(text, /UseSystemPasswordChar = \$true/)
  assert.match(text, /StandardInput\.Write\(\$payload\)/)
  assert.doesNotMatch(text, /Set-Content|Out-File|Add-Content|SetEnvironmentVariable|functions deploy|auth\/v1|rest\/v1\/admin_users|CredRead/)
  assert.doesNotMatch(text, /\$env:\w+\s*=/)
  assert.match(text, /exit \$status/)
})
