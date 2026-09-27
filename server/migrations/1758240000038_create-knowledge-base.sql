-- Up Migration
-- Phase 2C Per-Tenant Knowledge Base + Tenant-Isolated Retrieval: first use
-- of pgvector in this repo (per the roadmap's own Tech Stack decision —
-- pgvector inside the existing Postgres, no separate vector DB).
create extension if not exists vector;

-- One row per uploaded document version. "versioned, re-embeddable on
-- update" means a new upload creates a new row (version incremented,
-- prior version's superseded_at stamped) rather than mutating one in
-- place — retrieval only ever queries the latest 'ready' version per
-- tenant, so an in-progress re-upload never serves half-updated content.
create table knowledge_base_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  filename text not null,
  content_type text not null,
  storage_key text not null,
  version integer not null,
  status text not null default 'processing',
  error_reason text,
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  constraint knowledge_base_documents_status_check check (status in ('processing', 'ready', 'failed'))
);
create index knowledge_base_documents_tenant_status_idx on knowledge_base_documents (tenant_id, status);

-- tenant_id is denormalized here (also reachable via document_id) on
-- purpose — retrieval filters directly on this column, never joining out
-- to knowledge_base_documents first, matching the defense-in-depth
-- pattern already used by every other tenant-scoped table in this schema:
-- a leak here is a live AI reply exposing another tenant's data, not just
-- a dashboard bug (roadmap Phase 2C Tenant-Isolated Retrieval).
--
-- embedding dimension (768) matches Gemini's text-embedding-004 — this is
-- a code-level assumption, not something Postgres enforces beyond the
-- fixed-length vector column; switching embedding models requires a new
-- migration to resize this column (and re-embedding every existing row).
create table knowledge_base_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references knowledge_base_documents(id),
  tenant_id uuid not null references tenants(id),
  chunk_index integer not null,
  content text not null,
  embedding vector(768) not null,
  created_at timestamptz not null default now()
);
create index knowledge_base_chunks_tenant_id_idx on knowledge_base_chunks (tenant_id);
create index knowledge_base_chunks_document_id_idx on knowledge_base_chunks (document_id);

-- Down Migration
drop table knowledge_base_chunks;
drop table knowledge_base_documents;
drop extension if exists vector;
