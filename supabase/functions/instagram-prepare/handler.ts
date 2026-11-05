import { authenticate, checkPublishingAccess, cors, database, env, json, limitedBytes, publicImageUrl, SafeError, safeFailure, serviceHeaders, uuid } from '../_shared/instagram.ts'

type Image = { id: string; product_id: string; storage_path: string }
type Prepared = { image_id: string; path: string; sha256?: string; width?: number; height?: number; bytes?: number }
type Draft = { id: string; revision: number; status: string; updated_at: string; images: Image[]; prepared_images: Prepared[]; caption: string; mode: string; instagram_account_id?: string; publish_attempt_id?: string; container_id?: string; instagram_id?: string }
const maxBytes = 8 * 1024 * 1024
async function patch(draft: Draft, changes: object): Promise<Draft> {
  const rows = await database(`instagram_posts?id=eq.${draft.id}&revision=eq.${draft.revision}&status=eq.${draft.status}&updated_at=eq.${encodeURIComponent(draft.updated_at)}`, 'PATCH', changes)
  if (rows.length !== 1) throw new SafeError('DRAFT_CONFLICT', 409)
  return rows[0]
}
const digest = async (bytes: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource)), (b) => b.toString(16).padStart(2, '0')).join('')
function verifyPlan(draft: Draft) {
  if (!Array.isArray(draft.prepared_images) || draft.prepared_images.length !== draft.images.length) throw new SafeError('INVALID_IMAGE_PATH')
  for (const [index, item] of draft.prepared_images.entries()) {
    if (item.image_id !== draft.images[index].id || item.path !== `${draft.id}/${draft.revision}/${item.image_id}.jpg`) throw new SafeError('INVALID_IMAGE_PATH')
  }
}

