import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { checkInstagramRelease } from './check-instagram-release.mjs'

export async function deployInstagramFunctions({ env = process.env, projectRef, execute = false, fetchImpl = fetch, runCommand }) {
  if (!/^[a-z0-9]{20}$/.test(projectRef || '')) throw new Error('Specify the exact Supabase project reference')
  if (new URL(env.VITE_SUPABASE_URL).hostname !== `${projectRef}.supabase.co`) throw new Error('Project reference does not match Supabase URL')
  const check = () => checkInstagramRelease({ url: env.VITE_SUPABASE_URL, key: env.VITE_SUPABASE_PUBLISHABLE_KEY, fetchImpl })
  await check()
  if (!execute) return
  if (!runCommand) throw new Error('Missing deployment runner')
  for (const name of ['instagram-status', 'instagram-prepare', 'instagram-publish']) {
    await check() // Do not rely on the first check if state changes during rollout.
    await runCommand('supabase', ['functions', 'deploy', name, '--project-ref', projectRef, '--use-api'])
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const projectRef = process.argv.find(value => value.startsWith('--project-ref='))?.split('=')[1]
  const runCommand = (command, args) => new Promise((resolve, reject) => {
    // The Supabase native executable must be on PATH. No shell or credentials in args.
    const child = spawn(command, args, { stdio: 'inherit', shell: false, windowsHide: true })
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error('Function deployment failed; maintenance must remain active')))
  })
  deployInstagramFunctions({ projectRef, execute: process.argv.includes('--deploy'), runCommand })
    .catch(error => { console.error(error.message); process.exitCode = 1 })
}
