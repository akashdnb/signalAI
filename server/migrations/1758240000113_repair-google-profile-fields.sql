-- Repair migration for environments where the original Google profile migration
-- was recorded as applied without the users columns being present.
-- This is intentionally idempotent so partially migrated environments are safe.
alter table users
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists profile_picture_url text,
  add column if not exists google_subject text;

create unique index if not exists users_google_subject_idx
  on users (google_subject)
  where google_subject is not null;

-- Down Migration
-- Keep the repair migration non-destructive: existing production profile data
-- must not be removed by a rollback.
