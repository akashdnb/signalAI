-- Up Migration
-- Distinct from last_applied_sequence (how far the worker has gotten):
-- this is assigned at ingestion time, atomically incremented per lead, so
-- concurrent webhook deliveries for the same lead never collide on the
-- same sequence number.
alter table leads add column next_sequence bigint not null default 0;

-- Down Migration
alter table leads drop column next_sequence;
