-- Up Migration
-- Caches Graph API media metadata (caption/thumbnail/permalink) so the
-- post-targeting picker can show something a creator recognizes instead of
-- a bare numeric media id, and so a post can be added by pasting its URL
-- before any comment on it has ever arrived. Not PII — a post's own
-- caption is the creator's own already-public content, not a lead's.
create table media_metadata (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  media_id text not null,
  caption text,
  media_type text,
  thumbnail_url text,
  permalink text,
  posted_at timestamptz,
  fetched_at timestamptz not null default now()
);
create unique index media_metadata_tenant_media_idx on media_metadata (tenant_id, media_id);

-- Down Migration
drop table media_metadata;
