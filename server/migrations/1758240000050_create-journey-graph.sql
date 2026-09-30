-- Up Migration
-- Advanced Automation Builder: nodes/edges representing a journey's visual
-- structure (roadmap's graph data model), additive to campaigns/
-- campaign_milestones — the Milestone Engine keeps its own ordered-list
-- storage (a milestone_group node here is a structural marker only; it
-- doesn't duplicate milestone rows or their field values). `type` is
-- deliberately plain text, not a check-constrained enum like the other
-- campaigns columns: the node registry (application layer) is the single
-- source of truth for valid types, and that set is expected to grow often
-- as new node kinds ship — a check constraint would mean a migration per
-- new type. `builder_version` on campaigns backs optimistic concurrency on
-- the atomic graph-save endpoint: a save must supply the version it read,
-- or it's rejected as stale (see saveBuilderGraph).
alter table campaigns add column builder_version integer not null default 1;

create table journey_nodes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  campaign_id uuid not null references campaigns(id),
  type text not null,
  position_x integer not null default 0,
  position_y integer not null default 0,
  data jsonb not null default '{}'::jsonb,
  parent_group_id uuid references journey_nodes(id),
  collapsed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index journey_nodes_campaign_idx on journey_nodes (campaign_id, tenant_id);

create table journey_edges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  campaign_id uuid not null references campaigns(id),
  source_node_id uuid not null references journey_nodes(id) on delete cascade,
  target_node_id uuid not null references journey_nodes(id) on delete cascade,
  label text,
  condition jsonb,
  created_at timestamptz not null default now()
);

create index journey_edges_campaign_idx on journey_edges (campaign_id, tenant_id);

-- Down Migration
drop table journey_edges;
drop table journey_nodes;
alter table campaigns drop column builder_version;
