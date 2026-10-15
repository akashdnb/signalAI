-- Up Migration
-- Agency Bulk Billing (docs/AGENCY_WORKSPACES_AND_BULK_BILLING_PLAN.md).
--
-- A `billing_account` is a PARENT payer: one personal-email user holds the
-- card and one Stripe subscription that covers several workspaces (tenants).
-- This is ADDITIVE — a tenant not listed in billing_account_tenants keeps
-- paying its own way through the existing tenants.* billing columns, so no
-- existing tenant is migrated or disturbed.
--
-- One plan per owner (unique owner_user_id): the "bulk plan on a personal
-- account" is a single payer relationship, not many. A user can still be the
-- owner of many workspaces and a member of many more — that is tenant_members,
-- unrelated to who is paying.
create table billing_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references users(id),
  plan text not null default 'agency_bulk',
  workspace_limit integer not null,
  stripe_customer_id text,
  stripe_subscription_id text,
  billing_status text not null default 'none',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint billing_accounts_plan_check check (plan in ('agency_bulk')),
  constraint billing_accounts_status_check
    check (billing_status in ('none', 'active', 'past_due', 'canceled')),
  constraint billing_accounts_limit_check check (workspace_limit > 0)
);

create unique index billing_accounts_owner_unique on billing_accounts (owner_user_id);
create unique index billing_accounts_stripe_customer_idx
  on billing_accounts (stripe_customer_id) where stripe_customer_id is not null;

-- Parent -> child coverage. tenant_id is UNIQUE on its own (not just within a
-- billing account): a workspace is covered by at most one plan at a time, so
-- "which plan, if any, covers this workspace" is always a single row.
--
-- per_workspace_token_cap is the optional soft cap: NULL = draw freely from
-- the shared pool; a number = reject this workspace's AI requests once it has
-- spent that many tokens in the current billing cycle, while other covered
-- workspaces keep running.
create table billing_account_tenants (
  billing_account_id uuid not null references billing_accounts(id) on delete cascade,
  tenant_id uuid not null unique references tenants(id) on delete cascade,
  per_workspace_token_cap bigint,
  added_at timestamptz not null default now(),
  primary key (billing_account_id, tenant_id),

  constraint billing_account_tenants_cap_check
    check (per_workspace_token_cap is null or per_workspace_token_cap >= 0)
);

create index billing_account_tenants_account_idx
  on billing_account_tenants (billing_account_id);

-- Down Migration
drop table billing_account_tenants;
drop table billing_accounts;
