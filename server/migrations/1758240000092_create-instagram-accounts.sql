create table instagram_accounts (
  id uuid primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  instagram_user_id text not null,
  access_token_encrypted text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint instagram_accounts_tenant_user_unique
    unique (tenant_id, instagram_user_id)
);

create index instagram_accounts_tenant_idx
  on instagram_accounts (tenant_id);
