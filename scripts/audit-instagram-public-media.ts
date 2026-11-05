// Input contains only a project reference and public paths/hashes, never API keys.
// Reads remote public media only; does not call Meta or modify Storage.
import jpeg from 'npm:jpeg-js@0.4.4'
import { limitedBytes } from '../supabase/functions/_shared/instagram.ts'

const input = JSON.parse(await Deno.readTextFile(Deno.args[0]))
if (!/^[a-z]{20}$/.test(input.project_ref) || !Array.isArray(input.images) || input.images.length > 20) throw new Error('Invalid audit input')
const results = []
for (const [index, image] of input.images.entries()) {
  if (!/^[a-f0-9-]{36}\/[1-9][0-9]*\/[a-f0-9-]{36}\.jpg$/.test(image.path) || !/^[a-f0-9]{64}$/.test(image.sha256)) throw new Error('Invalid public manifest')
  const url = new URL(`https://${input.project_ref}.supabase.co/storage/v1/object/public/instagram-prepared/${image.path}`)
  const response = await fetch(url, { redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(15000) })
  if (!response.ok || response.headers.get('content-type')?.split(';')[0] !== 'image/jpeg') throw new Error(`Public JPEG ${index + 1} unavailable`)
  const bytes = await limitedBytes(response, 8388608)
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource)), (value) => value.toString(16).padStart(2, '0')).join('')
  if (hash !== image.sha256) throw new Error(`JPEG ${index + 1} differs from stored hash`)
  const decoded = jpeg.decode(bytes, { useTArray: true, tolerantDecoding: false, maxResolutionInMP: 2, maxMemoryUsageInMB: 32 })
  if (decoded.width !== 1080 || decoded.height !== 1080) throw new Error(`JPEG ${index + 1} has unexpected dimensions`)
  results.push({ image: index + 1, http_status: response.status, https: true, authenticated: false, signed_url: false, bytes: bytes.length, width: decoded.width, height: decoded.height, sha256_matches: true })
}
console.log(JSON.stringify({ checked_at: new Date().toISOString(), results }, null, 2))
