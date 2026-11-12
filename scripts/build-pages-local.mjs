import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export function publicBuildEnvironment(variables,current=process.env) {
  let anon=false
  try { const p=JSON.parse(Buffer.from(String(variables.VITE_SUPABASE_PUBLISHABLE_KEY).split('.')[1],'base64url').toString('utf8'));anon=p.role==='anon'&&p.ref==='blsezjyhiholzwmqewef' } catch { /* publishable keys are checked below */ }
  if(variables.VITE_SUPABASE_URL!=='https://blsezjyhiholzwmqewef.supabase.co'||(!/^sb_publishable_[A-Za-z0-9_-]+$/.test(variables.VITE_SUPABASE_PUBLISHABLE_KEY||'')&&!anon))throw new Error('PAGES_PUBLIC_BUILD_CONFIG_INVALID')
  const env={...current}
  for(const key of Object.keys(env))if(/^VITE_/.test(key)||/TOKEN|SECRET|PASSWORD|SERVICE_ROLE|PRIVATE_KEY|^NODE_(?:DEBUG|OPTIONS)$/.test(key))delete env[key]
  env.VITE_SUPABASE_URL=variables.VITE_SUPABASE_URL
  env.VITE_SUPABASE_PUBLISHABLE_KEY=variables.VITE_SUPABASE_PUBLISHABLE_KEY
  if(variables.VITE_WHATSAPP_NUMBER)env.VITE_WHATSAPP_NUMBER=variables.VITE_WHATSAPP_NUMBER
  return env
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    if(!process.env.GITHUB_PAGES_ACCESS_TOKEN)throw new Error('Missing existing session')
    const response=await fetch('https://api.github.com/repos/kanazuko/kanazuko.github.io/actions/variables',{headers:{Authorization:`Bearer ${process.env.GITHUB_PAGES_ACCESS_TOKEN}`,'User-Agent':'PRArtJewelry-local-build'},redirect:'error',signal:AbortSignal.timeout(15000)})
    if(!response.ok)throw new Error('Variables unavailable')
    const variables=Object.fromEntries((await response.json()).variables.map(v=>[v.name,v.value]))
    const env=publicBuildEnvironment(variables)
    const child=process.platform==='win32'?spawnSync('cmd.exe',['/d','/s','/c','npm run build'],{env,stdio:'inherit',windowsHide:true}):spawnSync('npm',['run','build'],{env,stdio:'inherit'})
    process.exitCode=child.status??1
  }catch{console.error('PAGES_CONFIGURED_LOCAL_BUILD_FAILED');process.exitCode=1}
}
