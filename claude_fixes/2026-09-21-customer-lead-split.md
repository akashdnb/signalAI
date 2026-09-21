# 2026-09-21 — Customer/Lead split (Phase 1 completion)

Added the `customers`/`customer_id` foundation that `docs/signalAI_roadmap.md` Phase 1
Platform Foundations calls for — the last unimplemented item in Phase 1 per a full
codebase audit against the roadmap checklist.

## Changed
- `server/migrations/1758240000028_create-customers.sql` — new `customers` table,
  nullable `customer_id` on `leads`, backfill for pre-existing rows.
- `server/src/db/leads.ts` — `findOrCreateLeadByInstagramUserId` now mints one
  `customers` row per genuinely new lead (gated on `is_new`/`xmax = 0`, not folded
  into the upsert, so repeat comments from an existing lead never create an orphan
  customer row). Rides the caller's transaction in production
  (`webhookIngestService.ts`'s `ingestOneEvent`), so a crash between the lead insert
  and the customer link can't leave a committed lead without one.
- `server/src/__tests__/helpers/db.ts` — `resetDb` now truncates `customers` too
  (it wasn't reachable by the existing truncate's cascade).
- `server/src/db/__tests__/leadsAndEvents.test.ts` — new test asserting exactly one
  customer per distinct lead, reused across repeat contacts.

## Verified
- Migration up/down round-trips cleanly against a local Postgres.
- `npm run typecheck` clean.
- `npx vitest run src/db/__tests__/leadsAndEvents.test.ts` — 6/6 passing.
- Full `npm test` run in progress at time of writing.

No behavior change to any existing Phase 1 feature — `customer_id` has zero
consumers yet; this is the foundation Phase 2A's CRM work builds on.
