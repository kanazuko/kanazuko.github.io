-- Backend-only progress ledger. Existing admin SELECT/RLS and write revocations apply.
alter table public.instagram_posts
  add column publish_progress jsonb not null default '{}'::jsonb
  check (jsonb_typeof(publish_progress) = 'object');

comment on column public.instagram_posts.publish_progress is
  'Backend publication ledger: confirmation digest, child IDs, phase and polling budget. Never contains tokens.';
