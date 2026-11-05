import { checkPublishingAccess, database, env, graph, limitedBytes, publicImageUrl, SafeError } from '../_shared/instagram.ts'

type Prepared = { image_id: string; path: string; sha256: string; width: number; height: number; bytes: number }
type Progress = { phase?: string; digest?: string; children?: string[]; polls?: number; last_poll?: string; warning?: string; waiting_child?: boolean }
export type Post = { id: string; revision: number; updated_at: string; status: string; mode: string; caption: string; images: { id: string }[]; prepared_images: Prepared[]; instagram_account_id: string; container_id?: string; instagram_id?: string; publish_attempt_id?: string; publish_progress: Progress }
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
async function metaPost(account: string, edge: 'media' | 'media_publish', fields: Record<string, string>) {
  if (!numericId(account)) throw new SafeError('INSTAGRAM_ACCOUNT_CHANGED', 409)
  const response = await fetch(`https://graph.facebook.com/v26.0/${account}/${edge}`, {
    method: 'POST', headers: { Authorization: `Bearer ${env('INSTAGRAM_ACCESS_TOKEN')}` },
    body: new URLSearchParams(fields), redirect: 'error', signal: AbortSignal.timeout(20000),
  })
  const result = await response.json()
  // Even errors are treated conservatively after sending a write: never retry it automatically.
  if (!response.ok || result.error || !numericId(result.id)) throw new SafeError('META_WRITE_UNCERTAIN', 502)
  return { id: result.id as string, warning: result.config_issue ? 'PUBLISHED_WITH_WARNING' : undefined }
}
async function verify(post: Post) {
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
  const access = await checkPublishingAccess()
  if (access.account_id !== post.instagram_account_id) throw new SafeError('INSTAGRAM_ACCOUNT_CHANGED', 409)
}

