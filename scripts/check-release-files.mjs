import { execFileSync } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'

export function credentialFindings(source, file = '', artifact = false) {
  const findings = []
  const patterns = [
    ['supabase_secret', /sb_secret_[A-Za-z0-9_-]{20,}/g],
    ['management_token', /sbp_[a-f0-9]{30,}/gi],
    ['github_token', /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/g],
    ['meta_token', /EAA[A-Za-z0-9]{60,}/g],
    ['private_key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
    ['aws_access_key', /(?:AKIA|ASIA)[A-Z0-9]{16}/g],
    ['database_password', /postgres(?:ql)?:\/\/[^\s:'"/]+:[^\s@'"<>]+@/gi],
  ]
  // Public browser keys belong in CI variables, not committed source literals.
  if (!artifact) patterns.push(['public_key_literal', /sb_publishable_[A-Za-z0-9_-]{30,}/g])
  for (const [kind, pattern] of patterns) for (const match of source.matchAll(pattern)) {
    findings.push({ file, line: source.slice(0,match.index).split('\n').length, kind })
  }
  for (const match of source.matchAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
    try {
      const payload = JSON.parse(Buffer.from(match[0].split('.')[1],'base64url').toString('utf8'))
      const role = payload?.role
      if (['authenticated','service_role'].includes(role) || (!artifact && role === 'anon')) findings.push({ file,line:source.slice(0,match.index).split('\n').length,kind:'jwt_literal' })
    } catch { /* Not a decodable JWT literal. Never print its value. */ }
  }
  return findings
}

export function sensitivePath(file) {
  const path = file.replaceAll('\\','/')
  const example = /(?:^|\/)\.env(?:\.[^/]+)?\.example$/.test(path)
  return /(?:^|\/)(?:\.temp|\.auth|private-evidence|backups?)(?:\/|$)/i.test(path)
    || (!example && /(?:^|\/)\.env(?:\.[^/]+)?$/.test(path))
    || /\.(?:pem|key|p12|pfx|keystore|dump|backup|bak|har|zip|7z|rar|tar|tgz|gz)$/i.test(path)
    || /(?:^|\/)(?:\.npmrc|\.pypirc|id_rsa|id_ed25519)$/.test(path)
}

export async function auditReleaseFiles({ artifact = false, staged = false } = {}) {
  if (artifact && staged) throw new Error('Conflicting audit modes')
  let files
  if (artifact) {
    const walk = async dir => (await Promise.all((await readdir(dir,{withFileTypes:true})).map(e=>e.isDirectory()?walk(join(dir,e.name)):join(dir,e.name)))).flat()
    files = await walk('dist')
  } else {
    files = [...new Set(execFileSync('git',['ls-files','--cached',...(staged?[]:['--others','--exclude-standard']),'-z'],{encoding:'utf8',windowsHide:true}).split('\0').filter(Boolean))]
  }
  const findings = []
  for (const file of files) {
    if (sensitivePath(file)) findings.push({file,kind:'sensitive_path'})
    let bytes
    try { bytes = staged ? execFileSync('git',['show',`:${file}`],{windowsHide:true,maxBuffer:20000000,stdio:['ignore','pipe','pipe']}) : await readFile(file) } catch (error) { if (!staged && error.code==='ENOENT') continue; throw error }
    if (!bytes.includes(0)) findings.push(...credentialFindings(bytes.toString('utf8'),file,artifact))
  }
  return { mode:artifact?'build':staged?'git_index':'git_candidates',scanned_files:files.length,passed:findings.length===0,findings }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result=await auditReleaseFiles({artifact:process.argv.includes('--dist'),staged:process.argv.includes('--staged')})
    console.log(JSON.stringify(result,null,2))
    if (!result.passed) process.exitCode=1
  } catch { console.log(JSON.stringify({passed:false,code:'RELEASE_AUDIT_FAILED'}));process.exitCode=1 }
}
