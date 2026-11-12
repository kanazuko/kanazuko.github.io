import { acknowledgeInstagramWrite, auditEvent, checkPublishingAccess, database, graph, limitedBytes, MetaNotSentError, metaRequest, publicImageUrl, SafeError, type MetaContext } from '../_shared/instagram.ts'

type Prepared = { image_id: string; path: string; sha256: string; width: number; height: number; bytes: number }
type Progress = { phase?: string; digest?: string; children?: string[]; polls?: number; last_poll?: string; warning?: string; waiting_child?: boolean; retry_after?: string; authorization?: { actor_id: string; authorized_at: string }; operation?: { kind: 'read' | 'write'; resume_phase: string; started_at: string } }
export type Post = { id: string; revision: number; updated_at: string; status: string; mode: string; caption: string; images: { id: string }[]; prepared_images: Prepared[]; instagram_account_id: string; container_id?: string; instagram_id?: string; instagram_url?: string; publish_attempt_id?: string; publish_progress: Progress }
const numericId = (value: unknown): value is string => typeof value === 'string' && /^\d+$/.test(value)
const hash = async (value: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', value as BufferSource)), b => b.toString(16).padStart(2, '0')).join('')
export async function confirmationDigest(post: Post) {
  return hash(new TextEncoder().encode(JSON.stringify([post.id, post.revision, post.instagram_account_id, post.mode, post.caption, post.prepared_images])))
}
async function patch(post: Post, changes: object): Promise<Post> {
  const rows = await database(`instagram_posts?id=eq.${post.id}&revision=eq.${post.revision}&status=eq.${post.status}&updated_at=eq.${encodeURIComponent(post.updated_at)}`, 'PATCH', changes)
  if (rows.length !== 1) throw new SafeError('DRAFT_CONFLICT', 409)
  return rows[0]
}
async function metaPost(account: string, edge: 'media' | 'media_publish', fields: Record<string, string>, context: MetaContext) {
  if (!numericId(account)) throw new SafeError('INSTAGRAM_ACCOUNT_CHANGED', 409)
  const result = await metaRequest(`${account}/${edge}`, context, fields)
  return { id: result.id as string, warning: result.config_issue ? 'PUBLISHED_WITH_WARNING' : undefined }
}
async function verify(post: Post, context: MetaContext) {
  if (!numericId(post.instagram_account_id) || !post.caption.trim() || [...post.caption].length > 2200 || (post.caption.match(/#[\p{L}\p{N}_]+/gu) || []).length > 30 || (post.caption.match(/@[a-zA-Z0-9_.]+/g) || []).length > 20) throw new SafeError('INVALID_CAPTION')
  const count = post.prepared_images.length
  if (!(post.mode === 'single' && count === 1 || post.mode === 'carousel' && count >= 2 && count <= 10) || count !== post.images.length) throw new SafeError('IMAGES_INCOMPLETE')
  for (const [index, image] of post.prepared_images.entries()) {
    if (image.image_id !== post.images[index].id || image.path !== `${post.id}/${post.revision}/${image.image_id}.jpg` || !/^[a-f0-9]{64}$/.test(image.sha256) || image.width !== 1080 || image.height !== 1080 || image.bytes > 8388608) throw new SafeError('INVALID_IMAGE_PATH')
    const response = await fetch(publicImageUrl('instagram-prepared', image.path), { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(10000) })
    if (!response.ok || response.headers.get('content-type')?.split(';')[0] !== 'image/jpeg') throw new SafeError('PUBLIC_IMAGE_UNAVAILABLE')
    const bytes = await limitedBytes(response, 8388608)
    if (bytes.length !== image.bytes || bytes[0] !== 255 || bytes[1] !== 216 || await hash(bytes) !== image.sha256) throw new SafeError('PUBLIC_IMAGE_UNAVAILABLE')
  }
  const access = await checkPublishingAccess(context)
  if (access.account_id !== post.instagram_account_id) throw new SafeError('INSTAGRAM_ACCOUNT_CHANGED', 409)
}

// One bounded step per call, behind authenticated account-scoped authorization.
export async function advancePublication(post: Post, action: 'start' | 'continue' | 'reconcile' | 'cancel', digest: string | undefined, actorId: string): Promise<Post> {
  const context: MetaContext = { actor_id: actorId, post_id: post.id, revision: post.revision, attempt_id: post.publish_attempt_id }
  // Release only a known successful remote ID already durably recorded on this
  // exact attempt. This is idempotent and never sends another request to Meta.
  await acknowledgeInstagramWrite(context)
  if (action === 'cancel') {
    // This checkpoint is persisted before any remote write, or after known children.
    // Only the empty checkpoint can be cancelled: never unlock an ambiguous write.
    if (post.status !== 'publishing' || !['creating', 'checking'].includes(post.publish_progress.phase || '') || post.publish_progress.operation || post.container_id || post.instagram_id || !Array.isArray(post.publish_progress.children) || post.publish_progress.children.length !== 0) throw new SafeError('MANUAL_REVIEW_REQUIRED', 409)
    return patch(post, { status: 'prepared', publish_attempt_id: null, publish_started_at: null, publish_progress: {}, error_code: null })
  }
  // A returned media ID already proves publication. Metadata retrieval is GET-only
  // and must remain available even after the row is labelled published.
  if (numericId(post.instagram_id) && ['continue', 'reconcile'].includes(action)) {
    // Preserve historical publications completely once their link is already known.
    if (post.status === 'published' && post.instagram_url) return post
    let media
    try { media = await graph(`${post.instagram_id}?fields=id,permalink`, context) }
    catch (error) {
      // Publication is proven by its ID; metadata failure never downgrades it.
      await patch(post, { error_code: 'METADATA_PENDING' })
      throw error
    }
    const link = new URL(media.permalink)
    if (media.id !== post.instagram_id || link.protocol !== 'https:' || !['www.instagram.com', 'instagram.com'].includes(link.hostname) || link.username || link.password || link.search || link.hash) throw new SafeError('INVALID_PERMALINK', 502)
    return patch(post, { status: 'published', instagram_url: link.href, error_code: post.publish_progress.warning || null, publish_progress: { ...post.publish_progress, phase: 'done' } })
  }
  if (post.status === 'published') return post
  if (action === 'reconcile') {
    if (!['publishing', 'publish_unknown'].includes(post.status) || !numericId(post.container_id)) throw new SafeError('MANUAL_REVIEW_REQUIRED', 409)
    // Read only; FINISHED after a timeout is NOT permission to resubmit media_publish.
    const result = await graph(`${post.container_id}?fields=status_code`, context)
    return patch(post, { error_code: result.status_code === 'PUBLISHED' ? 'PUBLISHED_ID_UNRESOLVED' : 'MANUAL_REVIEW_REQUIRED', status: 'publish_unknown' })
  }
  if (action === 'start') {
    if (post.status !== 'prepared' || post.publish_attempt_id || !digest || digest !== await confirmationDigest(post)) throw new SafeError('CONFIRMATION_REQUIRED', 409)
    // Reserve before checks/remote operations. A crash leaves a closed lock, never a new attempt.
    const attemptId = crypto.randomUUID()
    const started = new Date().toISOString()
    let locked = await patch(post, { status: 'publishing', publish_attempt_id: attemptId, publish_started_at: started, publish_progress: { phase: 'checking', digest, children: [], authorization: { actor_id: actorId, authorized_at: started }, operation: { kind: 'read', resume_phase: 'checking', started_at: started } }, error_code: null })
    context.attempt_id = attemptId
    try {
      await auditEvent(context, 'publication_authorized', { digest, status_before: post.status, status_after: 'publishing', phase_after: 'checking' })
      await verify(locked, context)
      locked = await patch(locked, { publish_progress: { ...locked.publish_progress, phase: 'creating', operation: undefined } })
      return locked
    } catch (error) {
      // No Meta write has occurred. Keep an explicit, recoverable read checkpoint.
      try { await patch(locked, { error_code: error instanceof SafeError ? error.code : 'OPERATION_FAILED', publish_progress: { ...locked.publish_progress, operation: undefined, retry_after: new Date(Date.now() + 60000).toISOString() } }) } catch { /* A stale read lock can be recovered; never overwrite another worker. */ }
      throw error
    }
  }
  if (post.status !== 'publishing' || !post.publish_attempt_id || post.publish_progress.digest !== await confirmationDigest(post)) throw new SafeError('DRAFT_CONFLICT', 409)
  if (post.publish_progress.operation || ['working', 'checking'].includes(post.publish_progress.phase || '')) {
    const operation = post.publish_progress.operation
    if (operation) {
      // Only new, explicitly classified read locks can expire. Legacy/unknown locks
      // and all writes stay closed, regardless of age.
      if (operation.kind !== 'read') throw new SafeError('MANUAL_REVIEW_REQUIRED', 409)
      const elapsed = Date.now() - Date.parse(operation.started_at)
      if (!Number.isFinite(elapsed) || elapsed < 600000) throw new SafeError('OPERATION_IN_PROGRESS', 409)
      return patch(post, { publish_progress: { ...post.publish_progress, phase: operation.resume_phase, operation: undefined }, error_code: null })
    }
    if (post.publish_progress.phase !== 'checking') throw new SafeError('MANUAL_REVIEW_REQUIRED', 409)
  }
  const progress = post.publish_progress
  if (!['checking', 'creating', 'waiting', 'ready', 'metadata'].includes(progress.phase || '')) throw new SafeError('MANUAL_REVIEW_REQUIRED', 409)
  if (progress.retry_after && Date.now() < Date.parse(progress.retry_after)) throw new SafeError('POLL_TOO_SOON', 409)
  if (progress.phase === 'waiting') {
    if (progress.last_poll && Date.now() - Date.parse(progress.last_poll) < 60000) throw new SafeError('POLL_TOO_SOON', 409)
    if ((progress.polls || 0) >= 5) throw new SafeError('MANUAL_REVIEW_REQUIRED', 409)
  }
  let writeStarted = progress.phase === 'creating'
  let locked = await patch(post, { publish_progress: { ...progress, phase: 'working', operation: { kind: writeStarted ? 'write' : 'read', resume_phase: progress.phase!, started_at: new Date().toISOString() } } })
  try {
    if (progress.phase === 'checking') {
      await auditEvent(context, 'confirmation_resumed', { digest: progress.digest, phase_before: 'checking' })
      await verify(post, context)
      return await patch(locked, { error_code: null, publish_progress: { ...progress, phase: 'creating', operation: undefined, retry_after: undefined } })
    }
    if (progress.phase === 'creating') {
      const children = progress.children || []
      const child = post.mode === 'carousel' && children.length < post.prepared_images.length
      const fields: Record<string, string> = child ? { image_url: publicImageUrl('instagram-prepared', post.prepared_images[children.length].path), is_carousel_item: 'true' }
        : post.mode === 'single' ? { image_url: publicImageUrl('instagram-prepared', post.prepared_images[0].path), caption: post.caption }
          : { media_type: 'CAROUSEL', children: children.join(','), caption: post.caption }
      const result = await metaPost(post.instagram_account_id, 'media', fields, context)
      const updated = await patch(locked, child ? { error_code: null, publish_progress: { ...progress, children: [...children, result.id], phase: 'waiting', waiting_child: true, polls: 0, last_poll: undefined, operation: undefined, retry_after: undefined } }
        : { error_code: null, container_id: result.id, publish_progress: { ...progress, phase: 'waiting', waiting_child: false, polls: 0, last_poll: undefined, operation: undefined, retry_after: undefined } })
      await acknowledgeInstagramWrite(context)
      return updated
    }
    if (progress.phase === 'waiting') {
      const container = progress.waiting_child ? progress.children?.at(-1) : post.container_id
      if (!numericId(container)) throw new SafeError('MANUAL_REVIEW_REQUIRED', 409)
      const result = await graph(`${container}?fields=status_code`, context)
      if (!['FINISHED', 'IN_PROGRESS'].includes(result.status_code)) throw new SafeError('CONTAINER_NOT_READY', 409)
      return await patch(locked, { error_code: null, publish_progress: { ...progress, phase: result.status_code === 'FINISHED' ? progress.waiting_child ? 'creating' : 'ready' : 'waiting', polls: (progress.polls || 0) + 1, last_poll: new Date().toISOString(), operation: undefined, retry_after: undefined } })
    }
    if (progress.phase === 'ready') {
      await verify(post, context)
      if (!numericId(post.container_id)) throw new SafeError('MANUAL_REVIEW_REQUIRED', 409)
      const state = await graph(`${post.container_id}?fields=status_code`, context)
      if (state.status_code !== 'FINISHED') throw new SafeError('CONTAINER_NOT_READY', 409)
      // Persist the uncertain state BEFORE the irreversible request. No path retries this phase.
      locked = await patch(locked, { status: 'publish_unknown', publish_progress: { ...progress, phase: 'sending', operation: { kind: 'write', resume_phase: 'ready', started_at: new Date().toISOString() } } })
      writeStarted = true
      const result = await metaPost(post.instagram_account_id, 'media_publish', { creation_id: post.container_id }, context)
      const updated = await patch(locked, { status: 'published', instagram_id: result.id, published_at: new Date().toISOString(), error_code: result.warning || 'METADATA_PENDING', publish_progress: { ...progress, phase: 'metadata', warning: result.warning } })
      await acknowledgeInstagramWrite(context)
      return updated
    }
    if (!numericId(post.instagram_id)) throw new SafeError('MANUAL_REVIEW_REQUIRED', 409)
    const media = await graph(`${post.instagram_id}?fields=id,permalink`, context)
    const link = new URL(media.permalink)
    if (media.id !== post.instagram_id || link.protocol !== 'https:' || !['www.instagram.com', 'instagram.com'].includes(link.hostname) || link.username || link.password || link.search || link.hash) throw new SafeError('INVALID_PERMALINK', 502)
    return await patch(locked, { status: 'published', instagram_url: link.href, error_code: progress.warning || null, publish_progress: { ...progress, phase: 'done' } })
  } catch (error) {
    try {
      const code = error instanceof SafeError ? error.code : 'OPERATION_FAILED'
      if (error instanceof MetaNotSentError) writeStarted = false
      const terminal = ['CONTAINER_NOT_READY', 'MANUAL_REVIEW_REQUIRED', 'INVALID_CAPTION', 'INVALID_IMAGE_PATH', 'IMAGES_INCOMPLETE', 'INSTAGRAM_ACCOUNT_CHANGED'].includes(code)
      await patch(locked, writeStarted || terminal
        ? { status: 'publish_unknown', error_code: writeStarted ? 'META_WRITE_UNCERTAIN' : code }
        : { status: 'publishing', error_code: code, publish_progress: { ...progress, operation: undefined, retry_after: new Date(Date.now() + 60000).toISOString() } })
    } catch { /* Preserve the lock if persistence is unavailable. */ }
    throw error
  }
}
