-- Up Migration
-- Nothing anywhere previously persisted what the bot actually sent back to
-- a lead — leadEventReplyHandler.ts calls sendInstagramMessage/
-- sendInstagramCommentReply directly against Meta's API and the reply text
-- was never written to our own DB, so the dashboard timeline (lead_events +
-- lead_activity) only ever showed half a conversation (the customer's
-- messages, never the bot's replies). One row per actual channel send — a
-- 'both'-channel campaign produces two rows for one triggering lead_event,
-- matching the two real Instagram API calls actually made, not one row per
-- inbound event.
create table sent_replies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  lead_id uuid not null references leads(id),
  lead_event_id uuid not null references lead_events(id),
  channel text not null,
  engine text not null,
  text text not null,
  sent_at timestamptz not null default now(),
  constraint sent_replies_channel_check check (channel in ('dm', 'comment')),
  constraint sent_replies_engine_check check (engine in ('rule_based', 'ai_generated'))
);
create index sent_replies_tenant_lead_sent_at_idx on sent_replies (tenant_id, lead_id, sent_at);

-- Down Migration
drop table sent_replies;
