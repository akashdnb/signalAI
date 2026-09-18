-- Up Migration
-- Reply Engine Selection (roadmap Phase 1): per campaign, not global.
-- rule_based ships as the fail-closed path for the AI spend ceiling (B10)
-- and provider outages, so it is required infrastructure, not a lesser
-- mode — every campaign needs a usable default reply regardless of
-- reply_mode.
alter table campaigns add column reply_mode text not null default 'rule_based';
alter table campaigns add constraint campaigns_reply_mode_check
  check (reply_mode in ('rule_based', 'ai_generated'));

alter table campaigns add column reply_templates text[] not null default array[]::text[];
alter table campaigns add column default_reply_template text not null default
  'Thanks for your comment! We''ll be in touch shortly.';

-- Down Migration
alter table campaigns drop constraint campaigns_reply_mode_check;
alter table campaigns drop column reply_mode;
alter table campaigns drop column reply_templates;
alter table campaigns drop column default_reply_template;
