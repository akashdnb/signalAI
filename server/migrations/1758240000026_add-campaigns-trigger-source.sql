-- Up Migration
-- Campaigns could only ever be triggered by a keyword in a COMMENT — a DM
-- keyword match didn't exist at all, distinct from reply_channel (which
-- controls where the REPLY goes, not what triggers it). Default 'comment'
-- preserves every existing campaign's current behaviour exactly.
alter table campaigns add column trigger_source text not null default 'comment';
alter table campaigns add constraint campaigns_trigger_source_check
  check (trigger_source in ('comment', 'message', 'both'));

-- Down Migration
alter table campaigns drop constraint campaigns_trigger_source_check;
alter table campaigns drop column trigger_source;
