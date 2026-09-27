# 2026-09-22 — Phase 2B: Billing & Monetisation

Implemented the full Phase 2B feature set from `docs/signalAI_roadmap.md`, except the WhatsApp
Cost Line sub-item (explicitly Phase 3-gated — no WhatsApp integration exists yet).

## LLM provider interface change (foundational, touched first)
`LLMProvider.generateReply` returned a plain `string`; now returns `{ text, usage? }` so real
token counts (when the provider reports them — every OpenAI-compatible endpoint does) can feed
the usage ledger instead of an estimate. Propagated through `replyEngine.ts`, `milestoneEngine.ts`
(threaded through every "the call was billed" fallback path, not just the happy path), and every
mock provider across 5 test files. Verified with the full suite before building anything on top
of it.

## Schema (4 new migrations, 1758240000034–37)
- `tenants.plan_tier` / `trial_started_at` / `trial_ends_at` — orthogonal to existing `billing_status`.
- `instagram_trial_history` — Trial-Abuse Guardrail: one row per Instagram account ever connected,
  across any tenant; never deleted, holds no PII.
- `token_usage` — Per-Tenant Usage Ledger, unique on `lead_event_id` for retry-safe idempotency.
- `daily_usage_rollup` — aggregated per-tenant-per-day, `synced_to_stripe_at` tracks best-effort
  Stripe sync status.

All 4 re-tested against a DB seeded with pre-existing rows before migrating (not just an empty
DB), per the lesson from the earlier Phase 1 customer/lead-split FK-violation bug.

## Backend
- `lib/planTiers.ts` — hardcoded tier definitions (trial/starter/growth), not a DB table — no
  admin surface exists at pilot scale.
- `lib/overage.ts` — a LOCAL ESTIMATE for the dashboard only; Stripe's own tiered pricing on the
  metered price is what actually bills once usage is reported there.
- `db/tokenUsage.ts`, `db/instagramTrialHistory.ts`, `db/dailyUsageRollup.ts`.
- `db/tenants.ts` — `createTenantForUser` now starts the trial; new `setPlanTier`,
  `endTrialImmediately`.
- `db/accountSends.ts` — `countSendsSince` (tenant-scoped, for the usage dashboard).
- `routes/auth.ts` — Trial-Abuse Guardrail wired into the OAuth callback, right after the token
  is stored.
- `services/leadEventReplyHandler.ts` — trial tenants get a token-allowance check composed onto
  the existing per-account spend guard (fail-closed to rule-based, same shape as the daily call
  cap); usage is recorded as soon as it's known (a completed, billed call), not gated on the
  Instagram send succeeding — those are separate concerns.
- `services/usageRollupService.ts` + `queue/usageRollupQueue.ts` — daily cron (02:30 UTC):
  aggregate yesterday's `token_usage`, then best-effort sync unsynced rollups to Stripe's Billing
  Meter Events API. A tenant with nothing to report (trial, no active subscription) is marked
  resolved immediately rather than retried forever; a real Stripe failure is left unsynced for
  the next run to retry.
- `routes/billing.ts` — checkout now accepts a `tier`, stamps it as Checkout session metadata (the
  only reliable way for the webhook to learn which tier without a second Stripe round-trip);
  `GET .../billing` returns quotas/trial/available-tiers; new `GET .../usage` — Usage Visibility
  Dashboard + soft-cap warnings, purely informational, never blocks a send itself.

## Frontend
- `api.ts` — plan tier/quota/usage types, tier-aware checkout, `getUsage`.
- `BillingPanel.tsx` — plan tier pill, trial countdown (only shown inside the last 3 days), a
  usage stat grid (tokens/DMs used vs. allowance, overage estimate once exceeded), an
  upgrade-tier button row.

## Verified
- `npm run typecheck` and `npm test` — 431/431 passing across 62 files (this phase added ~78 new
  tests, on top of the ~85 already added in Phase 2A).
- Found and fixed a real bug via testing, not inspection: `getDailyTokenTotals`'s date-range query
  compared a `timestamptz` column against a bare date literal — correct only if the Postgres
  session's timezone happens to be UTC. This dev machine's session runs in `Asia/Kolkata`; the
  test caught it immediately (0 rows instead of the expected 2). Fixed by converting `called_at`
  to UTC wall-clock time explicitly before comparing, instead of relying on session-timezone-
  dependent implicit casting.
- Client `npm run build` and `npm run lint` clean (one pre-existing, unrelated `CampaignEditor.tsx`
  warning and one new but non-blocking `BillingPanel.tsx` oxlint false-positive on a completely
  standard `window.location.href = url` redirect — confirmed the identical line existed
  pre-change and triggers nothing when isolated; not a real issue, lint still exits 0).
- End-to-end in a real browser (Playwright against the live dev server + Postgres): signup showed
  the trial tier, correct quotas, and a 14-day countdown; the usage dashboard correctly showed
  0/200,000 tokens and 0/200 DMs; clicking an upgrade tier against a deliberately invalid Stripe
  key produced a clean error banner with the UI staying fully usable, not a broken/stuck button.

## Deliberately not built or not enforced, flagged rather than silently dropped
- WhatsApp Cost Line — Phase 3-gated, out of scope until WhatsApp integration and the BSP
  build-vs-buy/WABA-ownership decision exist.
- `connectedAccounts` tier quota is informational only — the system supports exactly one
  connected Instagram account per tenant today, regardless of tier.
- `campaigns`/`connectedAccounts` quotas have no hard block at creation time — only DM/token usage
  gets soft-cap warnings and (for trials) a real enforced allowance, matching the roadmap's own
  "warn, don't hard-block" framing for usage specifically.
