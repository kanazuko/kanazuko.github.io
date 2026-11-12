import { pathToFileURL } from 'node:url'

export async function checkInstagramRelease({ url, key, stage = 'functions', expectedEpoch, fetchImpl = fetch }) {
  const origin = new URL(url)
  if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.username || origin.password || origin.search || origin.hash) throw new Error('Invalid Supabase origin')
  if (!key) throw new Error('Missing Supabase publishable key')
  if (!['functions', 'frontend', 'frontend-maintenance'].includes(stage)) throw new Error('Invalid release stage')
  if (stage === 'frontend-maintenance' && (origin.origin !== 'https://blsezjyhiholzwmqewef.supabase.co' || !/^[a-f0-9-]{36}$/i.test(expectedEpoch || ''))) throw new Error('Maintenance release requires the exact project and deployment epoch')
  const response = await fetchImpl(new URL('/rest/v1/rpc/instagram_runtime_status', origin), {
    method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: '{}',
    redirect: 'error', signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new Error('Instagram schema preflight failed; deployment blocked')
  const state = await response.json()
  if (state?.schema_version !== 2 || state.maintenance !== true) throw new Error('Instagram requires schema v2 and maintenance; deployment blocked')
  if (stage === 'frontend' && state.frontend_ready !== true) throw new Error('All three backends must be verified for this release; deployment blocked')
  if (stage === 'frontend-maintenance' && (state.frontend_ready !== false || state.deployment_epoch !== expectedEpoch)) throw new Error('Maintenance release state or epoch changed; deployment blocked')
  return state
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const stage = process.argv[2] || 'functions'
  try {
    const state = await checkInstagramRelease({ url: process.env.VITE_SUPABASE_URL, key: process.env.VITE_SUPABASE_PUBLISHABLE_KEY, expectedEpoch: process.env.EXPECTED_DEPLOYMENT_EPOCH, stage })
    console.log(`Instagram ${stage} preflight passed: schema ${state.schema_version}, maintenance active.`)
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
