-- Targeted repair: Meta's successful media ID and publication date are already saved.
-- Does not contact Meta, publish anything, change content or unlock another attempt.
UPDATE public.instagram_posts
SET status = 'published', error_code = coalesce(error_code, 'METADATA_PENDING')
WHERE id = '2bc1f426-3740-421b-98d2-256ac34c42a5'
  AND status = 'publishing'
  AND instagram_id = '18204742831375816'
  AND published_at IS NOT NULL
  AND publish_progress->>'phase' = 'metadata'
RETURNING id, status, instagram_id;