export function createPrepareHandler(normalizeJpeg: (bytes: Uint8Array) => Uint8Array) {
  return async (request: Request) => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (request.method !== 'POST') return json({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405)
    let locked: Draft | undefined
    let failureState = 'preparation_failed'
    try {
      await authenticate(request)
      const url = new URL(request.url)
      const id = url.searchParams.get('id')
      const revision = Number(url.searchParams.get('revision'))
      const action = url.searchParams.get('action')
      if (!uuid(id) || !Number.isSafeInteger(revision) || revision < 1 || !['check', 'begin', 'upload', 'finish', 'reset', 'delete'].includes(action || '')) throw new SafeError('INVALID_REQUEST')
      const [draft]: Draft[] = await database(`instagram_posts?id=eq.${id}&select=*`)
      if (!draft && action === 'delete') return json({ deleted: true })
      if (!draft || draft.revision !== revision) throw new SafeError('DRAFT_CONFLICT', 409)

      if (action === 'check') {
        const access = await checkPublishingAccess()
        if (draft.instagram_account_id && draft.instagram_account_id !== access.account_id) throw new SafeError('INSTAGRAM_ACCOUNT_CHANGED', 409)
        return json({ access: { ...access, username: 'prartjewelry' } })
      }

      if (action === 'reset' || action === 'delete') {
        failureState = 'cleanup_failed'
        if (draft.publish_attempt_id || draft.container_id || draft.instagram_id) throw new SafeError('DRAFT_HAS_PUBLICATION', 409)
        if (!['draft', 'preparing', 'prepared', 'preparation_failed', 'cleanup_failed', 'cleaning', 'uploading'].includes(draft.status)) throw new SafeError('DRAFT_CONFLICT', 409)
        if (['uploading', 'cleaning'].includes(draft.status) && Date.now() - Date.parse(draft.updated_at) < 600000) throw new SafeError('OPERATION_IN_PROGRESS', 409)
        locked = await patch(draft, { status: 'cleaning', error_code: null })
        if (locked.prepared_images.length) {
          verifyPlan(locked)
          const response = await fetch(`${env('SUPABASE_URL')}/storage/v1/object/instagram-prepared`, {
            method: 'DELETE', headers: { ...serviceHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ prefixes: locked.prepared_images.map((item) => item.path) }),
            redirect: 'error', signal: AbortSignal.timeout(15000),
          })
          if (!response.ok) throw new SafeError('CLEANUP_FAILED', 503)
        }
        if (action === 'delete') {
          const rows = await database(`instagram_posts?id=eq.${locked.id}&revision=eq.${locked.revision}&status=eq.cleaning&updated_at=eq.${encodeURIComponent(locked.updated_at)}`, 'DELETE')
          if (rows.length !== 1) throw new SafeError('DRAFT_CONFLICT', 409)
          return json({ deleted: true })
        }
        const result = await patch(locked, { status: 'draft', revision: revision + 1, prepared_images: [], permission_checked_at: null, instagram_account_id: null, error_code: null })
        return json({ draft: result })
      }

      if (action === 'begin') {
        if (draft.status !== 'draft' || draft.prepared_images.length) throw new SafeError('DRAFT_CONFLICT', 409)
        if (!draft.caption.trim() || [...draft.caption].length > 2200 || (draft.caption.match(/#[\p{L}\p{N}_]+/gu) || []).length > 30 || (draft.caption.match(/@[a-zA-Z0-9_.]+/g) || []).length > 20) throw new SafeError('INVALID_CAPTION')
        // Acquire a lock before contacting Meta; a concurrent request cannot prepare twice.
        locked = await patch(draft, { status: 'uploading', error_code: null })
        const access = await checkPublishingAccess()
        const plan = draft.images.map((image) => ({ image_id: image.id, path: `${id}/${revision}/${image.id}.jpg` }))
        const result = await patch(locked, { status: 'preparing', prepared_images: plan, instagram_account_id: access.account_id, permission_checked_at: access.checked_at })
        return json({ draft: result })
      }

      if (draft.status !== 'preparing') throw new SafeError('DRAFT_CONFLICT', 409)
      verifyPlan(draft)
      if (action === 'upload') {
        const imageId = url.searchParams.get('image_id')
        const index = draft.images.findIndex((image) => image.id === imageId)
        if (index < 0 || request.headers.get('content-type')?.split(';')[0] !== 'image/jpeg') throw new SafeError('INVALID_IMAGE')
        // Idempotent acknowledgement of a previously completed upload; never overwrite it.
        if (draft.prepared_images[index].sha256) return json({ draft })
        locked = await patch(draft, { status: 'uploading', error_code: null })
        const source = draft.images[index]
        if (!source.storage_path.startsWith(`products/${source.product_id}/`)) throw new SafeError('INVALID_IMAGE_PATH')
        const original = await fetch(publicImageUrl('product-images', source.storage_path), { method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(10000) })
        if (!original.ok || !/^image\/(jpeg|png|webp|avif)(;|$)/.test(original.headers.get('content-type') || '')) throw new SafeError('SOURCE_IMAGE_UNAVAILABLE')
        const input = await limitedBytes(request, maxBytes)
        let bytes: Uint8Array
        try { bytes = normalizeJpeg(input) } catch { throw new SafeError('INVALID_JPEG') }
        if (bytes.byteLength > maxBytes) throw new SafeError('IMAGE_TOO_LARGE', 413)
        const item = draft.prepared_images[index]
        // Path was persisted by begin before this write, so even a crash leaves a cleanup manifest.
        const response = await fetch(`${env('SUPABASE_URL')}/storage/v1/object/instagram-prepared/${item.path}`, {
          method: 'POST', headers: { ...serviceHeaders(), 'Content-Type': 'image/jpeg', 'Cache-Control': '3600', 'x-upsert': 'false' },
          body: bytes as BodyInit, redirect: 'error', signal: AbortSignal.timeout(20000),
        })
        if (!response.ok) throw new SafeError('IMAGE_UPLOAD_FAILED', 503)
        const images = [...draft.prepared_images]
        images[index] = { ...item, sha256: await digest(bytes), width: 1080, height: 1080, bytes: bytes.length }
        return json({ draft: await patch(locked, { status: 'preparing', prepared_images: images }) })
      }

      if (draft.prepared_images.some((image) => !image.sha256)) throw new SafeError('IMAGES_INCOMPLETE')
      locked = await patch(draft, { status: 'uploading', error_code: null })
      // Confirm that Meta can fetch the exact stored files without authentication.
      for (const image of draft.prepared_images) {
        const response = await fetch(publicImageUrl('instagram-prepared', image.path), { redirect: 'error', signal: AbortSignal.timeout(10000) })
        if (!response.ok || response.headers.get('content-type')?.split(';')[0] !== 'image/jpeg') throw new SafeError('PUBLIC_IMAGE_UNAVAILABLE')
        const bytes = await limitedBytes(response, maxBytes)
        if (await digest(bytes) !== image.sha256) throw new SafeError('PUBLIC_IMAGE_UNAVAILABLE')
      }
      const access = await checkPublishingAccess()
      if (draft.instagram_account_id !== access.account_id) throw new SafeError('INSTAGRAM_ACCOUNT_CHANGED', 409)
      return json({ draft: await patch(locked, { status: 'prepared', permission_checked_at: access.checked_at, instagram_account_id: access.account_id, error_code: null }) })
    } catch (error) {
      if (locked) {
        try { await patch(locked, { status: failureState, error_code: error instanceof SafeError ? error.code : 'OPERATION_FAILED' }) } catch { /* Persisted lock/manifest is recoverable; never log raw errors. */ }
      }
      return safeFailure(error)
    }
  }
}
