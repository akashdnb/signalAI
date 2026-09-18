-- Up Migration
-- R1-06 review fix: lead_pii was missing tenant_id, breaking "every
-- customer-data table carries tenant_id from migration 1." A join
-- through lead_events happened to keep the one read path (getEventForReply)
-- safe, but any direct query — an analytics rollup, a bulk scrub, a
-- debugging session — had no tenant guard.
alter table lead_pii add column tenant_id uuid references tenants(id);

update lead_pii p set tenant_id = l.tenant_id
from leads l where l.id = p.lead_id;

alter table lead_pii alter column tenant_id set not null;
create index lead_pii_tenant_id_idx on lead_pii (tenant_id);

-- Down Migration
drop index lead_pii_tenant_id_idx;
alter table lead_pii drop column tenant_id;
