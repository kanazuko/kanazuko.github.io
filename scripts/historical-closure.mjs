// Local backup/preparation only. No management SQL-write client is implemented.
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { execFileSync } from 'node:child_process'
import { chmod, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { validateMaintenanceCredentials } from './check-instagram-maintenance.mjs'

export const closureBaseline = Object.freeze({
  project: 'blsezjyhiholzwmqewef', post: 'f7120683-6f03-43a6-bcf9-18a7ef5d69fe',
  attempt: '9723a05a-982c-43f5-9aac-00491fdcc032', epoch: '3cd91507-439a-4a97-85bc-1dac9d218856',
  targetMd5: 'eb5ae500290608fddf9b7675b3aae534', allMd5: '44eec1f11b52979b908bbe88478b50cd',
})
const hash = (value, algorithm = 'sha256') => createHash(algorithm).update(value).digest('hex')
const uuid = value => /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value || '')
const within = (root, path) => { const rel = relative(root, path); return rel === '' || (!rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel)) }

export function checkBackupIntegrity(snapshot) {
  const fields = ['project_ref','read_only','observed_at','posts','posts_fingerprint','runtime','readiness','events','safety','migrations']
  if (!snapshot || snapshot.project_ref !== closureBaseline.project || snapshot.read_only !== 'on'
    || Object.keys(snapshot).some(k => !fields.includes(k))
    || !Array.isArray(snapshot.posts) || !snapshot.posts.length) throw new Error('CLOSURE_BACKUP_INVALID')
  const ids = snapshot.posts.map(p => p.id)
  if (new Set(ids).size !== ids.length || JSON.stringify(ids) !== JSON.stringify([...ids].sort())) throw new Error('CLOSURE_BACKUP_ORDER_INVALID')
  for (const post of snapshot.posts) {
    if (typeof post.row_json !== 'string' || JSON.parse(post.row_json).id !== post.id) throw new Error('CLOSURE_BACKUP_ROW_INVALID')
  }
  if (hash(snapshot.posts.map(p => p.row_json).join('\n'), 'md5') !== snapshot.posts_fingerprint) throw new Error('CLOSURE_BACKUP_CHECKSUM_FAILED')
  for (const key of ['events', 'safety', 'readiness', 'migrations']) if (!Array.isArray(snapshot[key])) throw new Error('CLOSURE_BACKUP_INCOMPLETE')
  if (!snapshot.runtime || !Number.isFinite(Date.parse(snapshot.observed_at))) throw new Error('CLOSURE_BACKUP_INCOMPLETE')
  return snapshot
}

export function validateClosureSnapshot(snapshot) {
  checkBackupIntegrity(snapshot)
  const target = snapshot.posts.find(p => p.id === closureBaseline.post)
  if (snapshot.posts.length !== 18 || snapshot.posts_fingerprint !== closureBaseline.allMd5
    || !target || hash(target.row_json, 'md5') !== closureBaseline.targetMd5) throw new Error('CLOSURE_BASELINE_CHANGED')
  const r = snapshot.runtime
  if (r.schema_version !== 2 || r.maintenance !== true || r.frontend_ready !== false || r.deployment_epoch !== closureBaseline.epoch
    || snapshot.events.length || snapshot.safety.length) throw new Error('CLOSURE_STATE_CHANGED')
  const names = ['instagram-prepare', 'instagram-publish', 'instagram-status']
  if (JSON.stringify(snapshot.readiness.map(x => x.function_name).sort()) !== JSON.stringify(names)
    || snapshot.readiness.some(x => x.schema_version !== 2 || x.deployment_epoch !== closureBaseline.epoch)) throw new Error('CLOSURE_READINESS_CHANGED')
  return snapshot
}

export async function savePrivateClosureBackup(snapshot) {
  checkBackupIntegrity(snapshot)
  // Only OS Temp; no caller-selected repository destination.
  const root = await realpath(tmpdir()), repository = await realpath(process.cwd())
  if (within(repository, root)) throw new Error('CLOSURE_PRIVATE_PATH_REQUIRED')
  const directory = await mkdtemp(join(root, 'prart-closure-private-'))
  if (process.platform === 'win32') {
    const user = execFileSync('whoami', [], { encoding: 'utf8', windowsHide: true }).trim()
    execFileSync('icacls', [directory, '/inheritance:r', '/grant:r', `${user}:(OI)(CI)F`], { stdio: 'pipe', windowsHide: true })
  } else await chmod(directory, 0o700)
  const bytes = Buffer.from(JSON.stringify(snapshot, null, 2), 'utf8')
  const digest = hash(bytes)
  await writeFile(join(directory, 'snapshot.json'), bytes, { flag: 'wx', mode: 0o600 })
  await writeFile(join(directory, 'manifest.json'), JSON.stringify({ project_ref: closureBaseline.project, snapshot_sha256: digest, post_count: snapshot.posts.length, posts_fingerprint: snapshot.posts_fingerprint }), { flag: 'wx', mode: 0o600 })
  await verifyPrivateClosureBackup(directory)
  return { directory, snapshot_sha256: digest, post_count: snapshot.posts.length }
}

