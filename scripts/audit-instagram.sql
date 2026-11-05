-- Read-only Cloud audit. No secrets, captions, customer data or tokens are selected.
BEGIN READ ONLY;
SELECT jsonb_build_object(
  'history_rls', (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.instagram_posts'::regclass),
  'counts_by_status', (SELECT coalesce(jsonb_object_agg(status, total), '{}'::jsonb) FROM
    (SELECT status, count(*) AS total FROM public.instagram_posts GROUP BY status) s),
  'prepared_missing_manifest', (SELECT count(*) FROM public.instagram_posts WHERE status = 'prepared'
    AND (jsonb_array_length(prepared_images) <> cardinality(image_ids) OR jsonb_array_length(prepared_images) = 0)),
  'latest_permission_check', (SELECT max(permission_checked_at) FROM public.instagram_posts),
  'records_with_instagram_id', (SELECT count(*) FROM public.instagram_posts WHERE instagram_id IS NOT NULL),
  'bucket', (SELECT jsonb_build_object('public', public, 'file_size_limit', file_size_limit, 'allowed_mime_types', allowed_mime_types)
    FROM storage.buckets WHERE id = 'instagram-prepared'),
  'tracked_paths', (SELECT count(*) FROM public.instagram_posts p CROSS JOIN LATERAL jsonb_array_elements(p.prepared_images) i),
  'stored_objects', (SELECT count(*) FROM storage.objects WHERE bucket_id = 'instagram-prepared'),
  'untracked_objects', (SELECT count(*) FROM storage.objects o WHERE bucket_id = 'instagram-prepared' AND NOT EXISTS (
    SELECT 1 FROM public.instagram_posts p CROSS JOIN LATERAL jsonb_array_elements(p.prepared_images) i WHERE i->>'path' = o.name)),
  'authenticated_select', has_table_privilege('authenticated', 'public.instagram_posts', 'SELECT'),
  'authenticated_insert', has_table_privilege('authenticated', 'public.instagram_posts', 'INSERT'),
  'authenticated_update', has_table_privilege('authenticated', 'public.instagram_posts', 'UPDATE'),
  'authenticated_delete', has_table_privilege('authenticated', 'public.instagram_posts', 'DELETE'),
  'anon_select', has_table_privilege('anon', 'public.instagram_posts', 'SELECT'),
  'authenticated_save', has_function_privilege('authenticated', 'public.save_instagram_draft(uuid,integer,text,uuid[],uuid[],text,text)', 'EXECUTE'),
  'anon_save', has_function_privilege('anon', 'public.save_instagram_draft(uuid,integer,text,uuid[],uuid[],text,text)', 'EXECUTE'),
  'policies', (SELECT jsonb_agg(jsonb_build_object('schema', schemaname, 'table', tablename, 'name', policyname, 'roles', roles, 'command', cmd, 'using', qual, 'check', with_check))
    FROM pg_policies WHERE (schemaname = 'public' AND tablename IN ('instagram_posts', 'admin_users')) OR (schemaname = 'storage' AND tablename = 'objects'))
) AS audit;
COMMIT;
