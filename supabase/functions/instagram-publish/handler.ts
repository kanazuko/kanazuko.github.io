import { auditEvent, authenticate, cors, database, instagramHealth, instagramMaintenanceProbe, json, limitedBytes, requireInstagramRuntime, SafeError, safeFailure, uuid, type MetaContext } from '../_shared/instagram.ts'
import { advancePublication, confirmationDigest } from './engine.ts'

type PublicationPolicy = { account_id: string; id?: string; revision?: number }
export function createPublishHandler(policy: PublicationPolicy | null = null) {
  return async (request: Request) => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (request.method !== 'POST') return json({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405)
    let context: MetaContext | undefined
    try {
      const actorId = await authenticate(request)
      const url = new URL(request.url)
      const action = url.searchParams.get('action')
      if (action === 'health') return json(await instagramHealth('instagram-publish'))
      if (action === 'maintenance-probe') await instagramMaintenanceProbe()
      await requireInstagramRuntime()
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
      context = { actor_id: actorId, post_id: id, revision, attempt_id: post.publish_attempt_id }
      // Durable attribution precedes all actions, including recovery and cancellation.
      await auditEvent(context, `action_${action}`, { status_before: post.status, phase_before: post.publish_progress.phase })
      const result = await advancePublication(post, action as 'start' | 'continue' | 'reconcile' | 'cancel', digest, actorId)
      await auditEvent({ ...context, attempt_id: result.publish_attempt_id || undefined }, 'action_completed', { status_after: result.status, phase_after: result.publish_progress.phase })
      return json({ draft: result })
    } catch (error) {
      if (context) {
        try { await auditEvent(context, 'action_failed', { error_code: error instanceof SafeError ? error.code : 'OPERATION_FAILED' }) } catch { /* A failed ledger never authorizes a remote request. */ }
      }
      return safeFailure(error)
    }
  }
}
