-- PREPARATION ONLY. Run remotely only after explicit authorization.
-- Complete application snapshot, including captions/images: private output only.
BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
SELECT jsonb_build_object(
  'project_ref','blsezjyhiholzwmqewef',
  'read_only',current_setting('transaction_read_only'),
  'observed_at',clock_timestamp(),
  'posts',(SELECT jsonb_agg(jsonb_build_object('id',id,'row_json',to_jsonb(p)::text) ORDER BY id) FROM public.instagram_posts p),
  'posts_fingerprint',(SELECT md5(coalesce(string_agg(to_jsonb(p)::text,chr(10) ORDER BY id),'')) FROM public.instagram_posts p),
  'runtime',(SELECT to_jsonb(c) FROM public.instagram_runtime_control c WHERE singleton),
  'readiness',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY function_name),'[]'::jsonb) FROM public.instagram_backend_readiness r),
  'events',(SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY id),'[]'::jsonb) FROM public.instagram_events e),
  'safety',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY account_id),'[]'::jsonb) FROM public.instagram_account_safety s),
  'migrations',(SELECT jsonb_agg(to_jsonb(m) ORDER BY version) FROM supabase_migrations.schema_migrations m)
) AS closure_backup;
ROLLBACK;
