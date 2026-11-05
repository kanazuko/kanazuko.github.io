import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { generateInstagramCaption, validateInstagramDraft, catalogImageUrl } from '../src/utils/instagram.js'

const admin = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const user = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const product = '11111111-1111-4111-8111-111111111111'
const image = '22222222-2222-4222-8222-222222222222'
const id = '33333333-3333-4333-8333-333333333333'

test('caption templates preserve literal product text and selection validation', () => {
  assert.match(generateInstagramCaption([{ name: '$& <Anillo>', price: 125, description: 'Descripción' }], '{nombre}\n{precio}\n{descripcion}'), /\$& <Anillo>\n\$125.00 MXN\nDescripción/)
  const draft = { mode: 'single', product_ids: [product], image_ids: [image], caption: 'Texto' }
  const photos = [{ id: image, product_id: product }]
  assert.equal(validateInstagramDraft(draft, photos), '')
  assert.ok(validateInstagramDraft({ ...draft, mode: 'carousel' }, photos))
  assert.ok(validateInstagramDraft({ ...draft, caption: 'x'.repeat(2201) }, photos))
  assert.ok(validateInstagramDraft({ ...draft, caption: '#test '.repeat(31) }, photos))
  assert.throws(() => catalogImageUrl({}, { product_id: product, storage_path: `products/${product}/../evil` }))
})

test('Instagram SQL drafts: snapshots, RLS, immutable server state and optimistic retries', async () => {
  const db = new PGlite()
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
      CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      CREATE TABLE storage.objects(id uuid, bucket_id text); ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;`)
    await db.exec(await readFile(new URL('../supabase/migrations/20261026214609_initial_schema.sql', import.meta.url), 'utf8'))
    await db.exec(await readFile(new URL('../supabase/migrations/20261104120000_instagram_drafts.sql', import.meta.url), 'utf8'))
    await db.query('INSERT INTO auth.users VALUES ($1), ($2)', [admin, user])
    await db.query('INSERT INTO admin_users(user_id) VALUES ($1)', [admin])
    await db.query("INSERT INTO products(id,name,slug,price) VALUES ($1,'Anillo','anillo',125)", [product])
    await db.query('INSERT INTO product_images(id,product_id,storage_path) VALUES ($1,$2,$3)', [image, product, `products/${product}/foto.webp`])
    const asRole = (role, uid, sql, args = []) => db.transaction(async (tx) => {
      await tx.exec(`SET LOCAL ROLE ${role}`)
      await tx.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [uid])
      return tx.query(sql, args)
    })
    const save = (revision = 0, caption = 'Texto', uid = admin, imageIds = [image]) => asRole('authenticated', uid,
      'SELECT (public.save_instagram_draft($1,$2,$3,$4,$5,$6,$7)).*', [id, revision, 'single', [product], imageIds, caption, '{nombre}'])
    await assert.rejects(save(0, 'Texto', user), /ADMIN_REQUIRED/)
    await assert.rejects(asRole('anon', '', 'SELECT * FROM instagram_posts'), /permission denied/)
    const first = (await save()).rows[0]
    assert.equal(first.status, 'draft')
    assert.equal(first.products[0].price, 125)
    assert.equal(first.images[0].storage_path, `products/${product}/foto.webp`)
    assert.equal((await save()).rows[0].revision, 1)
    assert.equal((await asRole('authenticated', user, 'SELECT * FROM instagram_posts')).rows.length, 0)
    assert.equal((await asRole('authenticated', admin, 'SELECT * FROM instagram_posts')).rows.length, 1)
    await assert.rejects(asRole('authenticated', admin, "UPDATE instagram_posts SET status='published'"), /permission denied/)
    await assert.rejects(asRole('authenticated', admin, 'DELETE FROM instagram_posts'), /permission denied/)
    await assert.rejects(save(1, 'x'.repeat(2201)), /INVALID_DRAFT/)
    await assert.rejects(save(1, 'Texto', admin, [admin]), /INVALID_SELECTION/)
    assert.equal((await save(1, 'Editado')).rows[0].revision, 2)
    await assert.rejects(save(1, 'Otro texto'), /DRAFT_CONFLICT/)
    await db.exec("UPDATE instagram_posts SET status='prepared'")
    await assert.rejects(save(2, 'No permitido'), /DRAFT_CONFLICT/)
    const row = (await db.query('SELECT * FROM instagram_posts')).rows[0]
    assert.equal(row.caption, 'Editado')
    assert.equal(row.instagram_id, null)
    assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_policies WHERE schemaname='storage' AND cmd IN ('INSERT','UPDATE','DELETE','ALL')")).rows[0].n, 0)
  } finally { await db.close() }
})
