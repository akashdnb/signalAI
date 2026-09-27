# Changelog

Chronological log of shipped changes, newest first. Each entry names the driving problem, what changed, and any follow-up it leaves open — `docs/reviews.md` is where those get reviewed and closed out, this file is just the record of what shipped and why.

---

## 2026-09-28 — DM Conversation Continuation + Timeline Shows Bot Replies

Two fixes surfaced by a real live conversation (migrations `1758240000040`–`1758240000041`):

- **DM Conversation Continuation.** Keyword matching (`lib/keywordMatch.ts`) was entirely stateless per-message — it never looked at whether a lead already had an ongoing conversation. A customer replying in their own words without repeating an exact configured keyword mid-conversation got silently dropped (no reply, no trace beyond a bare timeline row). Fixed via a new `leads.active_dm_campaign_id`, set on every real keyword match for a DM event and read as a fallback when a later message in the same still-open 24h messaging window doesn't independently match anything — surfaced in the timeline via a `(ongoing conversation)` sentinel keyword so it's visibly distinguishable from a genuine silent non-match. Comments are deliberately excluded (not a private ongoing conversation the same way); a since-disabled or comment-only-switched campaign correctly stops continuing.
- **Timeline now shows the bot's own replies.** Nothing anywhere previously persisted what the bot actually sent back — `leadEventReplyHandler.ts` called Meta's API directly and the dashboard timeline only ever showed the customer's half of the conversation. New `sent_replies` table, one row per actual channel send (a `'both'`-channel campaign produces two rows for one triggering event, matching the two real API calls made), merged into `getLeadTimeline` alongside `lead_events`/`lead_activity` and rendered in `LeadDetailPage.tsx`.
- Verified: 528/528 passing (25 new tests), migrations re-tested up/down, client build/lint clean.

---

## 2026-09-27 — Phase 2C Slice 1: Conversational AI Engine (RAG core)

**RAG-engine slice of Phase 2C shipped** (migrations `1758240000038`–`1758240000039`) — Per-Tenant
Knowledge Base, Tenant-Isolated Retrieval, Client Guardrails, Grounded-Answer-Only Fallback, wired
into the existing Reply Engine and Milestone Engine. **Lead Scoring is a separate fast-follow, not
part of this slice.** Built ahead of the roadmap's own Phase 2C gate (a usage metric this codebase
doesn't instrument anywhere) at explicit direction, same as Phase 2A was. Full detail in
`claude_fixes/2026-09-27-phase-2c-slice1-rag-engine.md`.
- `pgvector` (first use in this repo) for tenant-isolated retrieval; Neon's S3-compatible storage
  for uploaded source documents; a dedicated `EmbeddingProvider` abstraction fully decoupled from
  the existing chat `LLMProvider` — not every chat host also serves embeddings, so these were never
  assumed to be the same provider.
- Knowledge base documents are versioned by `(tenant_id, filename)`: re-uploading a filename
  supersedes the prior version only once the new one is actually `ready`, never dropping retrieval
  coverage mid-processing; a failed re-embed leaves the prior ready version serving retrieval
  untouched.
- The load-bearing distinction in `knowledgeRetrieval.ts`: a tenant with **no knowledge base at
  all** gets zero change in behavior (RAG is simply inactive for them — every pre-Phase-2C reply
  path is untouched), versus one with a knowledge base but **nothing grounded enough to answer
  from**, which is the actual Grounded-Answer-Only Fallback trigger (pauses automation via
  `handoffStatus: 'human'`). Conflating these two would have been a severe regression for every
  existing tenant, not a safety improvement.
- Client Guardrails (`forbidden_topics`, `escalation_triggers`, `brand_voice`) layer onto Phase 1's
  Global Guardrails as narrowing-only — the global checks are never passed a tenant config that
  could loosen or bypass them. `brand_voice` is prompt steering, wrapped in the same
  tenant-authored-data delimiters `milestoneEngine.ts` already uses for `goalDescription` (R3-03) —
  identical threat model.
- Verified beyond typecheck/tests: 504/504 passing (78 new), every safety-critical path (tenant
  isolation, superseded-version exclusion, fail-closed ingestion, escalation/grounded-fallback
  handoff) checked against a real Postgres with a locally-built pgvector 0.8.0, not mocked; `npm
  audit` clean (excluded `unpdf`'s optional `canvas` dependency, which pulled in a critical
  `node-tar` CVE via a feature — PDF-to-image rendering — this slice never calls); and a real
  Playwright browser run driving actual sign-up, both new dashboard panels, a real multipart
  upload reaching the real ingestion pipeline, and a full guardrails-config save/reload/persist
  round trip.
