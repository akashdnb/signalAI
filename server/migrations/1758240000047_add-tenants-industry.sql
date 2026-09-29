-- Up Migration
-- Onboarding wizard (UI revamp R5): which vertical a tenant picked during
-- the first-run wizard. NULL means "hasn't gone through the wizard yet" —
-- picking 'other' still writes a real value, so this is a genuine
-- tri-state (never-onboarded vs. explicitly-declined vs. a real industry),
-- not just "unset".
alter table tenants add column industry text
  check (industry in ('real_estate', 'ecommerce', 'education', 'creator', 'coach', 'agency', 'other'));

-- Down Migration
alter table tenants drop column industry;
