# Changelog

Chronological log of shipped changes, newest first. Each entry names the driving problem, what changed, and any follow-up it leaves open — `docs/reviews.md` is where those get reviewed and closed out, this file is just the record of what shipped and why.

---

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
