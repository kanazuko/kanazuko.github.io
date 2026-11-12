import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'

export const adminId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
export const userId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
export const postIds = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']
export const attemptIds = ['33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444']
export async function instagramDb(beforeV2) {
  const db = new PGlite()
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid, bucket_id text); ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;`)
  for (const file of ['20261026214609_initial_schema.sql', '20261104120000_instagram_drafts.sql', '20261105010000_instagram_publish_progress.sql', '20261107010000_instagram_safety_and_audit.sql']) {
    await db.exec(await readFile(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'))
  }
  await db.query('INSERT INTO auth.users VALUES ($1),($2)', [adminId, userId])
  await db.query('INSERT INTO admin_users(user_id) VALUES ($1)', [adminId])
  for (let i = 0; i < 2; i++) {
    await db.query(`INSERT INTO instagram_posts(id,created_by,mode,product_ids,image_ids,products,images,caption,template,status,revision,publish_attempt_id,instagram_account_id)
      VALUES ($1,$2,'single',ARRAY[$1::uuid],ARRAY[$1::uuid],'[]','[]','Historical content','','publishing',1,$3,'17841465479111585')`, [postIds[i], adminId, attemptIds[i]])
  }
  if (beforeV2) await beforeV2(db)
  await db.exec(await readFile(new URL('../../supabase/migrations/20261107020000_instagram_exclusive_requests.sql', import.meta.url), 'utf8'))
  return db
}

export function sqlRpc(db) {
  const allowed = new Set(['instagram_runtime_status', 'register_instagram_backend', 'begin_instagram_request', 'finish_instagram_request', 'pause_instagram_account', 'ack_instagram_write'])
  return async (url, options) => {
    const name = url.pathname.replace('/rest/v1/rpc/', '')
    if (!allowed.has(name)) throw new Error(`Unexpected RPC: ${name}`)
    const input = JSON.parse(options.body)
    const keys = Object.keys(input)
    if (!keys.every(key => /^p_[a-z_]+$/.test(key))) throw new Error('Unexpected argument')
    try {
      const result = (await db.query(`SELECT public.${name}(${keys.map((key, index) => `${key} => $${index + 1}`).join(',')}) AS result`, keys.map(key => input[key]))).rows[0].result
      return result === null ? new Response(null, { status: 204 }) : Response.json(result)
    } catch { return Response.json({ error: 'SQL_FAILURE' }, { status: 503 }) }
  }
}
