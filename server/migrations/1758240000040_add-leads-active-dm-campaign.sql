-- Up Migration
-- DM Conversation Continuation: keyword matching (lib/keywordMatch.ts) is
-- stateless per-message — it never looked at whether a lead already had an
-- ongoing conversation, so a customer replying in their own words without
-- repeating an exact configured keyword got silently dropped mid-
-- conversation. This column remembers which campaign a lead's DM
-- conversation currently belongs to (set on every real keyword match for a
-- DM event), so webhookIngestService.ts can fall back to it when a later
-- message in the same still-open messaging window (leads.window_open_until)
-- doesn't match any keyword on its own. Comments are deliberately excluded
-- (a public comment thread isn't a private ongoing conversation the same
-- way) — this column is only ever read/written for message-type events.
alter table leads add column active_dm_campaign_id uuid references campaigns(id);

-- Down Migration
alter table leads drop column active_dm_campaign_id;
