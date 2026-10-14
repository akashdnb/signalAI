-- Up Migration
-- OAuth state and session handoffs are hashed at rest and can be spent once.
create table google_oauth_states (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique,
  cookie_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index google_oauth_states_expiry_idx on google_oauth_states (expires_at);

create table google_login_handoffs (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  payload jsonb not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index google_login_handoffs_expiry_idx on google_login_handoffs (expires_at);

-- Down Migration
drop table google_login_handoffs;
drop table google_oauth_states;