// One bounded step per call. Production's null trial allowlist blocks this module.
export async function advancePublication(post: Post, action: 'start' | 'continue' | 'reconcile', digest?: string): Promise<Post> {
  if (post.status === 'published') return post
  if (action === 'reconcile') {
    if (!['publishing', 'publish_unknown'].includes(post.status) || !numericId(post.container_id)) throw new SafeError('MANUAL_REVIEW_REQUIRED', 409)
    // Read only; FINISHED after a timeout is NOT permission to resubmit media_publish.
    const result = await graph(`${post.container_id}?fields=status_code`)
    return patch(post, { error_code: result.status_code === 'PUBLISHED' ? 'PUBLISHED_ID_UNRESOLVED' : 'MANUAL_REVIEW_REQUIRED', status: 'publish_unknown' })
  }
  if (action === 'start') {
    if (post.status !== 'prepared' || post.publish_attempt_id || !digest || digest !== await confirmationDigest(post)) throw new SafeError('CONFIRMATION_REQUIRED', 409)
    // Reserve before checks/remote operations. A crash leaves a closed lock, never a new attempt.
    let locked = await patch(post, { status: 'publishing', publish_attempt_id: crypto.randomUUID(), publish_started_at: new Date().toISOString(), publish_progress: { phase: 'checking', digest, children: [] }, error_code: null })
    try {
      await verify(locked)
      locked = await patch(locked, { publish_progress: { ...locked.publish_progress, phase: 'creating' } })
      return locked
    } catch (error) {
      await patch(locked, { status: 'publish_failed', error_code: error instanceof SafeError ? error.code : 'OPERATION_FAILED' })
      throw error
    }
  }
  if (post.status !== 'publishing' || !post.publish_attempt_id || post.publish_progress.digest !== await confirmationDigest(post)) throw new SafeError('DRAFT_CONFLICT', 409)
  const progress = post.publish_progress
  if (!['creating', 'waiting', 'ready', 'metadata'].includes(progress.phase || '')) throw new SafeError('MANUAL_REVIEW_REQUIRED', 409)
  if (progress.phase === 'waiting') {
    if (progress.last_poll && Date.now() - Date.parse(progress.last_poll) < 60000) throw new SafeError('POLL_TOO_SOON', 409)
    if ((progress.polls || 0) >= 5) throw new SafeError('MANUAL_REVIEW_REQUIRED', 409)
  }
  let locked = await patch(post, { publish_progress: { ...progress, phase: 'working' } })
  try {
    if (progress.phase === 'creating') {
      const children = progress.children || []
      const child = post.mode === 'carousel' && children.length < post.prepared_images.length
      const fields: Record<string, string> = child ? { image_url: publicImageUrl('instagram-prepared', post.prepared_images[children.length].path), is_carousel_item: 'true' }
        : post.mode === 'single' ? { image_url: publicImageUrl('instagram-prepared', post.prepared_images[0].path), caption: post.caption }
          : { media_type: 'CAROUSEL', children: children.join(','), caption: post.caption }
      const result = await metaPost(post.instagram_account_id, 'media', fields)
      return await patch(locked, child ? { publish_progress: { ...progress, children: [...children, result.id], phase: 'waiting', waiting_child: true, polls: 0, last_poll: undefined } }
        : { container_id: result.id, publish_progress: { ...progress, phase: 'waiting', waiting_child: false, polls: 0, last_poll: undefined } })
    }
    if (progress.phase === 'waiting') {
      const container = progress.waiting_child ? progress.children?.at(-1) : post.container_id
      if (!numericId(container)) throw new SafeError('MANUAL_REVIEW_REQUIRED', 409)
      const result = await graph(`${container}?fields=status_code`)
      if (!['FINISHED', 'IN_PROGRESS'].includes(result.status_code)) throw new SafeError('CONTAINER_NOT_READY', 409)
      return await patch(locked, { publish_progress: { ...progress, phase: result.status_code === 'FINISHED' ? progress.waiting_child ? 'creating' : 'ready' : 'waiting', polls: (progress.polls || 0) + 1, last_poll: new Date().toISOString() } })
    }
    if (progress.phase === 'ready') {
      await verify(post)
      if (!numericId(post.container_id)) throw new SafeError('MANUAL_REVIEW_REQUIRED', 409)
      const state = await graph(`${post.container_id}?fields=status_code`)
      if (state.status_code !== 'FINISHED') throw new SafeError('CONTAINER_NOT_READY', 409)
      // Persist the uncertain state BEFORE the irreversible request. No path retries this phase.
      locked = await patch(locked, { status: 'publish_unknown', publish_progress: { ...progress, phase: 'sending' } })
      const result = await metaPost(post.instagram_account_id, 'media_publish', { creation_id: post.container_id })
      return await patch(locked, { status: 'publishing', instagram_id: result.id, published_at: new Date().toISOString(), error_code: result.warning || null, publish_progress: { ...progress, phase: 'metadata', warning: result.warning } })
    }
    if (!numericId(post.instagram_id)) throw new SafeError('MANUAL_REVIEW_REQUIRED', 409)
    const media = await graph(`${post.instagram_id}?fields=id,permalink`)
    const link = new URL(media.permalink)
    if (media.id !== post.instagram_id || link.protocol !== 'https:' || !['www.instagram.com', 'instagram.com'].includes(link.hostname) || link.username || link.password || link.search || link.hash) throw new SafeError('INVALID_PERMALINK', 502)
    return await patch(locked, { status: 'published', instagram_url: link.href, error_code: progress.warning || null, publish_progress: { ...progress, phase: 'done' } })
  } catch (error) {
    try {
      // Metadata is safe to retry: it never sends another publication.
      await patch(locked, { status: progress.phase === 'metadata' ? 'publishing' : 'publish_unknown', error_code: progress.phase === 'metadata' ? 'METADATA_PENDING' : 'MANUAL_REVIEW_REQUIRED', publish_progress: { ...locked.publish_progress, ...(progress.phase === 'metadata' ? { phase: 'metadata' } : {}) } })
    } catch { /* Preserve the lock if persistence is unavailable. */ }
    throw error
  }
}
