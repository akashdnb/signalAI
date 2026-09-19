-- Up Migration
-- Identity Refactor U1 (docs/improvement_plan.md): `users` is the login
-- identity (magic-link email auth, U2); `tenant_members` is the
-- membership join, sized for Phase 6 multi-user workspaces even though
-- Phase 1 only ever creates one `owner` row per tenant. `tenants.owner_user_id`
-- is nullable until U7's backfill makes it not-null.
--
-- Email is normalized (trimmed, lower-cased) at the application layer
-- before every insert/lookup, so a plain unique index is enough — no
-- citext extension needed for a single-column case-insensitive uniqueness
-- check.
create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  created_at timestamptz not null default now(),
  -- Sessions identify a person (U3), so revocation belongs here now, not
  -- on tenants. tenants.session_version stays until U8's cleanup so
  -- nothing breaks mid-refactor.
  session_version integer not null default 1
);
create unique index users_email_idx on users (email);

create table tenant_members (
  tenant_id uuid not null references tenants(id),
  user_id uuid not null references users(id),
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index tenant_members_user_id_idx on tenant_members (user_id);

alter table tenants add column owner_user_id uuid references users(id);

-- Down Migration
alter table tenants drop column owner_user_id;
drop table tenant_members;
drop table users;
