# 2026-09-29 — Milestone Multi-Field Capture, Tenant Field-Definitions Registry, Unified Settings Page

Raised from a real live conversation review: a milestone capturing email and a
separate milestone capturing country each cost the lead a full back-and-forth
turn, and `user_country`'s captured value turned out to have zero format
validation — any non-refusal-phrase string was accepted. Follow-up questions in
the same discussion asked for shorter conversations (batch related asks
together) and a shared, reusable vocabulary of fields across campaigns instead
of ad-hoc per-milestone strings.

## Change 1: Milestones can now capture multiple fields per turn

**Root cause**: `campaign_milestones.capture_field` was a single nullable
`text` column, and `milestoneEngine.ts`'s structured-output contract mirrored
it 1:1 (`captured_value?: string`) — a milestone could only ever ask for one
fact at a time, forcing "collect email" and "collect mobile number" into two
separate conversational steps even though a lead will often answer both at
once if just asked together.

**Fix**: `capture_field` → `capture_fields` (`text[]`, migration
`1758240000043`, data-preserving backfill: `array[capture_field]` per
existing row, in the same transaction as the column drop). The LLM's
structured-output contract moved to `captured_values: Record<string, string>`.
`buildSystemPrompt` now tells the model exactly which of the milestone's
fields are still missing (computed against `capturedFactsSoFar`, which only
ever reflects prior *committed* turns) so it never re-asks for one already
captured. `runMilestoneCheck`'s gate now requires every one of a milestone's
`captureFields` to be known — either already durable or newly validated this
turn — before reporting `satisfied: true`.

**Partial capture across turns** was the subtlety: if a lead answers only one
of two requested fields, the old commit logic (`leadEventReplyHandler.ts`)
only ever persisted captured facts when the *whole* milestone was satisfied —
which would have silently dropped a partial answer and made the model re-ask
for something the lead already gave. Fixed by decoupling "persist newly
captured facts" from "advance to the next milestone": `commitMilestoneProgress`
(renamed from `commitMilestoneAdvancement`) now merges any newly captured
values whenever present, and only additionally records the advancement +
moves `active_milestone_id` forward when the milestone is fully satisfied.
Both still gate on confirmed Instagram delivery (R6-01's existing invariant,
unchanged) — a failed send and retry redoes the LLM work cleanly rather than
committing a fact for a reply the lead never received.

## Change 2: Tenant field-definitions registry

**Root cause**: `isValidCapturedValue` only had real format validation for
fields whose name happened to contain `"email"` or `"phone"` — anything else
(e.g. `user_country`) just checked against a fixed refusal-phrase set, so any
non-refusal string was accepted as valid. Separately, `capture_field` was a
bare freeform string with no shared vocabulary: two campaigns could use
`email`, `user_email`, and `userEmail` for the same concept.

**Fix**: new `tenant_field_definitions` table (migration `1758240000044`) — a
per-tenant registry of reusable typed fields (`field_key`, `label`,
`value_type` ∈ `email | phone | country | number | date | text`), CRUD in
`server/src/db/fieldDefinitions.ts`, routes at
`/tenants/:tenantId/field-definitions` (same `requireTenantSession` + router
convention as the existing Knowledge Base/Guardrails routes). `capture_fields`
stays a plain `text[]` with no DB foreign key to this table — an unregistered,
ad-hoc field name still works exactly as before; the registry is additive
typing, not a hard requirement. `isValidCapturedValue` now checks a field's
*registered* `value_type` when one exists (number → numeric regex, date →
`Date.parse`, email/phone reuse the existing patterns) and only falls back to
the old substring-heuristic when the field isn't registered — fully
backward-compatible for tenants who haven't set up the registry yet.

## Change 3: Unified Settings page

Knowledge Base, Client Guardrails, and Billing were each just a panel bolted
onto the bottom of the single `DashboardPage`, with no dedicated home. Moved
all three — plus a new `FieldDefinitionsPanel` — onto a new
`/dashboard/:tenantId/settings` route, with a plain nav link added to the
dashboard header (this codebase has no nav/sidebar component yet, so this is
the first one). The milestone editor in `CampaignEditor.tsx` now has a real
multi-select fed by the tenant's field definitions, with an inline "+ New
field" affordance that registers a field on the fly and immediately adds it to
the milestone being edited — the confirmed product decision was **hybrid**:
prefer the registry, but never block on it.

## Verified
- `npx tsc --noEmit` clean on both `server` and `client`.
- `npm run build` (client) — clean.
- `npx vitest run` (server) — 572/572 passing, including new/rewritten
  coverage: multi-field capture and partial-capture-across-turns
  (`milestoneEngine.test.ts`, `leadEventReplyHandler.test.ts`), the
  `capture_fields` array contract (`milestones.test.ts`), and the new
  registry (`fieldDefinitions.test.ts` — create/list/update/delete,
  per-tenant uniqueness, identifier/value-type validation, and the
  registry-aware validation cases in `milestoneEngine.test.ts` where behavior
  actually changes from the old heuristic, e.g. a `number`-typed field now
  correctly rejects `"not a number"`). One queue test
  (`deadLetterEvidence.test.ts`) flaked once under parallel-worker DB
  contention from two concurrent verification runs; confirmed pre-existing
  and unrelated by passing cleanly in isolation.
- New migrations `1758240000043`–`1758240000044` round-tripped up → down → up
  against real data (a row with `capture_fields = {email,phone}` survived the
  down migration's lossy-to-one-field derivation and the subsequent up
  migration correctly, since down is a rollback path, not meant to be
  lossless for the new feature).

## Not built / explicitly deferred
- Country-value normalization to ISO-3166 codes (e.g. `"India"` vs `"india"`
  vs `"IN"` still land as distinct strings) — the registry's `country` type
  currently only gets the same permissive non-refusal check as `text`. A real
  normalization/allowlist step is a smaller follow-up once it's asked for.
- No cap on funnel drop-off denominator (`getMilestoneDropoff` still reports
  raw advancement counts, not a percentage against total leads entered) —
  unrelated to this change's scope, flagged in the earlier gap review but not
  part of what was asked to be built here.
