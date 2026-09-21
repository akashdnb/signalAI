# 2026-09-21 — Phase 2A: Lead Capture & CRM

Implemented the full Phase 2A feature set from `docs/signalAI_roadmap.md`, built ahead of its own
"Gate to Phase 2A" (App Review approval, pilot usage thresholds) at explicit direction — ready to run
in parallel with Phase 0's compliance track rather than blocked on it.

## Schema (5 new migrations, 1758240000029–33)
- `deals` — the Phase 2A Data Model Amendment (schema now, UI later): `customer_id`/`lead_id`/`stage`/`value`/`currency`/`owner_user_id`/`won_at`/`lost_at`.
- `leads.pipeline_stage` / `owner_user_id` / `handoff_status` — projection columns, same pattern as the existing `active_milestone_id`.
- `lead_notes` — internal notes/comments.
- `tags` + `lead_tags` — tenant vocabulary + join, with a `source` column (`manual`/`automatic`) already in place for a future auto-tagging feature.
- `lead_activity` — a CRM-originated audit trail, deliberately kept separate from `lead_events` (the Meta-webhook-driven, pg-boss-FIFO-processed log) since a dashboard action has no `meta_event_id` and needs no worker.

## Backend
- `db/deals.ts`, `db/leadNotes.ts`, `db/tags.ts`, `db/leadActivity.ts`, `db/leadTimeline.ts` (merges `lead_events` + `lead_activity` by timestamp at read time).
- `db/leads.ts` extended: `updatePipelineStage`, `assignLeadOwner`, `updateHandoffStatus`, `listLeadsForTenant` filters (stage/owner/tag/search).
- `db/analytics.ts` extended: `getTopPosts`, `getTopKeywords` (the two Phase 1 "carried forward" analytics items).
- `db/campaigns.ts` / `routes/campaigns.ts`: `setCampaignReplyTemplates` — Multiple DM Variations, reading the `reply_templates` column that existed since Phase 1 but was never consumed.
- `services/replyEngine.ts`: `pickReplyTemplate` — picks uniformly at random from `campaign.replyTemplates` when non-empty, falls back to `defaultReplyTemplate` otherwise (no behavior change for existing campaigns).
- `services/leadEventReplyHandler.ts`: Human Handoff gating — skips reply generation/sending entirely when `handoffStatus === 'human'`; auto-escalates to `'requested'` the first time the AI spend cap is hit (guarded so it only fires once, never overwrites an existing human/requested state).
- `queue/alertsQueue.ts` + `lib/resend.ts`: Email Alerts (Resend) as a second channel alongside Telegram, sent to the tenant owner, best-effort (never blocks the Telegram send or fails the job).
- `routes/leads.ts` — new router: lead detail/timeline, pipeline+ownership PATCH, handoff actions, notes CRUD, tags CRUD, deals CRUD, tenant members list, top-posts/top-keywords.
- `lib/tenantAuth.ts`: `requireTenantSession` now attaches `req.tenantSession` — the first place past the auth check itself that needed "which user did this" (notes/pipeline/handoff/tag activity all record an actor).

## Frontend
- `pages/LeadDetailPage.tsx` (new route `/dashboard/:tenantId/leads/:leadId`): pipeline stage + owner dropdowns, handoff action buttons, tags, notes, deals, unified timeline.
- `pages/DashboardPage.tsx`: clickable lead rows, stage filter + username search, Top Performing Posts / Top Trigger Keywords card.
- `components/CampaignEditor.tsx`: "Reply variations" editor (add/remove/save `replyTemplates`).

## Verified
- `npm run typecheck` and `npm test` (400/400 passing across 57 files, including ~85 new tests) against a freshly migrated Postgres DB — migrations tested with pre-existing rows present, not just an empty DB (see the earlier FK-violation fix for why that matters).
- Client `npm run build` clean.
- **End-to-end in a real browser** (Playwright against the actual dev server + Postgres, not mocked): full login flow, dashboard empty states, inserted a real lead via SQL, then in the browser: changed pipeline stage, took over and released a handoff, added a note, added a tag, created a deal and marked it won, confirmed all of it appeared correctly in the Timeline — zero console errors, zero failed HTTP requests throughout. Also created a campaign and verified the Reply Variations editor saves correctly.

## Deliberately not built (flagged in the roadmap, not silently dropped)
- **Automatic Tags** — only manual tagging shipped. `lead_tags.source` already distinguishes `'manual'`/`'automatic'` so adding a rule-based or AI-driven auto-tagger later is additive, not a retrofit.
- **Live Agent Takeover's actual reply-sending UI** — a human can pause the bot (automation stops immediately) but there's no in-app compose box yet; today they'd still reply from the Instagram app directly. Pausing was the safety-critical half; the compose UI is a smaller follow-up.
