# 2026-09-27 — Phase 2C Slice 1: Conversational AI Engine (RAG core)

Implemented the RAG-engine slice of Phase 2C from `docs/signalAI_roadmap.md`: Per-Tenant
Knowledge Base, Tenant-Isolated Retrieval, Client Guardrails, and Grounded-Answer-Only Fallback,
wired into the existing Reply Engine and Milestone Engine. **Lead Scoring is an explicit
fast-follow**, not part of this slice — it consumes conversation data this slice produces, so
it's a clean separate commit rather than one bloated pass.

## Gate, addressed honestly
The roadmap gates Phase 2C on a usage metric (share of ungrounded-reply guardrail rejections,
count of FAQ-upload requests) that this codebase doesn't instrument anywhere, and there's no
evidence the equivalent Phase 1→2A gate was ever actually measured either. Built ahead of the
gate at explicit direction, same as Phase 2A — noted here rather than implying the metric was
checked.

## Tech stack decisions (confirmed with the user, not guessed)
- **Storage**: Neon's S3-compatible object storage via the standard AWS SDK (`@aws-sdk/client-s3`)
  — `AWS_ENDPOINT_URL_S3`/`AWS_REGION`/`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` are the SDK's own
  default env var names, so `new S3Client({})` picks them up with zero explicit config. Only the
  bucket name (`KB_S3_BUCKET`) needed a new config getter.
- **Vector store**: `pgvector` in the existing Neon Postgres, per the roadmap's own Tech Stack
  entry — first real use of it in this repo. Installed and built from source locally against
  Homebrew's `postgresql@14` (no prebuilt bottle exists for pg14 anymore) to actually verify the
  migration and every retrieval query against a real vector column, not just review the SQL by
  eye.
- **Embeddings**: a dedicated, separate `EmbeddingProvider` abstraction (`llm/embeddingProvider.ts`),
  independent of whatever `LLM_BASE_URL` is configured for chat — the user intends Gemini's
  OpenAI-compatible layer for embeddings and hosted Ollama for chat, and confirmed those are
  genuinely decoupled API surfaces. `openAICompatibleProvider.ts` already worked for Ollama's chat
  endpoint unmodified.
- **Document types**: PDF and plain text/Markdown only for this slice — `unpdf` for PDF extraction
  (pure JS, no native deps). DOCX and other formats deferred, unjustified until asked for.

## Schema (2 new migrations, 1758240000038–39)
- `knowledge_base_documents` / `knowledge_base_chunks` (`create extension if not exists vector`,
  `vector(768)` chunks) — versioned by `(tenant_id, filename)`: re-uploading a filename increments
  `version` and marks the prior `ready` row `superseded_at`, so an in-progress re-upload never
  drops retrieval coverage mid-processing.
- `tenant_guardrails_config` — one row per tenant (`brand_voice`, `forbidden_topics`,
  `escalation_triggers`); an absent row means "nothing configured," never "guardrails disabled."
- Both re-tested up AND down against the local test DB before building anything on top of them.

## Backend
- `llm/embeddingProvider.ts` + `llm/factory.ts`'s `createEmbeddingProviderFromEnv` — mirrors
  `openAICompatibleProvider.ts`'s exact shape; returns `null` (not a throw) when unconfigured, same
  graceful-degradation contract every optional integration in this codebase already follows.
- `lib/chunking.ts` — plain character sliding-window chunker, no tokenizer dependency.
- `lib/objectStorage.ts` — thin `S3Client` wrapper scoped to `config.kbS3Bucket`.
- `db/knowledgeBase.ts` — versioned document CRUD + `queryRelevantChunks` (tenant-filtered
  `<=>` cosine-distance scan; no ANN index yet, deferred until pilot-scale row counts justify one).
- `db/guardrailsConfig.ts` — plain get/upsert.
- `services/knowledgeBaseIngestion.ts` — parse → chunk → embed → upload original → write rows →
  mark `ready`, or `failed` with the reason on any step's exception. Fail-closed: the tenant's
  prior `ready` version, if any, is untouched and keeps serving retrieval the whole time.
- `services/knowledgeRetrieval.ts` — `retrieveContext` distinguishes **no knowledge base at all**
  (RAG simply inactive for that tenant — every pre-Phase-2C reply behavior is untouched) from
  **has one, but nothing matches this query well enough** (the actual Grounded-Answer-Only
  Fallback trigger). Getting this distinction wrong would have meant every AI reply for every
  tenant who never uploaded a document suddenly requiring human handoff — a severe regression,
  not a safety improvement — so it's load-bearing, not an afterthought.
