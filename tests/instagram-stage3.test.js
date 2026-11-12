import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { verifyStage3Session } from '../scripts/verify-instagram-stage3-input.mjs'
import { safeMaintenanceDiagnostic } from '../scripts/check-instagram-maintenance.mjs'
import { publicTestKey, sessionJwt } from './helpers/instagram-session.js'
import { checkStage3State } from '../scripts/check-instagram-stage3.mjs'

const epoch = '3cd91507-439a-4a97-85bc-1dac9d218856'
const runtime = { schema_version: 2, maintenance: true, frontend_ready: false, deployment_epoch: epoch }
const input = () => ({ key: publicTestKey, token: sessionJwt() })
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

test('stage 3 verifies one selected function, fixed project and epoch with health + safe probe only', async () => {
  for (const name of ['instagram-publish','instagram-prepare','instagram-status']) {
    const calls = [], credentials = input()
    const result = await verifyStage3Session(credentials,name,epoch,async (url, options) => {
      const parsed = new URL(url)
      calls.push(parsed.pathname + parsed.search)
      assert.equal(parsed.origin, 'https://blsezjyhiholzwmqewef.supabase.co')
      assert.equal(options.redirect, 'error')
      assert.equal(options.headers.apikey, credentials.key)
      if (parsed.pathname.startsWith('/rest/')) {
        assert.equal(options.method,'GET'); assert.equal(options.headers.Authorization,undefined)
        return json(runtime)
      }
      assert.equal(options.method,'POST'); assert.equal(options.body,'{}')
      assert.equal(options.headers.Authorization,`Bearer ${credentials.token}`)
      if (parsed.search === '?action=health') return json({ function_name:name,backend_version:2,runtime })
      assert.equal(parsed.search,'?action=maintenance-probe')
      return json({error:{code:'INSTAGRAM_MAINTENANCE'}},423)
    })
    assert.equal(calls.length,4)
    assert.equal(result.function_name,name); assert.equal(result.stage3_verified,true)
    assert.equal(result.drain_verified,false)
    assert.equal(JSON.stringify(result).includes(credentials.token),false)
  }
})

test('frontend readiness, maintenance, schema and epoch mismatches stop before any health write', async () => {
  for (const patch of [{frontend_ready:true},{maintenance:false},{schema_version:1},{deployment_epoch:'00000000-0000-0000-0000-000000000000'}]) {
    let calls = 0
    await assert.rejects(verifyStage3Session(input(),'instagram-status',epoch,async url => {
      calls++; assert.equal(new URL(url).pathname,'/rest/v1/rpc/instagram_runtime_status')
      return json({...runtime,...patch})
    }))
    assert.equal(calls,1)
  }
})

test('failed health or mismatched attestation stops without a probe, retries or secrets in errors', async () => {
  for (const response of [() => json({private:'do not forward'},401), () => json({function_name:'other',backend_version:2,runtime})]) {
    let calls = 0
    await assert.rejects(verifyStage3Session(input(),'instagram-publish',epoch,async () => {
      calls++; return calls === 1 ? json(runtime) : response()
    }), error => {
      const safe = safeMaintenanceDiagnostic(error)
      assert.ok(['HTTP_UNAUTHORIZED','RESPONSE_CODE_MISMATCH'].includes(safe.code))
      assert.equal(JSON.stringify(safe).includes('do not forward'),false)
      return true
    })
    assert.equal(calls,2)
  }
})

test('stage 3 stdin worker rejects expired dummy credentials before networking', () => {
  const token = sessionJwt({exp:1})
  const child = spawnSync(process.execPath,['scripts/verify-instagram-stage3-input.mjs','instagram-publish',epoch],{input:JSON.stringify({key:publicTestKey,token}),encoding:'utf8'})
  assert.equal(child.status,1)
  assert.equal(JSON.parse(child.stdout).diagnostic.code,'SESSION_EXPIRED')
  assert.equal((child.stdout+child.stderr).includes(token),false)
})

