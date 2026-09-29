-- Up Migration
-- Inbox "Unread" filter: nothing anywhere previously tracked whether a
-- human had looked at a conversation. Tenant-wide (not per-member) — the
-- same granularity as pipeline_stage/handoff_status on this table, not a
-- per-user lead_reads table, since nothing else in this schema tracks
-- per-teammate state either. NULL means "never opened."
alter table leads add column last_read_at timestamptz;

-- Down Migration
alter table leads drop column last_read_at;
