import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

export const projectRef = 'blsezjyhiholzwmqewef'
const tables = "('instagram_events','instagram_account_safety','instagram_runtime_control','instagram_backend_readiness')"
export const detailQueries = Object.freeze({
  catalog: `SELECT jsonb_build_object(
    'read_only',current_setting('transaction_read_only'),
    'can_execute_runtime',has_function_privilege(current_user,'public.instagram_runtime_status()','EXECUTE'),
    'constraints',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'name',con.conname,'type',con.contype,'validated',con.convalidated,'definition',pg_get_constraintdef(con.oid)) ORDER BY c.relname,con.conname) FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ${tables}),
    'defaults',(SELECT jsonb_agg(jsonb_build_object('table',table_name,'column',column_name,'type',data_type,'default',column_default,'nullable',is_nullable) ORDER BY table_name,ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name IN ${tables}),
    'indexes',(SELECT jsonb_agg(jsonb_build_object('table',tablename,'name',indexname,'definition',indexdef) ORDER BY tablename,indexname) FROM pg_indexes WHERE schemaname='public' AND tablename IN ${tables}),
    'runtime',(SELECT to_jsonb(c) FROM public.instagram_runtime_control c WHERE singleton),
    'runtime_definition',(SELECT jsonb_build_object('body',p.prosrc,'language',l.lanname,'volatility',p.provolatile,'security_definer',p.prosecdef,'search_path',p.proconfig) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname='public' AND p.proname='instagram_runtime_status' AND p.pronargs=0)
  ) AS detail`,
  runtime: 'SELECT public.instagram_runtime_status() AS detail',
})

export function compareSchemaCatalog(actual, expected) {
  // PostgreSQL 18 also exposes NOT NULL in pg_constraint (type n).
  // Compare its semantics through the complete column inventory on both versions.
  const validNotNull = catalog => catalog.constraints.filter(c => c.type === 'n').every(c =>
    c.validated && catalog.defaults.some(d => d.table === c.table && d.nullable === 'NO' && c.definition === `NOT NULL ${d.column}`))
  return {
    constraints: validNotNull(actual) && validNotNull(expected)
      && isDeepStrictEqual(actual.constraints.filter(c => c.type !== 'n'), expected.constraints.filter(c => c.type !== 'n')),
    defaults_and_columns: isDeepStrictEqual(actual.defaults, expected.defaults),
    indexes: isDeepStrictEqual(actual.indexes, expected.indexes),
  }
}

export class SchemaDetailError extends Error {
  constructor(phase, code, status, sqlstate) {
    super(code)
    this.diagnostic = { phase, code }
    if (Number.isInteger(status) && status >= 100 && status <= 599) this.diagnostic.http_status = status
    if (['42501','42601','25006','57014','42883','42P01'].includes(sqlstate)) this.diagnostic.sqlstate = sqlstate
  }
}

export function safeDetailError(error) {
  return error instanceof SchemaDetailError ? error.diagnostic : { phase: 'internal', code: 'UNEXPECTED_FAILURE' }
}

// Classify in memory; never return a remote message, body, header or credential.
async function httpFailure(response) {
  let text = ''
  try { text = (await response.text()).slice(0, 65536) } catch { /* status remains available */ }
  const state = text.match(/\b(42501|42601|25006|57014|42883|42P01)\b/)?.[1]
  let code = ({ '42501':'SQL_PERMISSION_DENIED', '42601':'SQL_SYNTAX_ERROR', '25006':'READ_ONLY_VIOLATION', '57014':'SQL_TIMEOUT', '42883':'SQL_FUNCTION_MISSING', '42P01':'SQL_TABLE_MISSING' })[state]
  if (/permission denied for function instagram_runtime_status\b/i.test(text)) code = 'RUNTIME_EXECUTE_DENIED'
  if (!code) code = response.status === 401 ? 'HTTP_UNAUTHORIZED' : response.status === 403 ? 'HTTP_FORBIDDEN' : 'HTTP_FAILED'
  return new SchemaDetailError(state || code === 'RUNTIME_EXECUTE_DENIED' ? 'sql' : 'http', code, response.status, state)
}

async function requestJson(url, options, fetchImpl) {
  let response
  try { response = await fetchImpl(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(20000) }) }
  catch (error) {
    const code = error?.cause?.code || error?.code
    if (/^(ERR_TLS|ERR_SSL|CERT_)/.test(code || '') || ['UNABLE_TO_VERIFY_LEAF_SIGNATURE','UNABLE_TO_GET_ISSUER_CERT_LOCALLY','DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN'].includes(code)) throw new SchemaDetailError('tls','TLS_FAILED')
    throw new SchemaDetailError('connection', ['TimeoutError','AbortError'].includes(error?.name) || ['ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT'].includes(code) ? 'REQUEST_TIMEOUT' : 'CONNECTION_FAILED')
  }
  if (!response.ok) throw await httpFailure(response)
  let data
  try { data = await response.json() } catch { throw new SchemaDetailError('response','INVALID_JSON',response.status) }
  return { data, http_status: response.status }
}

export async function readSchemaDetail(kind, { token = process.env.SUPABASE_ACCESS_TOKEN, fetchImpl = fetch } = {}) {
  if (!Object.hasOwn(detailQueries, kind) || !token) throw new SchemaDetailError('local_validation','INVALID_INPUT')
  const query = `BEGIN READ ONLY; ${detailQueries[kind]}; ROLLBACK;`
  const result = await requestJson(`https://api.supabase.com/v1/projects/${projectRef}/database/query/read-only`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }),
  }, fetchImpl)
  if (!Array.isArray(result.data) || result.data.length !== 1 || !Object.hasOwn(result.data[0], 'detail')) throw new SchemaDetailError('response','INVALID_QUERY_RESULT',result.http_status)
  return { http_status: result.http_status, detail: result.data[0].detail }
}

// Only this reviewed, SELECT-only STABLE RPC is permitted. Never call an Edge Function.
export async function readPublicRuntime(key, fetchImpl = fetch) {
  let legacy
  if (typeof key === 'string' && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) {
    try { legacy = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')) } catch { /* reject below */ }
  }
  if (typeof key !== 'string' || (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key) && !(legacy?.role === 'anon' && legacy?.ref === projectRef))) throw new SchemaDetailError('local_validation','PUBLIC_KEY_REQUIRED')
  const result = await requestJson(`https://${projectRef}.supabase.co/rest/v1/rpc/instagram_runtime_status`, { method: 'GET', headers: { apikey: key } }, fetchImpl)
  const state = result.data
  if (state?.schema_version !== 2 || state.maintenance !== true || state.frontend_ready !== false || typeof state.deployment_epoch !== 'string') throw new SchemaDetailError('validation','RUNTIME_MISMATCH',result.http_status)
  return { http_status: result.http_status, state }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const kind = process.argv[2] || 'catalog'
    const result = await readSchemaDetail(kind)
    console.log(JSON.stringify({ project_ref: projectRef, phase: kind, http_status: result.http_status, verified: true, drain_verified: false }))
  } catch (error) {
    console.log(JSON.stringify({ project_ref: projectRef, verified: false, drain_verified: false, diagnostic: safeDetailError(error) }))
    process.exitCode = 1
  }
}
