import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { projectRef } from './check-instagram-schema-detail.mjs'

const names = ['instagram-publish','instagram-prepare','instagram-status']
export async function checkStage3State({ token = process.env.SUPABASE_ACCESS_TOKEN, expectedEpoch, expectedReady = [], fetchImpl = fetch } = {}) {
  if (!token || !/^[a-f0-9-]{36}$/i.test(expectedEpoch || '') || !Array.isArray(expectedReady) || new Set(expectedReady).size !== expectedReady.length || expectedReady.some(n => !names.includes(n))) throw new Error('STAGE3_INPUT_INVALID')
  const query = await readFile(new URL('./check-instagram-stage3.sql',import.meta.url),'utf8')
  const response = await fetchImpl(`https://api.supabase.com/v1/projects/${projectRef}/database/query/read-only`, {
    method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query}),redirect:'error',signal:AbortSignal.timeout(20000),
  })
  if (!response.ok) throw new Error(`STAGE3_READ_ONLY_HTTP_${response.status}`)
  const state = (await response.json())?.[0]?.stage3
  if (state?.read_only !== 'on' || state.runtime?.schema_version !== 2 || state.runtime.maintenance !== true || state.runtime.frontend_ready !== false || state.runtime.deployment_epoch !== expectedEpoch) throw new Error('STAGE3_RUNTIME_CHANGED')
  const readiness = state.readiness
  if (!Array.isArray(readiness) || JSON.stringify(readiness.map(x=>x.function_name).sort()) !== JSON.stringify([...expectedReady].sort()) || readiness.some(r=>r.schema_version!==2||r.deployment_epoch!==expectedEpoch)) throw new Error('STAGE3_READINESS_MISMATCH')
  // This deployment is specifically bound to the previously reviewed snapshot.
  if (state.posts?.count !== 18 || state.posts.fingerprint !== '44eec1f11b52979b908bbe88478b50cd' || state.audit_counts?.events !== 0 || state.audit_counts.safety !== 0) throw new Error('STAGE3_HISTORY_CHANGED')
  if (!Array.isArray(state.migrations) || state.migrations.length !== 10 || !state.migrations.includes('20261107010000') || !state.migrations.includes('20261107020000')) throw new Error('STAGE3_MIGRATIONS_CHANGED')
  return { project_ref:projectRef, verified:true, ...state, drain_verified:false }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2)
    if (args.some(x=>!/^--(?:epoch|ready)=/.test(x))) throw new Error('STAGE3_INPUT_INVALID')
    const expectedEpoch = args.find(x=>x.startsWith('--epoch='))?.slice(8)
    const ready = args.find(x=>x.startsWith('--ready='))?.slice(8)
    if (!ready) throw new Error('STAGE3_INPUT_INVALID')
    const result = await checkStage3State({expectedEpoch,expectedReady:ready==='none'?[]:ready.split(',')})
    console.log(JSON.stringify(result,null,2))
  } catch (error) {
    const code = /^STAGE3_(?:INPUT_INVALID|RUNTIME_CHANGED|READINESS_MISMATCH|HISTORY_CHANGED|MIGRATIONS_CHANGED|READ_ONLY_HTTP_[1-5][0-9]{2})$/.test(error.message || '') ? error.message : 'STAGE3_VERIFICATION_FAILED'
    console.log(JSON.stringify({project_ref:projectRef,verified:false,code,drain_verified:false}))
    process.exitCode=1
  }
}
