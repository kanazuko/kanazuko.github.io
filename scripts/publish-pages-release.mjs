import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { checkStage3State } from './check-instagram-stage3.mjs'
import { checkInstagramRelease } from './check-instagram-release.mjs'

const ref='blsezjyhiholzwmqewef', repository='kanazuko/kanazuko.github.io'
export async function preparePagesDispatch({sha,epoch,dispatch=false,env=process.env,fetchImpl=fetch,git=execFileSync}={}) {
  if(!/^[a-f0-9]{40}$/i.test(sha||'')||!/^[a-f0-9-]{36}$/i.test(epoch||'')||!env.GITHUB_PAGES_ACCESS_TOKEN||!env.SUPABASE_ACCESS_TOKEN)throw new Error('PAGES_INPUT_OR_SESSION_MISSING')
  const gitRead=args=>git('git',args,{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']})
  if(gitRead(['rev-parse','HEAD']).trim()!==sha||gitRead(['status','--porcelain']).trim())throw new Error('PAGES_LOCAL_SOURCE_CHANGED')
  const expectedWorkflow=gitRead(['show',`${sha}:.github/workflows/deploy-pages.yml`])
  // Do not dispatch the legacy workflow or an arbitrary commit lacking the gates.
  if(!expectedWorkflow.includes('frontend-maintenance')||!expectedWorkflow.includes('check-pages-release.mjs'))throw new Error('PAGES_WORKFLOW_NOT_PREPARED')
  const root=`https://api.github.com/repos/${repository}`
  async function gh(path) {
    const response=await fetchImpl(root+path,{headers:{Authorization:`Bearer ${env.GITHUB_PAGES_ACCESS_TOKEN}`,Accept:'application/vnd.github+json','User-Agent':'PRArtJewelry-controlled-release'},redirect:'error',signal:AbortSignal.timeout(20000)})
    if(!response.ok)throw new Error(`PAGES_GITHUB_HTTP_${response.status}`)
    return response.json()
  }
  if((await gh('/branches/main')).commit?.sha!==sha)throw new Error('PAGES_REMOTE_SHA_CHANGED')
  const remoteWorkflow=await gh(`/contents/.github/workflows/deploy-pages.yml?ref=${sha}`)
  if(Buffer.from(remoteWorkflow.content||'','base64').toString('utf8')!==expectedWorkflow)throw new Error('PAGES_REMOTE_WORKFLOW_CHANGED')
  for(const status of ['in_progress','queued'])if((await gh(`/actions/runs?status=${status}&per_page=100`)).total_count!==0)throw new Error('PAGES_OTHER_RUN_ACTIVE')
  const backend=await checkStage3State({token:env.SUPABASE_ACCESS_TOKEN,expectedEpoch:epoch,expectedReady:['instagram-publish','instagram-prepare','instagram-status'],fetchImpl})
  const metadata=await fetchImpl(`https://api.supabase.com/v1/projects/${ref}/functions`,{headers:{Authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`},redirect:'error',signal:AbortSignal.timeout(20000)})
  if(!metadata.ok)throw new Error(`PAGES_BACKEND_METADATA_HTTP_${metadata.status}`)
  const functions=await metadata.json()
  const expected={'instagram-publish':['4793ddd5-8860-434f-b7f3-0f413720e509',6],'instagram-prepare':['9424063a-13d4-4f77-87c3-9c327c55ae29',5],'instagram-status':['a52026d6-6615-41d3-b6d6-00088752c1cf',3]}
  if(functions.length!==3||!Object.entries(expected).every(([name,[id,version]])=>functions.some(f=>f.slug===name&&f.id===id&&f.version===version&&f.status==='ACTIVE'&&f.verify_jwt===true)))throw new Error('PAGES_BACKEND_CHANGED')
  const vars=await gh('/actions/variables')
  const variables=Object.fromEntries((vars.variables||[]).map(v=>[v.name,v.value]))
  await checkInstagramRelease({url:variables.VITE_SUPABASE_URL,key:variables.VITE_SUPABASE_PUBLISHABLE_KEY,stage:'frontend-maintenance',expectedEpoch:epoch,fetchImpl})
  if(!dispatch)return {repository,project_ref:ref,sha,epoch,verified:true,dispatched:false,drain_verified:false}
  // Exactly one explicit dispatch; never retry a timeout/unknown result.
  let response
  try {
    response=await fetchImpl(root+'/actions/workflows/deploy-pages.yml/dispatches',{method:'POST',headers:{Authorization:`Bearer ${env.GITHUB_PAGES_ACCESS_TOKEN}`,Accept:'application/vnd.github+json','Content-Type':'application/json','User-Agent':'PRArtJewelry-controlled-release'},body:JSON.stringify({ref:'main',inputs:{release_instagram:'true',expected_sha:sha,deployment_epoch:epoch}}),redirect:'error',signal:AbortSignal.timeout(20000)})
  }catch{throw new Error('PAGES_DISPATCH_RESULT_UNKNOWN_INSPECT_RUNS_NO_RETRY')}
  if(response.status!==204)throw new Error(`PAGES_DISPATCH_HTTP_${response.status}`)
  return {repository,project_ref:ref,sha,epoch,dispatch_accepted:true,deployment_verified:false,backend_schema:backend.runtime.schema_version,drain_verified:false}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const args=process.argv.slice(2)
    if(args.some(x=>x!=='--dispatch'&&!/^--(?:sha|epoch)=/.test(x)))throw new Error('PAGES_INPUT_OR_SESSION_MISSING')
    const result=await preparePagesDispatch({sha:args.find(x=>x.startsWith('--sha='))?.slice(6),epoch:args.find(x=>x.startsWith('--epoch='))?.slice(8),dispatch:args.includes('--dispatch')})
    console.log(JSON.stringify(result,null,2))
  }catch(error){console.log(JSON.stringify({verified:false,code:/^PAGES_[A-Z0-9_]+$/.test(error.message||'')?error.message:'PAGES_PUBLICATION_FAILED',drain_verified:false}));process.exitCode=1}
}
