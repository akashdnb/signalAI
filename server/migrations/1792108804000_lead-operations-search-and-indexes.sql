-- Up Migration
-- Lead Operations: support bounded tenant-scoped operational search efficiently.
-- Existing lead, captured-facts, note and tag entities remain the source of truth.
create index if not exists lead_events_tenant_lead_occurred_idx
  on lead_events (tenant_id, lead_id, occurred_at desc, id desc);
create index if not exists lead_pii_username_active_lead_idx
  on lead_pii (lead_id, created_at desc)
  where deleted_at is null and username is not null;
create index if not exists lead_captured_facts_tenant_lead_idx
  on lead_captured_facts (tenant_id, lead_id)
  where deleted_at is null;
create index if not exists lead_tags_tenant_tag_lead_idx
  on lead_tags (tenant_id, tag_id, lead_id);
create index if not exists lead_notes_tenant_lead_created_idx
  on lead_notes (tenant_id, lead_id, created_at desc, id desc);
create index if not exists leads_tenant_activity_created_idx
  on leads (tenant_id, last_inbound_at desc, created_at desc, id desc);

-- Down Migration
drop index if exists leads_tenant_activity_created_idx;
drop index if exists lead_notes_tenant_lead_created_idx;
drop index if exists lead_tags_tenant_tag_lead_idx;
drop index if exists lead_captured_facts_tenant_lead_idx;
drop index if exists lead_pii_username_active_lead_idx;
drop index if exists lead_events_tenant_lead_occurred_idx;
