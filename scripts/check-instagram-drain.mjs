import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { maintenanceProjectRef } from './check-instagram-maintenance.mjs'

export async function checkInstagramDrain({ env = process.env, fetchImpl = fetch }) {
  if (!env.SUPABASE_ACCESS_TOKEN) throw new Error('Existing Management API session required; never use a Meta token')
  const source = await readFile(new URL('./check-instagram-drain.sql', import.meta.url), 'utf8')
  const statements = source.replace(/--[^\r\n]*/g, '').split(';').map(part => part.trim()).filter(Boolean)
  if (statements.shift() !== 'BEGIN READ ONLY' || statements.pop() !== 'ROLLBACK'
    || statements.length !== 2 || statements.some(sql => !/^SELECT\s/.test(sql))) throw new Error('Unexpected read-only inspection SQL')
  const query = `BEGIN READ ONLY; SELECT jsonb_build_object(
    'observation', (SELECT to_jsonb(q) FROM (${statements[0]}) q),
    'pending_attempts', (SELECT coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) FROM (${statements[1]}) q),
    'edge_drain_verified', false) AS drain; ROLLBACK;`
  // Dedicated read-only API: never use CLI db query, login-role or migrations.
  const response = await fetchImpl(`https://api.supabase.com/v1/projects/${maintenanceProjectRef}/database/query/read-only`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }), redirect: 'error', signal: AbortSignal.timeout(20000),
  })
  if (!response.ok) throw new Error(`Read-only inspection failed (HTTP ${response.status}); keep maintenance active`)
  const body = await response.json()
  if (!Array.isArray(body) || body[0]?.drain?.observation?.read_only !== 'on' || !Array.isArray(body[0].drain.pending_attempts)) throw new Error('Invalid read-only inspection response')
  return { project_ref: maintenanceProjectRef, ...body[0].drain, edge_drain_verified: false }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkInstagramDrain({}).then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(() => { console.error('Read-only inspection not verified; keep maintenance active and inspect access.'); process.exitCode = 1 })
}
