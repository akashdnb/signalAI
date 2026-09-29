-- Up Migration
-- Conversation memory (human replies): a human agent replying directly in
-- the Instagram app, outside this system, previously left no trace anywhere
-- — instagramWebhookParser.ts dropped every echo of an outbound DM
-- (bot-sent or human-sent alike) to avoid the phantom-lead bug recorded in
-- its own comments. Echoes are now ingested and correlated against our own
-- sends by Meta's message id: a match means "this is just Meta confirming
-- our own send," a miss means a human sent it directly and it's recorded
-- here as engine 'human' so it reaches the dashboard timeline and the LLM's
-- conversation history exactly like a bot reply does.
alter table sent_replies add column meta_message_id text;
create unique index sent_replies_meta_message_id_idx on sent_replies (meta_message_id) where meta_message_id is not null;

-- A human-originated echo isn't a reply to any one triggering lead_event in
-- our own pipeline — it's an independent send we only learn about after the
-- fact — so lead_event_id can no longer be mandatory.
alter table sent_replies alter column lead_event_id drop not null;

alter table sent_replies drop constraint sent_replies_engine_check;
alter table sent_replies add constraint sent_replies_engine_check check (engine in ('rule_based', 'ai_generated', 'human'));

-- Down Migration
alter table sent_replies drop constraint sent_replies_engine_check;
alter table sent_replies add constraint sent_replies_engine_check check (engine in ('rule_based', 'ai_generated'));
alter table sent_replies alter column lead_event_id set not null;
drop index sent_replies_meta_message_id_idx;
alter table sent_replies drop column meta_message_id;