- **Deliberately not built, flagged rather than silently dropped:** Lead Scoring (fast-follow),
  DOCX/other document formats, a pgvector ANN index (unindexed scan is fine at pilot scale), and
  bulk re-embedding on an embedding-model change.

## 2026-09-22 — Phase 2B: Billing & Monetisation

**Full Phase 2B feature set shipped** (migrations `1758240000034`–`1758240000037`), except the
WhatsApp Cost Line sub-item (still explicitly Phase 3-gated). Full detail in
`claude_fixes/2026-09-22-phase-2b-billing.md`.
- LLM provider interface change first: `generateReply` now returns `{ text, usage? }` instead of a
  plain string, so real token counts feed the new Per-Tenant Usage Ledger (`token_usage`, unique
  on `lead_event_id` for retry-safe idempotency) rather than an estimate. Propagated through
  `replyEngine.ts`, `milestoneEngine.ts`, and every mock provider across 5 test files.
- Free Trial Period (`tenants.plan_tier`/`trial_started_at`/`trial_ends_at`) with a real Trial
  Token Allowance enforced in `leadEventReplyHandler.ts` (fail-closed to rule-based, composed onto
  the existing per-account spend guard) and a Trial-Abuse Guardrail (`instagram_trial_history`)
  wired into the Instagram OAuth callback — an account that already had a trial under one tenant
  can't grant a second tenant a fresh one.
- Plan Tiers (trial/starter/growth — hardcoded in `lib/planTiers.ts`, no admin surface at pilot
  scale) extending Phase 1's single flat Stripe plan: checkout now accepts a tier, stamped as
  Checkout session metadata so the webhook can set `plan_tier` without a second Stripe round-trip.
- Daily Usage Rollup → Stripe Metered Billing: a daily cron job (`services/usageRollupService.ts`)
  aggregates `token_usage` and best-effort-syncs it to Stripe's Billing Meter Events API — a
  tenant with nothing to report is resolved immediately, a real Stripe failure is left for the
  next run to retry, never silently dropped.
