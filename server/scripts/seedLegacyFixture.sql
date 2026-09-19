-- Synthetic reproduction of the pre-refactor messy production shape (per
-- docs/improvement_plan.md's U7 description), used only to test
-- claimLegacyTenants.ts and cleanupSelfLeads.ts against signalai_test.
-- Not meant to be run anywhere else.

insert into tenants (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'orphan-1'),
  ('00000000-0000-0000-0000-000000000002', 'orphan-2'),
  ('00000000-0000-0000-0000-000000000003', 'orphan-3'),
  ('00000000-0000-0000-0000-000000000004', 'trap-tenant'),
  ('00000000-0000-0000-0000-000000000005', 'real-tenant');

-- trap-tenant: has a campaign but never actually connected Instagram
-- (zero meta_tokens rows) — must NOT be auto-deleted.
insert into campaigns (id, tenant_id, name, keywords) values
  ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000004', 'trap campaign', array['test']);

-- real-tenant: connected account + a real lead + a self-lead (the
-- webhook-echo bug's own-account-id-as-lead artifact).
insert into meta_tokens (tenant_id, instagram_account_id, encrypted_token, key_version, expires_at) values
  ('00000000-0000-0000-0000-000000000005', 'ig-account-500', '\x00', 'v1', now() + interval '60 days');

insert into leads (id, tenant_id, instagram_user_id) values
  ('00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000005', 'ig-real-user-1'),
  ('00000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-000000000005', 'ig-account-500');

insert into lead_events (id, tenant_id, lead_id, meta_event_id, event_type, occurred_at, sequence) values
  ('00000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000052', 'evt-self-1', 'comment', now(), 1);
