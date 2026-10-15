-- Up Migration
-- Store the professional account handle returned by Instagram Login.
-- Nullable by design: existing connected accounts can populate it on reconnect.
alter table meta_tokens
  add column if not exists instagram_username text;

-- Down Migration
alter table meta_tokens
  drop column if exists instagram_username;
