BEGIN READ ONLY;
SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
  AND table_name = 'instagram_posts' AND column_name = 'publish_progress') AS progress_migration_applied,
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.instagram_posts'::regclass) AS history_rls,
  has_table_privilege('authenticated', 'public.instagram_posts', 'UPDATE') AS browser_can_update;
ROLLBACK;
