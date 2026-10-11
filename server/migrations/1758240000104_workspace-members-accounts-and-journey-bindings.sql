-- Up Migration
-- Workspace collaboration + multi-account journey bindings.
--
-- Existing tenants already have tenant_members. This migration adds the
-- missing invitation lifecycle and makes a campaign/journey explicitly
-- attachable to one or more connected Instagram accounts.

create table tenant_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  email text not null,
  role text not null default 'member',
  token_hash text not null unique,
  invited_by uuid not null references users(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint tenant_invitations_role_check
    check (role in ('admin', 'member')),
  constraint tenant_invitations_email_check
    check (length(trim(email)) > 3)
);

create index tenant_invitations_tenant_idx
  on tenant_invitations (tenant_id, created_at desc);

create index tenant_invitations_email_idx
  on tenant_invitations (tenant_id, email);

create table campaign_instagram_accounts (
  campaign_id uuid not null references campaigns(id) on delete cascade,
  meta_token_id uuid not null references meta_tokens(id) on delete cascade,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (campaign_id, meta_token_id)
);

create index campaign_instagram_accounts_account_idx
  on campaign_instagram_accounts (meta_token_id, enabled);

-- Preserve existing behavior. Before multi-account UI existed, every
-- campaign implicitly used every connected account in its tenant. Existing
-- campaigns therefore get attached to every currently connected account.
insert into campaign_instagram_accounts (campaign_id, meta_token_id)
select c.id, mt.id
from campaigns c
join meta_tokens mt on mt.tenant_id = c.tenant_id
on conflict (campaign_id, meta_token_id) do nothing;

-- Down Migration

drop table campaign_instagram_accounts;
drop table tenant_invitations;
