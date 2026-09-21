-- Up Migration
-- Phase 2A Tagging System: Custom Tags, Automatic Tags, Lead Segmentation.
-- `tags` is the tenant's own vocabulary (case-sensitive as typed — no
-- normalization beyond trim, matching the milestone/campaign name fields'
-- own convention of taking creator input verbatim); `lead_tags` is the
-- join, with `source` distinguishing a creator-applied tag from one the
-- system applied on its own (e.g. a future auto-tag rule), so a UI can
-- show provenance without a separate audit lookup.
create table tags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  created_at timestamptz not null default now()
);
create unique index tags_tenant_name_idx on tags (tenant_id, name);

create table lead_tags (
  tenant_id uuid not null references tenants(id),
  lead_id uuid not null references leads(id),
  tag_id uuid not null references tags(id),
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  primary key (lead_id, tag_id),
  constraint lead_tags_source_check check (source in ('manual', 'automatic'))
);
create index lead_tags_tenant_id_idx on lead_tags (tenant_id);

-- Down Migration
drop table lead_tags;
drop table tags;