test('stage 3 private window accepts only named functions/epoch, uses stdin and no deployment or persistence', async () => {
  const config = await readFile(new URL('../supabase/config.toml',import.meta.url),'utf8')
  for (const name of ['instagram-publish','instagram-prepare','instagram-status']) {
    const block = config.split(`[functions.${name}]`)[1]?.split(/\r?\n\[/)[0]
    assert.match(block || '',/verify_jwt\s*=\s*true/)
  }
  const source = await readFile(new URL('../scripts/verify-instagram-stage3-local.ps1',import.meta.url),'utf8')
  assert.match(source,/ValidateSet\('instagram-publish','instagram-prepare','instagram-status'\)/)
  assert.match(source,/StandardInput\.Write\(\$payload\)/)
  assert.match(source,/verify-instagram-stage3-input\.mjs/)
  assert.doesNotMatch(source,/Set-Content|WriteAllText|SetEnvironmentVariable|Get-Clipboard|functions deploy|\$env:\w+\s*=/i)
  if (process.platform === 'win32') {
    const script = "$errors=$null;[System.Management.Automation.Language.Parser]::ParseFile((Join-Path (Get-Location) 'scripts/verify-instagram-stage3-local.ps1'),[ref]$null,[ref]$errors)|Out-Null;if($errors.Count){exit 1}"
    assert.equal(spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8'}).status,0)
  }
})

test('stage 3 SQL snapshot requires exact readiness and unchanged historical fingerprint', async () => {
  const snapshot={read_only:'on',runtime,readiness:[],posts:{count:18,fingerprint:'44eec1f11b52979b908bbe88478b50cd'},audit_counts:{events:0,safety:0},migrations:[...Array.from({length:8},(_,i)=>String(i)),'20261107010000','20261107020000']}
  const fetchImpl=async (url,options)=>{
    assert.equal(url,'https://api.supabase.com/v1/projects/blsezjyhiholzwmqewef/database/query/read-only')
    const sql=JSON.parse(options.body).query
    assert.match(sql,/BEGIN READ ONLY;/);assert.match(sql,/ROLLBACK;/)
    assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE)\b/i)
    return Response.json([{stage3:snapshot}])
  }
  assert.equal((await checkStage3State({token:'fake',expectedEpoch:epoch,fetchImpl})).verified,true)
  snapshot.readiness=[{function_name:'instagram-publish',schema_version:2,deployment_epoch:epoch}]
  await assert.rejects(checkStage3State({token:'fake',expectedEpoch:epoch,fetchImpl}),/READINESS_MISMATCH/)
  assert.equal((await checkStage3State({token:'fake',expectedEpoch:epoch,expectedReady:['instagram-publish'],fetchImpl})).verified,true)
  snapshot.posts.fingerprint='changed'
  await assert.rejects(checkStage3State({token:'fake',expectedEpoch:epoch,expectedReady:['instagram-publish'],fetchImpl}),/HISTORY_CHANGED/)
})

test('PowerShell metadata validation enumerates the JSON array before checking count', async () => {
  const plan = await readFile(new URL('../docs/instagram-stage3-plan.md',import.meta.url),'utf8')
  assert.match(plan,/\$parsed = \$raw \| ConvertFrom-Json\s+\$rows = @\(\$parsed\)/)
  if (process.platform === 'win32') {
    const script = "$raw='[{\"slug\":\"instagram-publish\"},{\"slug\":\"instagram-prepare\"},{\"slug\":\"instagram-status\"}]';$parsed=$raw|ConvertFrom-Json;$rows=@($parsed);if($rows.Count -ne 3){exit 1};if(@($rows|Where-Object{$_.slug -eq 'instagram-publish'}).Count -ne 1){exit 2}"
    const child=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8'})
    assert.equal(child.status,0,child.stderr)
  }
})