export async function verifyPrivateClosureBackup(directory) {
  const actual = await realpath(directory), root = await realpath(tmpdir()), repository = await realpath(process.cwd())
  if (!within(root, actual) || within(repository, actual) || !actual.split(sep).at(-1).startsWith('prart-closure-private-')) throw new Error('CLOSURE_PRIVATE_PATH_REQUIRED')
  const bytes = await readFile(join(actual, 'snapshot.json'))
  const manifest = JSON.parse(await readFile(join(actual, 'manifest.json'), 'utf8'))
  if (manifest.project_ref !== closureBaseline.project || manifest.snapshot_sha256 !== hash(bytes)) throw new Error('CLOSURE_BACKUP_CHECKSUM_FAILED')
  const snapshot = checkBackupIntegrity(JSON.parse(bytes.toString('utf8')))
  if (manifest.post_count !== snapshot.posts.length || manifest.posts_fingerprint !== snapshot.posts_fingerprint) throw new Error('CLOSURE_BACKUP_CHECKSUM_FAILED')
  return { directory: actual, snapshot, digest: hash(bytes) }
}

export async function verifyClosureAdministrator(input, fetchImpl = fetch) {
  const { key, token } = validateMaintenanceCredentials(input?.key, input?.token)
  const base = `https://${closureBaseline.project}.supabase.co`
  async function get(path) {
    let response
    try { response = await fetchImpl(base + path, { method: 'GET', headers: { apikey: key, Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(10000) }) }
    catch { throw new Error('CLOSURE_ADMIN_CONNECTION_FAILED') }
    if (!response.ok) throw new Error('CLOSURE_ADMIN_AUTH_FAILED')
    try { return await response.json() } catch { throw new Error('CLOSURE_ADMIN_AUTH_FAILED') }
  }
  const user = await get('/auth/v1/user')
  if (!uuid(user?.id) || user.is_anonymous || user.role !== 'authenticated') throw new Error('CLOSURE_ADMIN_AUTH_FAILED')
  const members = await get('/rest/v1/admin_users?select=user_id&user_id=eq.' + user.id)
  if (!Array.isArray(members) || !members.some(m => m.user_id === user.id)) throw new Error('CLOSURE_ADMIN_REQUIRED')
  return user.id
}

export async function prepareClosureSql({ backupDirectory, credentials }, fetchImpl = fetch) {
  // A backup is a prerequisite, not evidence that a caller-supplied actor is authentic.
  const backup = await verifyPrivateClosureBackup(backupDirectory)
  validateClosureSnapshot(backup.snapshot)
  if (Math.abs(Date.now() - Date.parse(backup.snapshot.observed_at)) > 300000) throw new Error('CLOSURE_BACKUP_STALE')
  const actor = await verifyClosureAdministrator(credentials, fetchImpl)
  const claims = JSON.parse(Buffer.from(credentials.token.trim().split('.')[1], 'base64url').toString('utf8'))
  const validUntil = new Date(Math.min(claims.exp * 1000, Date.now() + 120000)).toISOString()
  const template = await readFile(new URL('./archive-instagram-historical-attempt.sql', import.meta.url), 'utf8')
  const sql = template.replaceAll('__VERIFIED_ACTOR_UUID__', actor).replaceAll('__AUTH_VALID_UNTIL__', validUntil).replaceAll('__BACKUP_SHA256__', backup.digest)
    .replaceAll('__EXPECTED_TARGET_MD5__', closureBaseline.targetMd5).replaceAll('__EXPECTED_ALL_POSTS_MD5__', closureBaseline.allMd5)
  if (/__[A-Z_]+__/.test(sql)) throw new Error('CLOSURE_TEMPLATE_INVALID')
  await writeFile(join(backup.directory, 'approved-for-review.sql'), sql, { flag: 'wx', mode: 0o600 })
  await writeFile(join(backup.directory, 'preparation.json'), JSON.stringify({ actor_id: actor, auth_valid_until: validUntil, snapshot_sha256: backup.digest, sql_sha256: hash(sql) }), { flag: 'wx', mode: 0o600 })
  return { directory: backup.directory, sql_sha256: hash(sql), actor_id: actor, remote_sql_executed: false, drain_verified: false }
}

export function classifyClosureOutcome(before, after, actor, backupSha) {
  checkBackupIntegrity(before); checkBackupIntegrity(after)
  const same = isDeepStrictEqual
  if (before.posts.length !== after.posts.length || !same(before.runtime, after.runtime)
    || !same(before.readiness, after.readiness) || !same(before.migrations, after.migrations)
    || !same(before.safety, after.safety)) return 'inconsistent_stop'
  if (same(before.posts, after.posts) && same(before.events, after.events)) return 'not_applied'
  const original = before.posts.find(p => p.id === closureBaseline.post)
  const current = after.posts.find(p => p.id === closureBaseline.post)
  if (!original || !current || !same(before.posts.filter(p => p.id !== closureBaseline.post), after.posts.filter(p => p.id !== closureBaseline.post))) return 'inconsistent_stop'
  const a = JSON.parse(original.row_json), b = JSON.parse(current.row_json)
  if (a.status !== 'publishing' || b.status !== 'publish_failed' || b.error_code !== 'ADMIN_ARCHIVED_BEFORE_PUBLISH'
    || !(Date.parse(b.updated_at) > Date.parse(a.updated_at)) || before.events.length !== 0 || after.events.length !== 1) return 'inconsistent_stop'
  for (const key of ['status', 'error_code', 'updated_at']) { delete a[key]; delete b[key] }
  if (!same(a, b)) return 'inconsistent_stop'
  const event = after.events[0]
  if (event.actor_id !== actor || event.post_id !== closureBaseline.post || event.attempt_id !== closureBaseline.attempt
    || event.account_id !== '17841465479111585' || event.revision !== 1
    || event.operation !== 'admin_archive_before_publish' || event.digest !== a.publish_progress.digest
    || event.status_before !== 'publishing' || event.status_after !== 'publish_failed'
    || event.phase_before !== 'waiting' || event.phase_after !== 'waiting'
    || event.error_code !== 'ADMIN_ARCHIVED_BEFORE_PUBLISH' || event.trace_id !== 'backup-sha256:' + backupSha
    || !event.finished_at || ['method', 'endpoint', 'remote_id', 'http_status', 'meta_code', 'meta_subcode', 'container_status', 'resolution'].some(k => event[k] !== null)) return 'inconsistent_stop'
  return 'closed_verified'
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let input, bytes
  try {
    if (process.argv.length !== 3 || !['--backup', '--prepare', '--verify'].includes(process.argv[2])) throw new Error('CLOSURE_MODE_REQUIRED')
    const chunks = []; let size = 0
    for await (const chunk of process.stdin) { size += chunk.length; if (size > 16777216) throw new Error('CLOSURE_INPUT_TOO_LARGE'); chunks.push(chunk) }
    bytes = Buffer.concat(chunks); input = JSON.parse(bytes.toString('utf8'))
    let result
    if (process.argv[2] === '--verify') {
      const backup = await verifyPrivateClosureBackup(input.backupDirectory)
      validateClosureSnapshot(backup.snapshot)
      const preparation = JSON.parse(await readFile(join(backup.directory, 'preparation.json'), 'utf8'))
      if (!uuid(preparation.actor_id) || preparation.snapshot_sha256 !== backup.digest) throw new Error('CLOSURE_PREPARATION_INVALID')
      result = { outcome: classifyClosureOutcome(backup.snapshot, input.snapshot, preparation.actor_id, backup.digest), drain_verified: false, remote_sql_executed: false }
      if (result.outcome === 'inconsistent_stop') process.exitCode = 1
    } else result = process.argv[2] === '--backup' ? await savePrivateClosureBackup(input) : await prepareClosureSql(input)
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    console.log(JSON.stringify({ prepared: false, code: /^CLOSURE_[A-Z_]+$/.test(error.message || '') ? error.message : 'CLOSURE_PREPARATION_FAILED' }))
    process.exitCode = 1
  } finally {
    bytes?.fill(0)
    if (input?.credentials) { input.credentials.token = ''; input.credentials.key = '' }
    input = undefined
  }
}
