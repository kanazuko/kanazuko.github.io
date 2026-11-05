import { authenticate, cors, database, json, limitedBytes, SafeError, safeFailure, uuid } from '../_shared/instagram.ts'
import { advancePublication, confirmationDigest } from './engine.ts'

type PublicationPolicy = { account_id: string; id?: string; revision?: number }
export function createPublishHandler(policy: PublicationPolicy | null = null) {
  return async (request: Request) => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (request.method !== 'POST') return json({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405)
    try {
      await authenticate(request)
      const url = new URL(request.url)
      const action = url.searchParams.get('action')
      // Only server configuration grants access; every operation still requires admin Auth.
      if (action !== 'review' && !policy) return json({ error: { code: 'PUBLISHING_DISABLED' } }, 423)
      const id = url.searchParams.get('id')
      const revision = Number(url.searchParams.get('revision'))
      if (!uuid(id) || !Number.isSafeInteger(revision) || revision < 1) throw new SafeError('INVALID_REQUEST')
      const [post] = await database(`instagram_posts?id=eq.${id}&select=*`)
      if (!post || post.revision !== revision) throw new SafeError('DRAFT_CONFLICT', 409)
      const enabled = policy !== null && policy.account_id === post.instagram_account_id
        && (policy.id === undefined || policy.id === id)
        && (policy.revision === undefined || policy.revision === revision)
      if (action === 'review') {
        if (post.status !== 'prepared' || post.publish_attempt_id) throw new SafeError('DRAFT_CONFLICT', 409)
        return json({ review: { id, revision, account_id: post.instagram_account_id, username: 'prartjewelry', caption: post.caption, image_count: post.prepared_images.length, digest: await confirmationDigest(post), publishing_enabled: enabled } })
      }
      if (!enabled) throw new SafeError('PUBLISHING_DISABLED', 423)
      if (!['start', 'continue', 'reconcile', 'cancel'].includes(action || '')) throw new SafeError('INVALID_REQUEST')
      let digest: string | undefined
      if (action === 'start') {
        const input = JSON.parse(new TextDecoder().decode(await limitedBytes(request, 1024)))
        if (typeof input.digest !== 'string' || !/^[a-f0-9]{64}$/.test(input.digest)) throw new SafeError('CONFIRMATION_REQUIRED', 409)
        digest = input.digest
      }
      return json({ draft: await advancePublication(post, action as 'start' | 'continue' | 'reconcile' | 'cancel', digest) })
    } catch (error) { return safeFailure(error) }
  }
}
