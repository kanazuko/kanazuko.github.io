-- Protocol v2. Apply after 20261107010000. Never rewrite posts or historical IDs.
ALTER TABLE public.instagram_account_safety
  ADD COLUMN active_request_id uuid REFERENCES public.instagram_events(id),
  ADD COLUMN pending_write_id uuid REFERENCES public.instagram_events(id),
  ADD COLUMN audit_hold boolean NOT NULL DEFAULT false;
ALTER TABLE public.instagram_events ADD COLUMN resolution text;
CREATE INDEX instagram_events_unfinished ON public.instagram_events(account_id, started_at)
  WHERE method IS NOT NULL AND finished_at IS NULL AND resolution IS NULL;

CREATE TABLE public.instagram_runtime_control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  schema_version integer NOT NULL CHECK (schema_version = 2),
  maintenance boolean NOT NULL DEFAULT true,
  frontend_ready boolean NOT NULL DEFAULT false,
  deployment_epoch uuid NOT NULL DEFAULT gen_random_uuid()
);
INSERT INTO public.instagram_runtime_control(singleton, schema_version) VALUES (true, 2);
CREATE TABLE public.instagram_backend_readiness (
  function_name text PRIMARY KEY CHECK (function_name IN ('instagram-status', 'instagram-prepare', 'instagram-publish')),
  schema_version integer NOT NULL,
  deployment_epoch uuid NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.instagram_runtime_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_backend_readiness ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.instagram_runtime_control, public.instagram_backend_readiness FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.instagram_runtime_control, public.instagram_backend_readiness TO authenticated;
CREATE POLICY "Admins read Instagram runtime" ON public.instagram_runtime_control
  FOR SELECT TO authenticated USING ((SELECT app_private.is_admin()));
CREATE POLICY "Admins read Instagram readiness" ON public.instagram_backend_readiness
  FOR SELECT TO authenticated USING ((SELECT app_private.is_admin()));

-- Read-only, nonsensitive release metadata, also usable by the Pages preflight.
CREATE FUNCTION public.instagram_runtime_status() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('schema_version', c.schema_version, 'maintenance', c.maintenance,
    'frontend_ready', c.frontend_ready AND
      (SELECT count(*) = 3 FROM public.instagram_backend_readiness r
       WHERE r.deployment_epoch = c.deployment_epoch AND r.schema_version = c.schema_version),
    'deployment_epoch', c.deployment_epoch)
  FROM public.instagram_runtime_control c WHERE singleton;
$$;

CREATE FUNCTION public.register_instagram_backend(p_name text, p_version integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c public.instagram_runtime_control;
BEGIN
  SELECT * INTO STRICT c FROM public.instagram_runtime_control WHERE singleton FOR UPDATE;
  IF p_version <> c.schema_version THEN RAISE EXCEPTION 'INSTAGRAM_SCHEMA_INCOMPATIBLE'; END IF;
  INSERT INTO public.instagram_backend_readiness(function_name, schema_version, deployment_epoch)
    VALUES (p_name, p_version, c.deployment_epoch)
    ON CONFLICT (function_name) DO UPDATE SET schema_version = EXCLUDED.schema_version,
      deployment_epoch = EXCLUDED.deployment_epoch, checked_at = clock_timestamp();
  RETURN public.instagram_runtime_status();
END;
$$;

CREATE FUNCTION public.set_instagram_maintenance(p_enabled boolean, p_frontend_ready boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c public.instagram_runtime_control;
BEGIN
  IF NOT (SELECT app_private.is_admin()) THEN RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF p_enabled IS NULL OR p_frontend_ready IS NULL THEN RAISE EXCEPTION 'INVALID_REQUEST'; END IF;
  SELECT * INTO STRICT c FROM public.instagram_runtime_control WHERE singleton FOR UPDATE;
  IF NOT p_enabled AND NOT (public.instagram_runtime_status()->>'frontend_ready')::boolean THEN
    RAISE EXCEPTION 'BACKENDS_NOT_VERIFIED';
  END IF;
  -- Entering maintenance for a new release invalidates all previous attestations.
  IF p_enabled AND NOT p_frontend_ready THEN
    UPDATE public.instagram_runtime_control SET maintenance = true, frontend_ready = false,
      deployment_epoch = gen_random_uuid() WHERE singleton;
  ELSE
    IF p_frontend_ready AND (SELECT count(*) FROM public.instagram_backend_readiness
        WHERE deployment_epoch = c.deployment_epoch AND schema_version = 2) <> 3 THEN
      RAISE EXCEPTION 'BACKENDS_NOT_VERIFIED';
    END IF;
    UPDATE public.instagram_runtime_control SET maintenance = p_enabled,
      frontend_ready = c.frontend_ready OR p_frontend_ready WHERE singleton;
  END IF;
  INSERT INTO public.instagram_events(actor_id, operation, finished_at)
    VALUES (auth.uid(), CASE WHEN p_enabled THEN 'maintenance_enabled' ELSE 'maintenance_disabled' END, clock_timestamp());
END;
$$;

CREATE OR REPLACE FUNCTION public.begin_instagram_request(
  p_actor uuid, p_account text, p_post uuid, p_revision integer, p_attempt uuid,
  p_operation text, p_endpoint text, p_method text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.instagram_account_safety; e public.instagram_events; v_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = p_actor) THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  -- Shared row lock orders reservation against a maintenance change, then commits
  -- before any HTTP request. No SQL transaction spans a call to Meta.
  PERFORM 1 FROM public.instagram_runtime_control WHERE singleton AND schema_version = 2 FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error_code', 'INSTAGRAM_SCHEMA_INCOMPATIBLE'); END IF;
  IF (SELECT maintenance FROM public.instagram_runtime_control WHERE singleton) THEN
    RETURN jsonb_build_object('error_code', 'INSTAGRAM_MAINTENANCE');
  END IF;
  IF p_method NOT IN ('GET', 'POST') OR p_method IS NULL THEN RAISE EXCEPTION 'INVALID_REQUEST'; END IF;
  INSERT INTO public.instagram_account_safety(account_id) VALUES (p_account) ON CONFLICT DO NOTHING;
  SELECT * INTO STRICT s FROM public.instagram_account_safety WHERE account_id = p_account FOR UPDATE;
  IF s.blocked_reason IS NOT NULL THEN RETURN jsonb_build_object('error_code', s.blocked_reason); END IF;
  IF s.paused_until > clock_timestamp() THEN RETURN jsonb_build_object('error_code', 'INSTAGRAM_ACCOUNT_PAUSED'); END IF;

  -- Includes unfinished requests written by protocol v1, without rewriting them.
  IF s.active_request_id IS NULL THEN
    SELECT * INTO e FROM public.instagram_events WHERE account_id = p_account
      AND method IS NOT NULL AND finished_at IS NULL AND resolution IS NULL ORDER BY started_at, id LIMIT 1;
    IF FOUND THEN
      s.active_request_id := e.id;
      UPDATE public.instagram_account_safety SET active_request_id = e.id WHERE account_id = p_account;
    END IF;
  ELSE SELECT * INTO STRICT e FROM public.instagram_events WHERE id = s.active_request_id;
  END IF;
  IF s.active_request_id IS NOT NULL THEN
    IF e.method = 'POST' AND e.started_at < clock_timestamp() - interval '10 minutes' AND p_method = 'GET' THEN
      -- Diagnostics may resume after a write timeout, but the pending write latch
      -- is permanent until durable evidence acknowledges its result.
      UPDATE public.instagram_account_safety SET pending_write_id = coalesce(pending_write_id, e.id),
        active_request_id = NULL WHERE account_id = p_account;
      UPDATE public.instagram_events SET resolution = 'unknown_write' WHERE id = e.id AND resolution IS NULL;
      s.pending_write_id := coalesce(s.pending_write_id, e.id);
    ELSE RETURN jsonb_build_object('error_code', 'INSTAGRAM_ACCOUNT_BUSY');
    END IF;
  END IF;
  IF p_method = 'POST' THEN
    IF s.pending_write_id IS NOT NULL THEN RETURN jsonb_build_object('error_code', 'INSTAGRAM_WRITE_UNRESOLVED'); END IF;
    IF s.audit_hold THEN RETURN jsonb_build_object('error_code', 'INSTAGRAM_AUDIT_UNRESOLVED'); END IF;
    -- Also protect historical unknown attempts which predate this protocol.
    IF EXISTS (SELECT 1 FROM public.instagram_posts p WHERE p.instagram_account_id = p_account
      AND p.id IS DISTINCT FROM p_post AND (p.status = 'publish_unknown'
        OR p.publish_progress->'operation'->>'kind' = 'write'
        OR (p.status = 'publishing' AND p.publish_progress->>'phase' IN ('working', 'sending')
          AND p.publish_progress->'operation'->>'kind' IS DISTINCT FROM 'read'))) THEN
      RETURN jsonb_build_object('error_code', 'INSTAGRAM_WRITE_UNRESOLVED');
    END IF;
    IF p_post IS NULL OR p_attempt IS NULL THEN RAISE EXCEPTION 'INVALID_WRITE_CONTEXT'; END IF;
  END IF;
  INSERT INTO public.instagram_events(actor_id, account_id, post_id, revision, attempt_id, operation, endpoint, method)
    VALUES (p_actor, p_account, p_post, p_revision, p_attempt, p_operation, p_endpoint, p_method) RETURNING id INTO v_id;
  UPDATE public.instagram_account_safety SET active_request_id = v_id,
    pending_write_id = CASE WHEN p_method = 'POST' THEN v_id ELSE pending_write_id END,
    updated_at = clock_timestamp() WHERE account_id = p_account;
  RETURN jsonb_build_object('id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_instagram_request(
  p_id uuid, p_error text, p_http_status integer, p_meta_code integer,
  p_meta_subcode integer, p_trace text, p_remote_id text, p_retry_seconds integer, p_container_status text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE e public.instagram_events;
BEGIN
  SELECT * INTO STRICT e FROM public.instagram_events WHERE id = p_id;
  -- All code paths take the account lock before updating events to avoid deadlocks.
  PERFORM 1 FROM public.instagram_account_safety WHERE account_id = e.account_id FOR UPDATE;
  UPDATE public.instagram_events SET finished_at = clock_timestamp(), error_code = p_error,
    http_status = p_http_status, meta_code = p_meta_code, meta_subcode = p_meta_subcode,
    trace_id = p_trace, remote_id = p_remote_id, container_status = p_container_status,
    resolution = CASE WHEN method = 'POST' THEN CASE WHEN p_error IS NULL THEN 'awaiting_commit' ELSE 'unknown_write' END ELSE 'completed' END
    WHERE id = p_id AND finished_at IS NULL AND (resolution IS NULL OR resolution = 'unknown_write');
  IF NOT FOUND THEN RAISE EXCEPTION 'AUDIT_CONFLICT'; END IF;
  IF p_error IN ('INSTAGRAM_TOKEN_INVALID', 'INSTAGRAM_PERMISSION_DENIED', 'INSTAGRAM_ACCOUNT_RESTRICTED') THEN
    PERFORM public.pause_instagram_account(e.account_id, p_error, NULL);
  ELSIF p_error IN ('INSTAGRAM_RATE_LIMIT', 'INSTAGRAM_TEMPORARY_ERROR', 'CONNECTION_UNAVAILABLE') THEN
    PERFORM public.pause_instagram_account(e.account_id, p_error, greatest(60, coalesce(p_retry_seconds, 0)));
  END IF;
  UPDATE public.instagram_account_safety SET active_request_id = CASE WHEN active_request_id = p_id THEN NULL ELSE active_request_id END,
    updated_at = clock_timestamp() WHERE account_id = e.account_id;
  -- pending_write_id deliberately survives every POST result, including success.
  -- It can only be released once its exact returned ID is saved on the post.
END;
$$;

CREATE FUNCTION public.ack_instagram_write(p_actor uuid, p_account text, p_post uuid, p_attempt uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.instagram_account_safety; e public.instagram_events; p public.instagram_posts;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = p_actor) THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
  SELECT * INTO s FROM public.instagram_account_safety WHERE account_id = p_account FOR UPDATE;
  IF NOT FOUND OR s.pending_write_id IS NULL THEN RETURN false; END IF;
  SELECT * INTO STRICT e FROM public.instagram_events WHERE id = s.pending_write_id;
  SELECT * INTO p FROM public.instagram_posts WHERE id = p_post AND publish_attempt_id = p_attempt;
  IF NOT FOUND OR p.instagram_account_id IS DISTINCT FROM p_account OR e.revision IS DISTINCT FROM p.revision
    OR e.post_id IS DISTINCT FROM p_post OR e.attempt_id IS DISTINCT FROM p_attempt
    OR e.finished_at IS NULL OR e.error_code IS NOT NULL OR e.remote_id IS NULL
    OR e.resolution <> 'awaiting_commit' THEN RETURN false; END IF;
  IF (CASE WHEN e.operation = 'publish_media' THEN p.instagram_id = e.remote_id
    ELSE p.container_id = e.remote_id OR coalesce(p.publish_progress->'children', '[]'::jsonb) ? e.remote_id END) IS DISTINCT FROM true THEN RETURN false; END IF;
  UPDATE public.instagram_events SET resolution = 'recorded' WHERE id = e.id;
  UPDATE public.instagram_account_safety SET pending_write_id = NULL, updated_at = clock_timestamp() WHERE account_id = p_account;
  INSERT INTO public.instagram_events(actor_id, account_id, post_id, attempt_id, operation, remote_id, finished_at)
    VALUES (p_actor, p_account, p_post, p_attempt, 'write_recorded', e.remote_id, clock_timestamp());
  RETURN true;
END;
$$;

CREATE FUNCTION public.recover_instagram_read(p_request uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE e public.instagram_events;
BEGIN
  IF NOT (SELECT app_private.is_admin()) THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
  SELECT * INTO STRICT e FROM public.instagram_events WHERE id = p_request;
  PERFORM 1 FROM public.instagram_account_safety WHERE account_id = e.account_id FOR UPDATE;
  IF e.method <> 'GET' OR e.finished_at IS NOT NULL OR e.started_at > clock_timestamp() - interval '10 minutes' THEN
    RAISE EXCEPTION 'MANUAL_REVIEW_REQUIRED';
  END IF;
  UPDATE public.instagram_events SET resolution = 'abandoned_read' WHERE id = p_request AND finished_at IS NULL AND resolution IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'AUDIT_CONFLICT'; END IF;
  UPDATE public.instagram_account_safety SET active_request_id = CASE WHEN active_request_id = p_request THEN NULL ELSE active_request_id END,
    audit_hold = true WHERE account_id = e.account_id;
  INSERT INTO public.instagram_events(actor_id, account_id, operation, remote_id, finished_at)
    VALUES (auth.uid(), e.account_id, 'abandoned_read_recovered', p_request::text, clock_timestamp());
  -- Unknown Retry-After or restrictions may have been lost. Recovery allows GET
  -- diagnostics only; it does not authorize new writes or clear provider pauses.
END;
$$;

CREATE FUNCTION public.resolve_instagram_read_hold(p_account text, p_paused_until timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT (SELECT app_private.is_admin()) THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
  IF NOT (SELECT maintenance FROM public.instagram_runtime_control WHERE singleton) THEN RAISE EXCEPTION 'MAINTENANCE_REQUIRED'; END IF;
  IF p_paused_until IS NULL OR p_paused_until < clock_timestamp() + interval '60 seconds' THEN RAISE EXCEPTION 'INVALID_PAUSE'; END IF;
  UPDATE public.instagram_account_safety SET audit_hold = false,
    paused_until = greatest(paused_until, p_paused_until) WHERE account_id = p_account;
  INSERT INTO public.instagram_events(actor_id, account_id, operation, finished_at)
    VALUES (auth.uid(), p_account, 'admin_read_hold_reviewed', clock_timestamp());
  -- Explicit external review is required; no unknown POST latch is cleared here.
END;
$$;

REVOKE ALL ON FUNCTION public.instagram_runtime_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.instagram_runtime_status() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.register_instagram_backend(text, integer), public.ack_instagram_write(uuid,text,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_instagram_backend(text, integer), public.ack_instagram_write(uuid,text,uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.set_instagram_maintenance(boolean,boolean), public.recover_instagram_read(uuid), public.resolve_instagram_read_hold(text,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_instagram_maintenance(boolean,boolean), public.recover_instagram_read(uuid), public.resolve_instagram_read_hold(text,timestamptz) TO authenticated;