- `lib/guardrails.ts` — `validateOutput` gained an optional `tenantConfig` parameter that can only
  *add* rejections, never touch `FORBIDDEN_OUTPUT_PATTERNS`; new `checkEscalationTriggers`
  (input-side, mirrors `classifyInput`'s shape). `brandVoice` is prompt steering, not a mechanical
  check — folded into the system prompt, wrapped in the same tenant-authored-data delimiters
  `milestoneEngine.ts` already uses for `goalDescription` (R3-03), since it's the identical threat
  model.
- `services/replyEngine.ts` / `milestoneEngine.ts` — both gained an optional `RagDependencies`
  parameter (pool, embeddingProvider, tenantGuardrailsConfig). Omitted entirely, behavior is
  byte-for-byte identical to before this phase — every pre-existing test in both files passed
  unchanged with zero edits. Escalation-trigger and retrieval checks run *before* the AI spend-cap
  reservation: neither ever burns a call slot for a reply that was never going to reach the
  provider anyway.
- `services/leadEventReplyHandler.ts` — fetches `tenantGuardrailsConfig` once per event; a new
  `requiresHumanHandoff` flag (escalation trigger match, or ungrounded-with-a-real-KB) flips
  `handoffStatus` to `'human'` — a real pause, unlike the existing `capExceeded` escalation which
  only sets `'requested'` (a flag, not a pause). The current turn's rule-based fallback still
  sends; only *future* turns are paused.
- `routes/knowledgeBase.ts` (multipart upload via `multer` 2.x — 1.x has known CVEs, confirmed via
  `npm audit`) + `routes/guardrailsConfig.ts`, both gated by the existing `requireTenantSession`.

## Frontend
- `api.ts` — new types + a `requestMultipart` helper (the existing `request()` is JSON-only;
  a browser sets its own multipart boundary header, which get lost if set manually).
- `KnowledgeBasePanel.tsx` / `GuardrailsConfigPanel.tsx` — plain function components matching
  `BillingPanel.tsx`'s conventions exactly, wired into `DashboardPage.tsx` alongside the existing
  panels (no tab system exists — panels are simply stacked).

## Verified
- `npm run typecheck` and `npm test` (server) — 504/504 passing across 70 files (78 new tests: 8
  chunking, 5 embedding provider, 6 knowledge retrieval, 11 knowledge-base DB, 4 guardrails config
  DB, 7 ingestion pipeline — including a real, correctly-generated PDF fixture, not a hand-rolled
  one (a hand-rolled minimal PDF without a real xref table silently truncated extracted text via
  pdf.js's repair-mode parser; generated via `cupsfilter` instead, verified byte-for-byte extracted
  text matches the source), 13 knowledge-base routes, 6 guardrails-config routes, plus new cases
  added to the existing replyEngine/milestoneEngine/leadEventReplyHandler/guardrails suites).
- Every safety-critical path verified against **real Postgres + a locally-built pgvector 0.8.0**,
  not mocked: tenant isolation (one tenant's chunks are structurally unreachable from another's
  query, not just filtered in application code), superseded-version exclusion, fail-closed
  ingestion (a mid-pipeline failure leaves the prior ready version serving retrieval, verified by
  actually querying it afterward), and the full escalation-trigger/grounded-fallback pause
  reaching real `handoffStatus` writes.
- `npm run build` and `npm run lint` (client) clean — zero new warnings; the two pre-existing
  oxlint warnings (`BillingPanel.tsx`, `CampaignEditor.tsx`) are unchanged from Phase 2B.
- `npm audit` — 0 vulnerabilities. `unpdf`'s optional `canvas` dependency (only used for
  PDF-page-to-image rendering, a feature this slice never calls) pulled in a critical `node-tar`
  CVE via `@mapbox/node-pre-gyp`; excluded via a package.json `overrides` entry scoped to
  `unpdf > canvas` specifically, rather than disabling optional dependencies project-wide (which
  would have broken esbuild/rollup's platform-binary optional deps that vitest needs).
- End-to-end in a real browser (Playwright, driving the actual dev server + the local Postgres):
  real email-OTP sign-up, both new panels render correctly alongside the existing ones, a real
  multipart file upload through the browser reaches the real ingestion pipeline (correctly fails
  closed with a clean error banner — no real S3 credentials exist in this dev environment, only
  the endpoint/region were provided, not access keys), and the Guardrails Config form's fill →
  save → reload → persist round trip verified with real data surviving a full page reload. Zero
  unexpected console errors (the one error captured was the expected/logged 502 from the
  object-storage-unconfigured case itself).

## Deliberately not built or not enforced, flagged rather than silently dropped
- **Lead Scoring subsystem** (AI/Intent/Engagement/Qualification scores, custom rules) — confirmed
  fast-follow with the user, reads data this slice produces.
- **DOCX and other document formats** — PDF + plain text/Markdown only.
- **pgvector ANN index** (ivfflat/hnsw) — unindexed `<=>` scan is correct and fast enough at pilot
  scale; an index needs existing rows to train against anyway.
- **Bulk re-embedding on embedding-model change** — versioning here means "re-upload creates a new
  version"; a job to re-embed every existing chunk after switching models is out of scope unless
  asked for.
- **Real object storage / embeddings credentials** — this dev environment has Neon's S3 endpoint
  and region but not real access keys, and no real Gemini API key; the ingestion pipeline's
  network calls were verified against a local mock embeddings server (for wire-format compatibility)
  with object storage deliberately left unconfigured (verifying the graceful-failure path is the
  correct thing to verify given what's actually available here) — a real end-to-end run needs the
  user's own credentials in the actual deploy target.
