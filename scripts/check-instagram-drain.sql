-- READ ONLY. Snapshot only; this does not prove that an HTTP invocation has ended.
-- Compare with Edge invocation/runtime logs and saved pre-bridge version numbers.
BEGIN READ ONLY;
SELECT clock_timestamp() AS observed_at, current_setting('transaction_read_only') AS read_only;
SELECT id, revision, status, publish_attempt_id, instagram_account_id,
  container_id, instagram_id, publish_started_at, published_at, updated_at, error_code,
  publish_progress->>'phase' AS phase,
  publish_progress->'operation'->>'kind' AS operation_kind,
  publish_progress->'children' AS child_container_ids
FROM public.instagram_posts
WHERE status IN ('publishing','publish_unknown','publish_failed')
  OR (publish_attempt_id IS NOT NULL AND status <> 'published')
  OR (instagram_id IS NOT NULL AND instagram_url IS NULL)
ORDER BY updated_at, id;
ROLLBACK;