- Usage Visibility Dashboard (`GET /tenants/:id/usage` + `BillingPanel.tsx`): tokens/DMs used vs.
  tier allowance, soft-cap warnings, and a locally-estimated overage cost (explicitly framed as an
  estimate — Stripe's own tiered pricing is authoritative once usage lands there).
- Found and fixed a real bug via testing: the daily rollup's date-range query compared a
  `timestamptz` against a bare date literal, correct only if the Postgres session's timezone
  happens to be UTC — this dev machine runs `Asia/Kolkata`, and the test caught it immediately (0
  rows instead of 2). Fixed by converting to UTC wall-clock time explicitly before comparing.
- Verified beyond typecheck/tests: full suite (431/431, ~78 new tests) passing, all 4 migrations
  re-tested against a DB with pre-existing rows, and the trial/tier/usage UI driven end-to-end
  through a real browser — signup, trial countdown, tier upgrade buttons, and a graceful-failure
  path against a deliberately invalid Stripe key, zero unexpected console errors throughout.
- **Deliberately not enforced, flagged rather than silently dropped:** the `connectedAccounts`
  tier quota is informational only (the system supports exactly one connected Instagram account
  per tenant today, regardless of tier), and `campaigns`/`connectedAccounts` quotas have no hard
  block at creation time — only usage (DMs/tokens) gets soft-cap warnings and a real trial
  allowance block, matching the roadmap's own "warn, don't hard-block" framing.

## 2026-09-21 — Phase 2A: Lead Capture & CRM

**Full Phase 2A feature set shipped** (migrations `1758240000029`–`1758240000033`)
- Built ahead of Phase 1's own "Gate to Phase 2A" (App Review approval, pilot usage thresholds), at explicit direction, so it's ready to run in parallel with Phase 0's compliance track rather than wait on it.
- New: `deals` (the Phase 2A Data Model Amendment — schema now, UI later), `leads.pipeline_stage`/`owner_user_id`/`handoff_status`, `lead_notes`, `tags`/`lead_tags`, `lead_activity` (a CRM-originated audit trail kept deliberately separate from `lead_events`, which is specifically the Meta-webhook-driven pg-boss-FIFO log — a dashboard click has no `meta_event_id`). Full detail in `claude_fixes/2026-09-21-phase-2a-lead-crm.md`.
- Human Handoff actually pauses automation: `leadEventReplyHandler.ts` skips reply generation/sending while `handoffStatus === 'human'`, and auto-escalates to `'requested'` the first time a lead's AI spend cap is hit.
- Multiple DM Variations: `campaign.replyTemplates` existed on the schema since Phase 1 but was never read — `replyEngine.ts` now picks one at random when the array is non-empty, unchanged behavior otherwise.
- Email Alerts (Resend) shipped as a second channel alongside Telegram, sent to the tenant owner, best-effort.
- New frontend: `LeadDetailPage.tsx` (pipeline/ownership/handoff/tags/notes/deals/timeline), dashboard lead filters + Top Performing Posts/Top Trigger Keywords, campaign editor's Reply Variations section.
- Verified end-to-end in a real browser (Playwright against the live dev server + Postgres, not mocked) — full login flow, every new lead-detail action, campaign reply variations — zero console/HTTP errors. Backend: 400/400 tests passing, migrations re-verified against a DB with pre-existing rows (not just an empty one, after the Phase 1 backfill bug).
- **Deliberately not built, not silently dropped:** Automatic Tags (only manual tagging shipped; `lead_tags.source` already distinguishes manual/automatic for a later auto-tagger) and Live Agent Takeover's actual reply-compose UI (pausing the bot works today; a human still replies from the Instagram app directly, not from this dashboard yet).

## 2026-09-21 — Customer/Lead identity split (Phase 1 complete)

**Add the `customers`/`customer_id` foundation** (migration `1758240000028`)
- A full audit of `docs/signalAI_roadmap.md` Phase 1 against the codebase found every other checklist item already shipped and tested; this was the one gap, surfaced by reviewing an external CRM/Revenue Intelligence architecture doc against the roadmap (see `docs/architecture_and_ui_roadmap.md`).
- Today `lead_id` *is* the identity everything keys on — that breaks once a real person can plausibly generate a second lead (a repeat Reel engager, a second campaign touch). Added a minimal `customers` table and a `customer_id` column on `leads`, minted 1:1 with each lead for now via `findOrCreateLeadByInstagramUserId` (`server/src/db/leads.ts`), gated on the insert actually firing (`is_new`/`xmax = 0`) so a flood of repeat comments from an existing lead never mints an orphan customer row. Rides the caller's existing transaction (`webhookIngestService.ts`), so a crash between the lead insert and the customer link can't leave a committed lead without one.
- No behavior change — `customer_id` has zero consumers yet; it's the seam Phase 2A's CRM and Phase 3's identity resolution attach to. Pulled forward into Phase 1 rather than left for Phase 2A specifically because it's cheap now, on the small schema, and expensive to retrofit once tags/notes/ownership/pipeline all reference `lead_id` directly.
- `resetDb` test helper (`server/src/__tests__/helpers/db.ts`) updated to truncate `customers` — it wasn't reachable by the existing truncate's cascade, which briefly leaked rows across tests in the same file.
- **Follow-up fix same day:** the first version of this migration's backfill set `leads.customer_id` to a fresh `gen_random_uuid()` before the matching `customers` row existed, which is a foreign-key violation checked immediately (the constraint isn't deferrable) — failed Render's deploy, caught before it reached a live migration since node-pg-migrate rolled the failed transaction back cleanly. Missed locally because the first local test ran against an empty database, where the backfill's `where customer_id is null` matched zero rows. Fixed by inserting `customers` rows first (reusing each lead's own `id` as its customer's `id`, avoiding an unreliable correlation between a freshly generated UUID and its lead), then linking `leads.customer_id` to it. Re-verified this time against a scratch DB seeded with pre-existing `leads` rows before migrating, plus a full suite re-run. See `claude_fixes/2026-09-21-customer-lead-split-backfill-fk-fix.md`.

## 2026-09-21 — Post-targeting UX, campaign trigger source, permission corrections

