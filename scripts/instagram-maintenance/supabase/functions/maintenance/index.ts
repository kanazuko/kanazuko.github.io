// Temporary bridge for older deployed code which does not consult the runtime
// maintenance flag. No Auth, database or Meta operation can run through this stub.
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'X-Instagram-Maintenance-Bridge',
  'X-Instagram-Maintenance-Bridge': 'prartjewelry-v1',
  'Cache-Control': 'no-store',
}
Deno.serve((request: Request) => request.method === 'OPTIONS'
  ? new Response(null, { status: 204, headers })
  : Response.json({ error: { code: 'INSTAGRAM_MAINTENANCE' } }, { status: 423, headers }))
