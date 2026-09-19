-- Up Migration
-- Identity Refactor U2: single-use, short-TTL magic-link tokens. Only the
-- HMAC hash is stored, never the raw token (same shape as
-- spent_oauth_nonces/the token vault — the raw value is the credential,
-- so a DB read alone must never be enough to log in as someone). `ip` is
-- recorded for per-IP rate limiting alongside the per-email limit.
create table magic_link_tokens (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token_hash text not null,
  ip text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create unique index magic_link_tokens_hash_idx on magic_link_tokens (token_hash);
create index magic_link_tokens_email_created_idx on magic_link_tokens (email, created_at);
create index magic_link_tokens_ip_created_idx on magic_link_tokens (ip, created_at);

-- Down Migration
drop table magic_link_tokens;
