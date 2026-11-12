-- SELECT-only snapshot. Never invoke privileged RPCs from this read-only role.
BEGIN READ ONLY;
SELECT jsonb_build_object(
  'read_only',current_setting('transaction_read_only'),
  'observed_at',clock_timestamp(),
  'runtime',(SELECT to_jsonb(c) FROM public.instagram_runtime_control c WHERE singleton),
  'readiness',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY function_name),'[]'::jsonb) FROM public.instagram_backend_readiness r),
  'migrations',(SELECT jsonb_agg(version ORDER BY version) FROM supabase_migrations.schema_migrations),
  'posts',(SELECT jsonb_build_object('count',count(*),'fingerprint',md5(coalesce(string_agg(to_jsonb(p)::text,chr(10) ORDER BY id),''))) FROM public.instagram_posts p),
  'audit_counts',jsonb_build_object('events',(SELECT count(*) FROM public.instagram_events),'safety',(SELECT count(*) FROM public.instagram_account_safety)),
  'pending',(SELECT coalesce(jsonb_agg(jsonb_build_object(
    'post_id',id,'revision',revision,'status',status,'phase',publish_progress->>'phase',
    'attempt_id',publish_attempt_id,'container_id',container_id,'children',publish_progress->'children',
    'instagram_id',instagram_id,'updated_at',updated_at) ORDER BY id),'[]'::jsonb)
    FROM public.instagram_posts WHERE status IN ('publishing','publish_unknown','publish_failed') OR (publish_attempt_id IS NOT NULL AND status<>'published'))
) AS stage3;
ROLLBACK;
