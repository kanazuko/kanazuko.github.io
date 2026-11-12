import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { credentialFindings, sensitivePath } from '../scripts/check-release-files.mjs'
import { checkPagesRelease } from '../scripts/check-pages-release.mjs'
import { checkInstagramRelease } from '../scripts/check-instagram-release.mjs'
import { preparePagesDispatch } from '../scripts/publish-pages-release.mjs'
import { writePagesReceipt } from '../scripts/write-pages-receipt.mjs'
import { publicBuildEnvironment } from '../scripts/build-pages-local.mjs'

const epoch='3cd91507-439a-4a97-85bc-1dac9d218856'
test('maintenance frontend release requires exact project/epoch, keeps frontend_ready false',async()=>{
  let state={schema_version:2,maintenance:true,frontend_ready:false,deployment_epoch:epoch}
  const options={url:'https://blsezjyhiholzwmqewef.supabase.co',key:'public-test-key',stage:'frontend-maintenance',expectedEpoch:epoch,fetchImpl:async()=>Response.json(state)}
  assert.deepEqual(await checkInstagramRelease(options),state)
  for(const patch of [{frontend_ready:true},{maintenance:false},{schema_version:1},{deployment_epoch:'other'}]){
    const original=state;state={...state,...patch};await assert.rejects(checkInstagramRelease(options));state=original
  }
  await assert.rejects(checkInstagramRelease({...options,url:'https://other.supabase.co'}))
})

