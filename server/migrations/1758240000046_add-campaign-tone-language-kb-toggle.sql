-- Up Migration
-- AI Behaviour panel (UI revamp R3): a real Tone enum, a real reply
-- Language setting, and a per-campaign Knowledge Base toggle — none of
-- these existed before. use_knowledge_base defaults true so every existing
-- campaign keeps today's always-on-whenever-a-KB-exists behavior unchanged.
alter table campaigns add column tone text not null default 'professional_and_friendly'
  check (tone in ('professional', 'friendly', 'casual', 'professional_and_friendly'));
alter table campaigns add column language text not null default 'auto'
  check (language in ('auto', 'en', 'hi'));
alter table campaigns add column use_knowledge_base boolean not null default true;

-- Down Migration
alter table campaigns drop column tone;
alter table campaigns drop column language;
alter table campaigns drop column use_knowledge_base;
