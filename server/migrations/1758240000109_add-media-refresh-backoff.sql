-- Up Migration
-- Keep refresh failures separate from presentation metadata so a failed
-- Graph lookup never makes a cached preview look freshly fetched.
alter table media_metadata
  add column refresh_failure_count integer not null default 0,
  add column refresh_retry_at timestamptz;

-- Down Migration
alter table media_metadata
  drop column refresh_retry_at,
  drop column refresh_failure_count;