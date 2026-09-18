-- Up Migration
create extension if not exists pgcrypto;

create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Down Migration
drop table tenants;
