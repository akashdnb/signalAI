-- Up Migration
-- PII / event-fact separation (roadmap Phase 1 Platform Foundations): content
-- lives here, 1:1 with the event that carried it, never in lead_events.
-- lead_id is denormalized onto this row (not just reachable via the event)
-- so a deletion request can hard-scrub every PII row for a lead in one
-- statement without joining through lead_events first.
--
-- Note: leads.instagram_user_id is also treated as scrubbable PII by the
-- deletion path, even though it lives on the leads table rather than here —
-- it is the routing key for the identity spine, not exempt from erasure.
create table lead_pii (
  lead_event_id uuid primary key references lead_events(id),
  lead_id uuid not null references leads(id),

  comment_text text,
  dm_text text,
  username text,
  phone text,

  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index lead_pii_lead_id_idx on lead_pii (lead_id);

-- Down Migration
drop table lead_pii;
