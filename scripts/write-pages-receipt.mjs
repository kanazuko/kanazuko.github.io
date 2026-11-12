import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checkPagesRelease } from './check-pages-release.mjs'

export async function writePagesReceipt(env=process.env,outDir='dist') {
  checkPagesRelease(env)
  const receipt={sha:env.GITHUB_SHA,deployment_epoch:env.EXPECTED_DEPLOYMENT_EPOCH,maintenance_expected:true}
  await writeFile(join(outDir,'release.json'),JSON.stringify(receipt,null,2)+'\n','utf8')
  return receipt
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{await writePagesReceipt();console.log('Public release receipt written without credentials.')}
  catch{console.error('PAGES_RECEIPT_FAILED');process.exitCode=1}
}
