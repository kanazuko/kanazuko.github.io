-- Additive only: never rewrite existing instagram_posts or publication IDs.
CREATE TABLE public.instagram_account_safety (
  account_id text PRIMARY KEY CHECK (account_id ~ '^[0-9]+$'),
  blocked_reason text,
  paused_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.instagram_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  -- No FK to drafts: deleting an unpublished draft must not erase the audit.
  post_id uuid,
  revision integer,
  attempt_id uuid,
  account_id text,
  operation text NOT NULL,
  endpoint text,
  method text CHECK (method IN ('GET', 'POST')),
  digest text CHECK (digest IS NULL OR digest ~ '^[a-f0-9]{64}$'),
  status_before text,
  status_after text,
  phase_before text,
  phase_after text,
  remote_id text,
  container_status text,
  http_status integer,
  meta_code integer,
  meta_subcode integer,
  trace_id text,
  error_code text,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  finished_at timestamptz
);
CREATE INDEX instagram_events_attempt ON public.instagram_events(attempt_id, started_at);
CREATE INDEX instagram_events_post ON public.instagram_events(post_id, started_at);
ALTER TABLE public.instagram_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_account_safety ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.instagram_events, public.instagram_account_safety FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.instagram_events, public.instagram_account_safety TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.instagram_events, public.instagram_account_safety TO service_role;
CREATE POLICY "Admins read Instagram audit" ON public.instagram_events
  FOR SELECT TO authenticated USING ((SELECT app_private.is_admin()));
CREATE POLICY "Admins read Instagram safety" ON public.instagram_account_safety
  FOR SELECT TO authenticated USING ((SELECT app_private.is_admin()));

CREATE FUNCTION public.pause_instagram_account(p_account text, p_reason text, p_seconds integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.instagram_account_safety(account_id, blocked_reason, paused_until)
  VALUES (p_account, CASE WHEN p_seconds IS NULL THEN p_reason END,
    CASE WHEN p_seconds IS NOT NULL THEN clock_timestamp() + make_interval(secs => greatest(60, p_seconds)) END)
  ON CONFLICT (account_id) DO UPDATE SET
    blocked_reason = coalesce(instagram_account_safety.blocked_reason, EXCLUDED.blocked_reason),
    paused_until = greatest(instagram_account_safety.paused_until, EXCLUDED.paused_until), updated_at = clock_timestamp();
END;
$$;

CREATE FUNCTION public.begin_instagram_request(
  p_actor uuid, p_account text, p_post uuid, p_revision integer, p_attempt uuid,
  p_operation text, p_endpoint text, p_method text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_safety public.instagram_account_safety; v_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = p_actor) THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.instagram_account_safety(account_id) VALUES (p_account) ON CONFLICT DO NOTHING;
  SELECT * INTO v_safety FROM public.instagram_account_safety WHERE account_id = p_account FOR UPDATE;
  IF v_safety.blocked_reason IS NOT NULL THEN
    RETURN jsonb_build_object('error_code', v_safety.blocked_reason);
  END IF;
  IF v_safety.paused_until > clock_timestamp() THEN
    RETURN jsonb_build_object('error_code', 'INSTAGRAM_ACCOUNT_PAUSED');
  END IF;
  INSERT INTO public.instagram_events(actor_id, account_id, post_id, revision, attempt_id, operation, endpoint, method)
  VALUES (p_actor, p_account, p_post, p_revision, p_attempt, p_operation, p_endpoint, p_method)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id);
END;
$$;

CREATE FUNCTION public.finish_instagram_request(
  p_id uuid, p_error text, p_http_status integer, p_meta_code integer,
  p_meta_subcode integer, p_trace text, p_remote_id text, p_retry_seconds integer, p_container_status text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_account text;
BEGIN
  UPDATE public.instagram_events SET finished_at = clock_timestamp(), error_code = p_error,
    http_status = p_http_status, meta_code = p_meta_code, meta_subcode = p_meta_subcode,
    trace_id = p_trace, remote_id = p_remote_id, container_status = p_container_status
  WHERE id = p_id AND finished_at IS NULL RETURNING account_id INTO v_account;
  IF NOT FOUND THEN RAISE EXCEPTION 'AUDIT_CONFLICT'; END IF;
  IF p_error IN ('INSTAGRAM_TOKEN_INVALID', 'INSTAGRAM_PERMISSION_DENIED', 'INSTAGRAM_ACCOUNT_RESTRICTED') THEN
    PERFORM public.pause_instagram_account(v_account, p_error, NULL);
  ELSIF p_error IN ('INSTAGRAM_RATE_LIMIT', 'INSTAGRAM_TEMPORARY_ERROR', 'CONNECTION_UNAVAILABLE') THEN
    PERFORM public.pause_instagram_account(v_account, p_error, greatest(60, coalesce(p_retry_seconds, 0)));
  END IF;
END;
$$;

-- An administrator may explicitly lift a block after repairing credentials/permissions.
-- This never advances a draft or retries a write. Timed rate limits cannot be bypassed.
CREATE FUNCTION public.resume_instagram_account(p_account text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT (SELECT app_private.is_admin()) THEN RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE = '42501'; END IF;
  UPDATE public.instagram_account_safety SET blocked_reason = NULL, updated_at = clock_timestamp()
    WHERE account_id = p_account;
  INSERT INTO public.instagram_events(actor_id, account_id, operation, finished_at)
    VALUES (auth.uid(), p_account, 'admin_resume_account', clock_timestamp());
END;
$$;

REVOKE ALL ON FUNCTION public.pause_instagram_account(text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.begin_instagram_request(uuid, text, uuid, integer, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_instagram_request(uuid, text, integer, integer, integer, text, text, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resume_instagram_account(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pause_instagram_account(text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.begin_instagram_request(uuid, text, uuid, integer, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_instagram_request(uuid, text, integer, integer, integer, text, text, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.resume_instagram_account(text) TO authenticated;