**Enrich the post-targeting picker; let a post be added by URL** (migration `1758240000027`)
- `GET /tenants/:id/observed-media` no longer shows a bare numeric media id — it now lazily enriches each entry with cached Graph API metadata (caption, thumbnail, permalink) via a new `media_metadata` table, fetching whatever's missing one media at a time and caching it (`server/src/lib/instagramMedia.ts`, `server/src/db/mediaMetadata.ts`).
- New `POST /tenants/:id/known-media` resolves a pasted post/Reel URL against the connected account's own media (matched by shortcode — there's no direct shortcode→media-id lookup) so a post can be targeted before any comment on it exists.
- Requires `instagram_business_basic`, already requested in the OAuth scope.
- Found and fixed along the way: `usernameResolutionQueue.test.ts` never cleared leftover `pgboss.job` rows between runs, letting jobs a sibling test file enqueues-but-never-consumes accumulate across every full-suite run until they pushed a real job past its timeout.

**Campaign trigger source: comment, message, or both** (migration `1758240000026`)
- Campaigns could previously only ever be triggered by a keyword in a comment. Added `campaigns.trigger_source` (`comment` / `message` / `both`, default `comment` — no behavior change for existing campaigns). `webhookIngestService.ts` now matches DM text too, scoped to campaigns whose `trigger_source` allows it.
- Distinct from `reply_channel` (where the reply is delivered) — a DM-triggered event still can't produce a public comment reply (no comment to attach to), which already degraded safely from the earlier reply-channel work with no new code needed.

**Corrected the comment-reply permission name**
- Code comments and UI copy referenced a guessed `instagram_manage_comments` scope; the actual (and already-requested, since an earlier commit) scope is `instagram_business_manage_comments`. Fixed in `instagramSend.ts` and `CampaignEditor.tsx`.

## 2026-09-20 — Post targeting, reply channels, email OTP login, lead observability

**Per-post targeting + reply-channel config for campaigns** (migration `1758240000024`)
- Comments were matched against every enabled campaign tenant-wide, with no notion of which post they were on, and every reply always went out as a DM regardless of the existing "comment" vs "dm" prompt tier.
- Added `campaigns.target_media_ids` (empty = every post, the prior behavior) and `campaigns.reply_channel` (`dm` / `comment` / `both`, default `dm`). Added `sendInstagramCommentReply` (`POST /{comment-id}/replies`) alongside the existing DM send. `leadEventReplyHandler.ts` gates each delivery channel independently — DM needs the 24h messaging window and the 750/hour cap; a public reply needs only the comment id and isn't capped.
- The post picker itself shipped bare-media-id-only in this round; enriched and given an add-by-URL option the next day (see above).

**Replaced magic-link login with email OTP**
- The magic-link flow required a top-level browser navigation away from the app (open the email, click the link, land back via a redirect carrying the session in a URL fragment) — this read as broken whenever the link opened in a different browser than the one signing in.
- New `email_otp_codes` table (HMAC-hashed 6-digit codes, 10-minute TTL, a 5-attempt lockout per code — a 6-digit space needs its own brute-force cap beyond the existing per-email/per-IP issuance rate limit). `POST /auth/email/verify` now returns the session directly in its JSON response instead of redirecting. `magic_link_tokens` was left in place, unread, per this repo's own expand/contract convention (`docs/reviews.md` R15-02) — dropping it in the same deploy that stops reading it would break the prior deploy's code during Render's staged rollout overlap. **Follow-up still open: drop `magic_link_tokens` in a later migration once the OTP deploy is confirmed live.**
- Follow-up fix the same day: `RESEND_API_KEY` being set doesn't mean a code actually got emailed — Resend's shared sandbox sender 403s ("you can only send testing emails to your own email address") for every recipient but the Resend account owner, until a custom domain is verified. The code is now logged as a fallback on a failed send too, not only when Resend is unconfigured. **Follow-up still open: verify a custom sending domain in Resend once one is available (Render's own `*.onrender.com` subdomain can't be verified — no DNS control over it).**

**Distinguish comment vs. DM leads; resolve usernames for DM-only leads**
- The Leads table had no way to tell whether a lead's contact was a public comment or a DM, and every DM-only lead (including one whose first contact is a shared Reel, which also arrives as a message event) showed as "(unknown)" — Meta's Messaging webhook only ever supplies the sender's IGSID, never a username, unlike Comments.
- Added a "Via" column sourced from each lead's most recent event type. Added a background queue (`usernameResolutionQueue.ts`) that resolves a real username via Meta's profile lookup for any event that arrives without one, writing it into the existing `lead_pii` row (covered by the existing deletion scrub for free, no new PII location) rather than the ingest path itself, which stays fast/local by design.

---

*Entries before this point were not retroactively logged here — see `git log` and `docs/reviews.md` for the project's history prior to 2026-09-20.*
