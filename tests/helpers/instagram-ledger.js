// In-memory transport double. No unhandled URL may reach the real network.
export function createInstagramLedger() {
  const events = []
  let pauseUntil = 0, blocked = null
  let active = null, pending = null
  let maintenance = false, version = 2
  return {
    events,
    setMaintenance(value) { maintenance = value },
    setVersion(value) { version = value },
    reset() { events.length = 0; pauseUntil = 0; blocked = null; active = null; pending = null; maintenance = false; version = 2 },
    clearPause() { pauseUntil = 0; blocked = null },
    async fetch(url, options = {}) {
      if (url.pathname === '/rest/v1/rpc/instagram_runtime_status' || url.pathname === '/rest/v1/rpc/register_instagram_backend') {
        return Response.json({ schema_version: version, maintenance, frontend_ready: false })
      }
      if (url.pathname === '/rest/v1/rpc/ack_instagram_write') {
        // This transport double is supplemented by real SQL proof-of-ID tests.
        if (pending?.p_error === null && pending.p_remote_id) pending = null
        return Response.json(true)
      }
      if (url.pathname === '/rest/v1/instagram_events') {
        events.push(JSON.parse(options.body)); return Response.json([])
      }
      if (url.pathname === '/rest/v1/rpc/begin_instagram_request') {
        if (maintenance) return Response.json({ error_code: 'INSTAGRAM_MAINTENANCE' })
        if (blocked) return Response.json({ error_code: blocked })
        if (pauseUntil > Date.now()) return Response.json({ error_code: 'INSTAGRAM_ACCOUNT_PAUSED' })
        const input = JSON.parse(options.body), id = crypto.randomUUID()
        if (active) return Response.json({ error_code: 'INSTAGRAM_ACCOUNT_BUSY' })
        if (input.p_method === 'POST' && pending) return Response.json({ error_code: 'INSTAGRAM_WRITE_UNRESOLVED' })
        const event = { id, ...input }
        active = event; if (input.p_method === 'POST') pending = event
        events.push(event); return Response.json({ id })
      }
      if (url.pathname === '/rest/v1/rpc/finish_instagram_request') {
        const input = JSON.parse(options.body)
        Object.assign(events.find(event => event.id === input.p_id), input)
        if (active?.id === input.p_id) active = null
        if (['INSTAGRAM_TOKEN_INVALID', 'INSTAGRAM_PERMISSION_DENIED', 'INSTAGRAM_ACCOUNT_RESTRICTED'].includes(input.p_error)) blocked = input.p_error
        if (['INSTAGRAM_RATE_LIMIT', 'INSTAGRAM_TEMPORARY_ERROR', 'CONNECTION_UNAVAILABLE'].includes(input.p_error)) pauseUntil = Date.now() + Math.max(60, input.p_retry_seconds) * 1000
        return new Response(null, { status: 204 })
      }
      if (url.pathname === '/rest/v1/rpc/pause_instagram_account') {
        const input = JSON.parse(options.body)
        pauseUntil = Date.now() + input.p_seconds * 1000
        return new Response(null, { status: 204 })
      }
      return null
    },
  }
}
