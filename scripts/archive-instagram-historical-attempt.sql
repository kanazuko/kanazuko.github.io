-- REVIEW TEMPLATE: NOT a migration, RPC or retryable publication operation.
-- DO NOT execute unresolved placeholders or execute without separate approval.
-- Render only through historical-closure.mjs after verified Auth + private backup.
-- The privileged SQL transport is trusted. SQL cannot authenticate a JWT itself.
-- READ COMMITTED deliberately refreshes reads after locks are acquired. A snapshot
-- taken before waiting for a table lock must not hide a concurrent committed edit.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
SET LOCAL idle_in_transaction_session_timeout = '30s';
SET LOCAL search_path = '';
SET LOCAL TIME ZONE 'UTC';

DO $closure$
DECLARE
  v_actor uuid := '__VERIFIED_ACTOR_UUID__';
  v_auth_until timestamptz := '__AUTH_VALID_UNTIL__';
  v_backup_sha text := '__BACKUP_SHA256__';
  v_id constant uuid := 'f7120683-6f03-43a6-bcf9-18a7ef5d69fe';
  v_attempt constant uuid := '9723a05a-982c-43f5-9aac-00491fdcc032';
  v_account constant text := '17841465479111585';
  v_epoch constant uuid := '3cd91507-439a-4a97-85bc-1dac9d218856';
  v_digest constant text := '76a89e0aef8a69018c916d29d50e0f951cf8d421cd3d19e46f8c80587cdc3b79';
  v_before public.instagram_posts;
  v_after public.instagram_posts;
  v_control public.instagram_runtime_control;
  v_control_before jsonb;
  v_readiness_before jsonb;
  v_others_before jsonb;
  v_migrations_before jsonb;
  v_event uuid;
  v_count integer;