test('Pages push and dispatch require exact SHA/main and maintenance epoch',()=>{
  const env={GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',GITHUB_SHA:'a'.repeat(40),EXPECTED_RELEASE_SHA:'a'.repeat(40),EXPECTED_DEPLOYMENT_EPOCH:epoch}
  assert.equal(checkPagesRelease(env),true)
  assert.equal(checkPagesRelease({...env,GITHUB_EVENT_NAME:'push'}),true)
  for(const patch of [{GITHUB_EVENT_NAME:'pull_request'},{GITHUB_REF:'refs/heads/other'},{EXPECTED_RELEASE_SHA:'b'.repeat(40)},{EXPECTED_DEPLOYMENT_EPOCH:''}])assert.throws(()=>checkPagesRelease({...env,...patch}))
})

test('artifact receipt records exact SHA/epoch for push and dispatch',async()=>{
  const env={GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',GITHUB_SHA:'a'.repeat(40),EXPECTED_RELEASE_SHA:'a'.repeat(40),EXPECTED_DEPLOYMENT_EPOCH:epoch}
  const dir=await mkdtemp(join(tmpdir(),'prart-pages-receipt-test-'))
  await writePagesReceipt(env,dir)
  assert.deepEqual(JSON.parse(await readFile(join(dir,'release.json'),'utf8')),{sha:env.GITHUB_SHA,deployment_epoch:epoch,maintenance_expected:true})
  await writePagesReceipt({...env,GITHUB_EVENT_NAME:'push'},dir)
  assert.equal(JSON.parse(await readFile(join(dir,'release.json'),'utf8')).sha,env.GITHUB_SHA)
  await assert.rejects(writePagesReceipt({...env,GITHUB_EVENT_NAME:'pull_request'},dir))
})

test('configured build inherits only the selected public Vite values, not private credentials',()=>{
  const env=publicBuildEnvironment({VITE_SUPABASE_URL:'https://blsezjyhiholzwmqewef.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fake'},{PATH:'safe-path',GITHUB_PAGES_ACCESS_TOKEN:'private',SUPABASE_SERVICE_ROLE_KEY:'private',INSTAGRAM_ACCESS_TOKEN:'private',VITE_UNREVIEWED:'private',VITE_WHATSAPP_NUMBER:'old-value'})
  assert.deepEqual(Object.keys(env).sort(),['PATH','VITE_SUPABASE_PUBLISHABLE_KEY','VITE_SUPABASE_URL'])
  assert.throws(()=>publicBuildEnvironment({VITE_SUPABASE_URL:'https://other.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fake'}))
})

test('release audit reports locations/kinds, never secret values; rejects private paths',()=>{
  const credential='sb_'+'secret_'+'x'.repeat(40)
  const findings=credentialFindings('key='+credential,'example.js')
  assert.equal(findings.length,1);assert.equal(findings[0].kind,'supabase_secret')
  assert.equal(JSON.stringify(findings).includes(credential),false)
  for(const path of ['.env','scripts/bridge/supabase/.temp/linked-project.json','evidence.har','private-evidence/run.json'])assert.equal(sensitivePath(path),true)
  assert.equal(sensitivePath('.env.example'),false)
  assert.equal(sensitivePath('supabase/migrations/example.sql'),false)
})

test('workflow permits main push and opted-in dispatch with SHA/epoch checks',async()=>{
  const workflow=(await readFile(new URL('../.github/workflows/deploy-pages.yml',import.meta.url),'utf8')).replaceAll('\r\n','\n')
  const gate = "if: github.ref == 'refs/heads/main' && (github.event_name == 'push' || (github.event_name == 'workflow_dispatch' && inputs.release_instagram))"
  assert.ok(workflow.includes('deploy:\n    ' + gate))
  assert.ok(workflow.includes('Upload site artifact\n        ' + gate))
  assert.ok(workflow.includes("github.event_name == 'push' && github.sha || inputs.expected_sha"))
  assert.ok(workflow.includes("github.event_name == 'push' && env.PAGES_MAINTENANCE_EPOCH || inputs.deployment_epoch"))
  assert.match(workflow,/group: pages-main/)
  assert.equal((workflow.match(/run: node scripts\/check-pages-release.mjs/g)||[]).length,2)
  assert.equal((workflow.match(/run: node scripts\/check-instagram-release.mjs frontend-maintenance/g)||[]).length,2)
  assert.doesNotMatch(workflow,/set_instagram_maintenance|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ADMIN_ACCESS_TOKEN/)
})

test('publication tool never contacts GitHub if the local commit differs or has uncommitted files',async()=>{
  for(const dirty of [false,true]){
    await assert.rejects(preparePagesDispatch({sha:'a'.repeat(40),epoch,dispatch:true,env:{GITHUB_PAGES_ACCESS_TOKEN:'fake',SUPABASE_ACCESS_TOKEN:'fake'},git:(_cmd,args)=>args[0]==='rev-parse'?(dirty?'a':'b').repeat(40):' M changed',fetchImpl:()=>assert.fail('No request allowed')}),/LOCAL_SOURCE_CHANGED/)
  }
})

test('publication tool refuses remote SHA mismatch without dispatching or modifying any backend',async()=>{
  let calls=0
  await assert.rejects(preparePagesDispatch({sha:'a'.repeat(40),epoch,dispatch:true,env:{GITHUB_PAGES_ACCESS_TOKEN:'fake',SUPABASE_ACCESS_TOKEN:'fake'},git:(_cmd,args)=>args[0]==='rev-parse'?'a'.repeat(40):args[0]==='status'?'':'frontend-maintenance check-pages-release.mjs',fetchImpl:async(url,options)=>{calls++;assert.equal(options.method,undefined);assert.ok(url.endsWith('/branches/main'));return Response.json({commit:{sha:'b'.repeat(40)}})}}),/REMOTE_SHA_CHANGED/)
  assert.equal(calls,1)
})

test('publication tool is read-only by default and dispatches once only after all independent guards pass',async()=>{
  const sha='a'.repeat(40),workflow='frontend-maintenance check-pages-release.mjs'
  const runtime={schema_version:2,maintenance:true,frontend_ready:false,deployment_epoch:epoch}
  const ids={'instagram-publish':['4793ddd5-8860-434f-b7f3-0f413720e509',6],'instagram-prepare':['9424063a-13d4-4f77-87c3-9c327c55ae29',5],'instagram-status':['a52026d6-6615-41d3-b6d6-00088752c1cf',3]}
  const snapshot={read_only:'on',runtime,readiness:Object.keys(ids).map(function_name=>({function_name,schema_version:2,deployment_epoch:epoch})),posts:{count:18,fingerprint:'44eec1f11b52979b908bbe88478b50cd'},audit_counts:{events:0,safety:0},migrations:[...Array.from({length:8},(_,i)=>String(i)),'20261107010000','20261107020000']}
  for(const mode of ['dry','dispatch','unknown']){
    let dispatches=0
    const fetchImpl=async(url,options)=>{
      const p=new URL(url).pathname
      if(p.endsWith('/branches/main'))return Response.json({commit:{sha}})
      if(p.includes('/contents/'))return Response.json({content:Buffer.from(workflow).toString('base64')})
      if(p.endsWith('/actions/runs'))return Response.json({total_count:0})
      if(p.endsWith('/actions/variables'))return Response.json({variables:[{name:'VITE_SUPABASE_URL',value:'https://blsezjyhiholzwmqewef.supabase.co'},{name:'VITE_SUPABASE_PUBLISHABLE_KEY',value:'public-test-key'}]})
      if(p.endsWith('/database/query/read-only'))return Response.json([{stage3:snapshot}])
      if(p.endsWith('/functions'))return Response.json(Object.entries(ids).map(([slug,[id,version]])=>({slug,id,version,status:'ACTIVE',verify_jwt:true})))
      if(p.endsWith('/rpc/instagram_runtime_status')){assert.equal(options.headers.Authorization,undefined);return Response.json(runtime)}
      assert.ok(p.endsWith('/dispatches'));assert.equal(options.method,'POST');dispatches++
      assert.deepEqual(JSON.parse(options.body).inputs,{release_instagram:'true',expected_sha:sha,deployment_epoch:epoch})
      if(mode==='unknown')throw new Error('private-network-context')
      return new Response(null,{status:204})
    }
    const options={sha,epoch,dispatch:mode!=='dry',env:{GITHUB_PAGES_ACCESS_TOKEN:'fake',SUPABASE_ACCESS_TOKEN:'fake'},git:(_cmd,args)=>args[0]==='rev-parse'?sha:args[0]==='status'?'':workflow,fetchImpl}
    if(mode==='unknown')await assert.rejects(preparePagesDispatch(options),/RESULT_UNKNOWN_INSPECT_RUNS_NO_RETRY/)
    else assert.equal((await preparePagesDispatch(options))[mode==='dry'?'dispatched':'dispatch_accepted'],mode!=='dry')
    assert.equal(dispatches,mode==='dry'?0:1)
  }
})
