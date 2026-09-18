-- Up Migration
-- Token vault (roadmap Phase 1 Security Foundations): "the highest-value
-- target in the system." encrypted_token is envelope-encrypted (AES-256-GCM;
-- iv + auth tag + ciphertext concatenated) with a key held outside the
-- database — see src/lib/tokenVault.ts. key_version records which key
-- encrypted this row, so keys can rotate without a blocking migration.
create table meta_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),

  -- The creator's own connected professional account (not an end-user's
  -- id — that's leads.instagram_user_id).
  instagram_account_id text not null,

  encrypted_token bytea not null,
  key_version text not null,

  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index meta_tokens_tenant_account_idx
  on meta_tokens (tenant_id, instagram_account_id);

-- Down Migration
drop table meta_tokens;
