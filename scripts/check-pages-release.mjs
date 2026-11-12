import { pathToFileURL } from 'node:url'

export function checkPagesRelease(env = process.env) {
  if (!['push', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME) || env.GITHUB_REF !== 'refs/heads/main'
    || !/^[a-f0-9]{40}$/i.test(env.EXPECTED_RELEASE_SHA || '') || env.EXPECTED_RELEASE_SHA !== env.GITHUB_SHA
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(env.EXPECTED_DEPLOYMENT_EPOCH || '')) throw new Error('PAGES_RELEASE_INPUT_MISMATCH')
  return true
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { checkPagesRelease(); console.log('Exact Pages release SHA, branch and epoch inputs verified.') }
  catch { console.error('PAGES_RELEASE_INPUT_MISMATCH');process.exitCode=1 }
}
