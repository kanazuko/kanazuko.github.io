import { pathToFileURL } from 'node:url'
import { checkInstagramRelease } from './check-instagram-release.mjs'

export async function checkInstagramBackends({ env = process.env, fetchImpl = fetch }) {
  await checkInstagramRelease({ url: env.VITE_SUPABASE_URL, key: env.VITE_SUPABASE_PUBLISHABLE_KEY, fetchImpl })
  if (!env.SUPABASE_ADMIN_ACCESS_TOKEN) throw new Error('An existing authenticated administrator session is required')
  for (const name of ['instagram-status', 'instagram-prepare', 'instagram-publish']) {
    const response = await fetchImpl(new URL(`/functions/v1/${name}?action=health`, env.VITE_SUPABASE_URL), {
      method: 'POST', headers: { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${env.SUPABASE_ADMIN_ACCESS_TOKEN}` },
      redirect: 'error', signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) throw new Error(`Backend health failed: ${name}`)
    const result = await response.json()
    if (result.function_name !== name || result.backend_version !== 2 || result.runtime?.schema_version !== 2 || result.runtime?.maintenance !== true) throw new Error(`Backend incompatible: ${name}`)
  }
  // Attestation only. An administrator must separately approve frontend readiness.
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkInstagramBackends({}).then(() => console.log('All three Instagram backends verified in maintenance; no Meta calls.'))
    .catch(() => { console.error('Backend verification failed; keep maintenance active.'); process.exitCode = 1 })
}
