-- READ ONLY. Run against the explicitly selected remote project; contains no data
-- from posts, users, tokens, connection strings or secrets. Save the result for review.
BEGIN READ ONLY;
SELECT current_database() AS database_name, current_setting('server_version') AS postgres_version;
SELECT name, to_regclass(name) IS NOT NULL AS present FROM unnest(ARRAY[
  'public.admin_users','public.instagram_posts','public.instagram_events',
  'public.instagram_account_safety','public.instagram_runtime_control',
  'public.instagram_backend_readiness','supabase_migrations.schema_migrations'
]) name;
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN (
  'instagram_posts','instagram_events','instagram_account_safety','instagram_runtime_control','instagram_backend_readiness'
) ORDER BY table_name, ordinal_position;
SELECT n.nspname AS schema_name, c.relname, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname LIKE 'instagram_%' AND c.relkind='r';
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname='public' AND (tablename LIKE 'instagram_%' OR tablename='admin_users') ORDER BY tablename, policyname;
SELECT p.oid::regprocedure AS signature, p.prosecdef AS security_definer, p.proconfig,
  md5(pg_get_functiondef(p.oid)) AS definition_fingerprint,
  pg_get_userbyid(p.proowner) AS owner,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE (n.nspname='public' AND p.proname LIKE '%instagram%') OR (n.nspname='app_private' AND p.proname='is_admin')
ORDER BY p.oid::regprocedure::text;
SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name LIKE 'instagram_%' ORDER BY table_name, grantee, privilege_type;
SELECT c.relname AS table_name, r.role,
  has_table_privilege(r.role,c.oid,'SELECT') AS can_select,
  has_table_privilege(r.role,c.oid,'INSERT') AS can_insert,
  has_table_privilege(r.role,c.oid,'UPDATE') AS can_update,
  has_table_privilege(r.role,c.oid,'DELETE') AS can_delete
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
CROSS JOIN (VALUES ('anon'),('authenticated'),('service_role')) r(role)
WHERE n.nspname='public' AND c.relname LIKE 'instagram_%' AND c.relkind='r'
ORDER BY c.relname,r.role;
SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename LIKE 'instagram_%';
-- Works whether or not the migration history schema exists, without dynamic writes.
SELECT CASE WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL THEN NULL
  ELSE query_to_xml('SELECT version FROM supabase_migrations.schema_migrations ORDER BY version', true, false, '')::text END AS migration_history;
ROLLBACK;