BEGIN
  IF v_auth_until <= clock_timestamp() OR v_auth_until > clock_timestamp() + interval '125 seconds' THEN
    RAISE EXCEPTION 'CLOSURE_ADMIN_VERIFICATION_EXPIRED';
  END IF;
  IF v_backup_sha !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'CLOSURE_BACKUP_REQUIRED'; END IF;
  PERFORM 1 FROM public.admin_users WHERE user_id = v_actor FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CLOSURE_ADMIN_REQUIRED';
  END IF;
  -- Control first, then account table, posts, events. No transaction spans HTTP.
  SELECT * INTO STRICT v_control FROM public.instagram_runtime_control WHERE singleton FOR UPDATE;
  IF v_control.schema_version <> 2 OR v_control.maintenance IS DISTINCT FROM true
    OR v_control.frontend_ready IS DISTINCT FROM false OR v_control.deployment_epoch <> v_epoch THEN
    RAISE EXCEPTION 'CLOSURE_RUNTIME_CHANGED';
  END IF;
  LOCK TABLE public.instagram_account_safety IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.instagram_posts IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.instagram_events IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.instagram_backend_readiness IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE supabase_migrations.schema_migrations IN SHARE MODE;
  IF v_auth_until <= clock_timestamp() THEN RAISE EXCEPTION 'CLOSURE_ADMIN_VERIFICATION_EXPIRED'; END IF;
  v_control_before := to_jsonb(v_control);
  SELECT jsonb_agg(to_jsonb(r) ORDER BY function_name) INTO v_readiness_before
    FROM public.instagram_backend_readiness r;
  IF (SELECT count(*) FROM public.instagram_backend_readiness) <> 3 OR
    EXISTS (SELECT 1 FROM public.instagram_backend_readiness
      WHERE schema_version <> 2 OR deployment_epoch <> v_epoch) THEN
    RAISE EXCEPTION 'CLOSURE_READINESS_CHANGED';
  END IF;
  SELECT jsonb_agg(to_jsonb(m) ORDER BY version) INTO v_migrations_before
    FROM supabase_migrations.schema_migrations m;
  IF (SELECT array_agg(version::text ORDER BY version) FROM supabase_migrations.schema_migrations)
    IS DISTINCT FROM ARRAY['20261026214609','20261026215348','20261028120000','20261028130000',
      '20261028140000','20261030120000','20261104120000','20261105010000','20261107010000','20261107020000'] THEN
    RAISE EXCEPTION 'CLOSURE_HISTORY_CHANGED';
  END IF;
  IF EXISTS (SELECT 1 FROM public.instagram_events) OR EXISTS (SELECT 1 FROM public.instagram_account_safety) THEN
    RAISE EXCEPTION 'CLOSURE_LEDGER_CHANGED';
  END IF;
  IF (SELECT count(*) FROM public.instagram_posts) <> 18 OR
    (SELECT md5(coalesce(string_agg(to_jsonb(p)::text,chr(10) ORDER BY id),'')) FROM public.instagram_posts p)
      <> '__EXPECTED_ALL_POSTS_MD5__' THEN
    RAISE EXCEPTION 'CLOSURE_POSTS_CHANGED';
  END IF;
  SELECT * INTO STRICT v_before FROM public.instagram_posts WHERE id = v_id FOR UPDATE;
  IF md5(to_jsonb(v_before)::text) <> '__EXPECTED_TARGET_MD5__'
    OR v_before.publish_attempt_id IS DISTINCT FROM v_attempt
    OR v_before.instagram_account_id IS DISTINCT FROM v_account
    OR v_before.revision <> 1 OR v_before.status <> 'publishing'
    OR v_before.updated_at <> '2026-11-07T06:28:09.495369Z'::timestamptz
    OR v_before.publish_started_at IS DISTINCT FROM '2026-11-07T06:26:32.284Z'::timestamptz
    OR v_before.mode <> 'carousel' OR jsonb_array_length(v_before.images) <> 2
    OR jsonb_array_length(v_before.prepared_images) <> 2
    OR v_before.container_id IS DISTINCT FROM '17931282783182638'
    OR v_before.instagram_id IS NOT NULL OR v_before.instagram_url IS NOT NULL
    OR v_before.published_at IS NOT NULL OR v_before.error_code IS NOT NULL
    OR v_before.publish_progress IS DISTINCT FROM jsonb_build_object('phase','waiting',
      'waiting_child',false,'polls',0,'digest',v_digest,
      'children',jsonb_build_array('17931282594182638','17931282639182638')) THEN
    RAISE EXCEPTION 'CLOSURE_TARGET_CHANGED';
  END IF;
  SELECT jsonb_agg(to_jsonb(p) ORDER BY id) INTO v_others_before
    FROM public.instagram_posts p WHERE id <> v_id;

  UPDATE public.instagram_posts SET status = 'publish_failed', error_code = 'ADMIN_ARCHIVED_BEFORE_PUBLISH'
    WHERE id = v_id AND publish_attempt_id = v_attempt AND revision = 1
      AND status = 'publishing' AND updated_at = v_before.updated_at
    RETURNING * INTO STRICT v_after;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 OR v_after.status <> 'publish_failed'
    OR v_after.error_code <> 'ADMIN_ARCHIVED_BEFORE_PUBLISH'
    OR v_after.updated_at <= v_before.updated_at
    OR (to_jsonb(v_after) - ARRAY['status','error_code','updated_at'])
      IS DISTINCT FROM (to_jsonb(v_before) - ARRAY['status','error_code','updated_at']) THEN
    RAISE EXCEPTION 'CLOSURE_UNEXPECTED_POST_CHANGE';
  END IF;
  INSERT INTO public.instagram_events(actor_id,post_id,revision,attempt_id,account_id,
    operation,digest,status_before,status_after,phase_before,phase_after,error_code,
    trace_id,finished_at)
    VALUES (v_actor,v_id,1,v_attempt,v_account,'admin_archive_before_publish',v_digest,
      'publishing','publish_failed','waiting','waiting','ADMIN_ARCHIVED_BEFORE_PUBLISH',
      'backup-sha256:' || v_backup_sha,clock_timestamp()) RETURNING id INTO v_event;

  -- No exception handler: any error aborts everything, including audit insertion.
  IF (SELECT count(*) FROM public.instagram_posts) <> 18
    OR to_jsonb(v_after) IS DISTINCT FROM (SELECT to_jsonb(p) FROM public.instagram_posts p WHERE id=v_id)
    OR v_others_before IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(p) ORDER BY id)
      FROM public.instagram_posts p WHERE id <> v_id)
    OR EXISTS (SELECT 1 FROM public.instagram_account_safety)
    OR (SELECT count(*) FROM public.instagram_events) <> 1
    OR v_control_before IS DISTINCT FROM (SELECT to_jsonb(c) FROM public.instagram_runtime_control c WHERE singleton)
    OR v_readiness_before IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(r) ORDER BY function_name) FROM public.instagram_backend_readiness r)
    OR v_migrations_before IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(m) ORDER BY version) FROM supabase_migrations.schema_migrations m) THEN
    RAISE EXCEPTION 'CLOSURE_PRESERVATION_FAILED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.instagram_events WHERE id=v_event AND actor_id=v_actor
    AND post_id=v_id AND revision=1 AND attempt_id=v_attempt AND account_id=v_account
    AND operation='admin_archive_before_publish' AND digest=v_digest
    AND status_before='publishing' AND status_after='publish_failed'
    AND phase_before='waiting' AND phase_after='waiting'
    AND error_code='ADMIN_ARCHIVED_BEFORE_PUBLISH'
    AND trace_id='backup-sha256:' || v_backup_sha
    AND method IS NULL AND endpoint IS NULL AND remote_id IS NULL
    AND http_status IS NULL AND meta_code IS NULL AND meta_subcode IS NULL
    AND container_status IS NULL AND resolution IS NULL AND finished_at IS NOT NULL) THEN
    RAISE EXCEPTION 'CLOSURE_AUDIT_FAILED';
  END IF;
END;
$closure$;

-- Sanitized receipt from the same transaction; not proof of COMMIT on timeout.
SELECT jsonb_build_object('post_id',p.id,'attempt_id',p.publish_attempt_id,'status',p.status,
  'error_code',p.error_code,'updated_at',p.updated_at,'row_fingerprint',md5(to_jsonb(p)::text),
  'posts_fingerprint',(SELECT md5(string_agg(to_jsonb(q)::text,chr(10) ORDER BY id)) FROM public.instagram_posts q),
  'audit_event_id',(SELECT id FROM public.instagram_events WHERE operation='admin_archive_before_publish'),
  'maintenance',true,'frontend_ready',false,'drain_verified',false) AS closure_receipt
FROM public.instagram_posts p WHERE id='f7120683-6f03-43a6-bcf9-18a7ef5d69fe';
COMMIT;
