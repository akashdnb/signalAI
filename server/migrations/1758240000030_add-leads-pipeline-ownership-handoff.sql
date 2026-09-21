-- Up Migration
-- Phase 2A Pipeline Management + Lead Ownership/Assignment + Human Handoff.
-- All three are projection fields on `leads`, the same pattern
-- `active_milestone_id` already uses — current state lives here, the
-- narrative of how it got there lives in lead_activity (migration
-- 1758240000033), not in lead_events (that table is specifically the
-- Meta-webhook-driven, pg-boss-FIFO-processed pipeline; a dashboard click
-- has no meta_event_id and isn't ordered against anything).
alter table leads add column pipeline_stage text not null default 'new';
alter table leads add constraint leads_pipeline_stage_check
  check (pipeline_stage in ('new', 'contacted', 'qualified', 'meeting_scheduled', 'won', 'lost'));

alter table leads add column owner_user_id uuid references users(id) on delete set null;

-- 'ai' (default): the Reply Engine replies automatically, same as today.
-- 'requested': Agent Escalation fired (a guardrail fallback or a manual
-- request) — still auto-replying until a human actually claims it, but
-- flagged for attention.
-- 'human': Live Agent Takeover — leadEventReplyHandler.ts skips
-- AI/rule-based reply generation entirely while this is set, so a human
-- and the bot never talk over each other.
alter table leads add column handoff_status text not null default 'ai';
alter table leads add constraint leads_handoff_status_check
  check (handoff_status in ('ai', 'requested', 'human'));

create index leads_owner_user_id_idx on leads (owner_user_id);
create index leads_pipeline_stage_idx on leads (tenant_id, pipeline_stage);

-- Down Migration
drop index leads_pipeline_stage_idx;
drop index leads_owner_user_id_idx;
alter table leads drop column handoff_status;
alter table leads drop column owner_user_id;
alter table leads drop column pipeline_stage;
