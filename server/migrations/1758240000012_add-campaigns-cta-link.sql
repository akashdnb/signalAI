-- Up Migration
-- R3-06 review fix: neither reply path had anywhere to read a CTA link
-- from, so validateOutput's allowedLink was always undefined and every
-- generated link — including the campaign's own — was rejected. The CTA
-- is the one action the whole funnel exists to produce.
alter table campaigns add column cta_link text;

-- Down Migration
alter table campaigns drop column cta_link;
