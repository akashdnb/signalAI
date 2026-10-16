create table if not exists mcp_oauth_clients (
  client_id text primary key,
  client_name text not null,
  redirect_uris text[] not null,
  grant_types text[] not null default array['authorization_code', 'refresh_token'],
  response_types text[] not null default array['code'],
  created_at timestamptz not null default now()
);

create table if not exists mcp_oauth_codes (
  code_hash text primary key,
  client_id text not null references mcp_oauth_clients(client_id) on delete cascade,
  redirect_uri text not null,
  scopes text[] not null,
  code_challenge text not null,
  resource text not null,
  user_id uuid not null references users(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mcp_oauth_codes_expiry_idx on mcp_oauth_codes(expires_at);

create table if not exists mcp_oauth_tokens (
  access_token_hash text primary key,
  refresh_token_hash text unique,
  client_id text not null references mcp_oauth_clients(client_id) on delete cascade,
  scopes text[] not null,
  resource text not null,
  user_id uuid not null references users(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mcp_oauth_tokens_access_expiry_idx on mcp_oauth_tokens(access_expires_at);
create index if not exists mcp_oauth_tokens_refresh_expiry_idx on mcp_oauth_tokens(refresh_expires_at);
