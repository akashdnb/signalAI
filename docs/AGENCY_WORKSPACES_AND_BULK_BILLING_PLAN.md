# Agency Workspaces & Bulk Billing — Design Plan

**Status:** Backend implemented (branch `feat/agency-workspaces`); frontend/UI pending
**Date:** 2026-10-14 (backend built 2026-10-15)

> **Implementation note (backend complete).** Steps 1–5 of §9 are built and tested on
> `feat/agency-workspaces`:
> - **Switcher/edit:** `GET /me/workspaces`, `POST /workspaces`, `PATCH /tenants/:tenantId`, `tenants.description` (migration 115).
> - **Schema:** `billing_accounts` + `billing_account_tenants` (migration 116), `db/billingAccounts.ts`.
> - **Resolver:** `services/billingResolver.ts` (`resolveEffectiveBilling`), wired into the live reply path via `services/tokenEntitlement.ts` and into `GET /tenants/:tenantId/usage`.
> - **Plan management:** `routes/billingAccounts.ts` — create plan, add/remove/cap workspaces (owner-only + limit), `GET /me/billing-account`, detail.
> - **Stripe:** `lib/agencyBilling.ts` (one Customer + one subscription, licensed quantity), agency checkout, and the shared `/billing/webhook` extended for `ba:` activation + `subscription.updated/deleted` status.
> - **Usage roll-up:** `services/usageRollupService.ts` aggregates plan-covered workspaces to the plan's Stripe customer.
> - **Caps:** per-workspace soft caps enforced in the live reply path (reject-on-exceed, monthly reset).
>
> Still open: §7 product decisions (notably owner-transfer and bulk-plan non-token caps), the metered **price** attach on the subscription (only meter *events* are reported today, mirroring the pre-existing per-tenant flow), and all frontend wiring (§9 step 6).
**Scope:** Multi-workspace switching for one user, and an agency "bulk plan" that pays for several workspaces under one personal-email payer.
**Branch context:** `feat/precision-operations-product-ui` (the workspace switcher is currently a UI mock in `client/src/pages/PrecisionOperationsPreviewPage.tsx`; "Studio North" / "Client Demo" are hardcoded sample entries).

---

## 1. Why this is mostly additive

The backend is already a workspace model. What the UI calls a **workspace** is the backend **tenant**, and the multi-tenant foundation was deliberately built for this (schema comments reference "Phase 6 multi-user workspaces").

Already true today, no change needed:

- `tenant` = isolated workspace. Every domain table (`leads`, `journeys`, `knowledge_base`, `meta_tokens`/connected accounts, `field_definitions`, scoring, guardrails) is `tenant_id`-scoped, so isolation is automatic.
- **The session is person-scoped** — the token carries only `userId`, never a tenant (`server/src/lib/session.ts`). The tenant comes from the `:tenantId` route param and membership is re-verified per request against `tenant_members` (`server/src/lib/tenantAuth.ts`). Switching workspaces needs **no re-login**, and the server rejects any tenant the user is not a member of (403).
- **One user ↔ many workspaces** is native: `tenant_members` is an M:N join (migration `1758240000021`).
- Full invitation lifecycle + roles (owner/admin/member), role-gated routes (`server/src/routes/workspaceManagement.ts`).
- Inbound Instagram webhooks auto-route to the owning workspace by account id, because an IG account is globally unique to one tenant (migration `1758240000016`).
- `'agency'` is already a first-class `TenantIndustry` value (`server/src/db/tenants.ts`).

### Gaps for the switcher (both small, additive)

1. **List my workspaces** — `listTenantsForUser()` exists in the DB layer (`server/src/db/tenantMembers.ts`) but is only called once at login and returns `tenants[0]`. Add `GET /me/workspaces` → all memberships joined with `tenants.name` + role.
2. **Create a workspace** — `createTenantForUser()` exists but is only called at first-login bootstrap (`server/src/routes/authEmail.ts`). Add `POST /workspaces` for an existing user; reuse the same transactional helper (tenant + owner `tenant_members` row in one transaction).
3. **Client session model** — `localStorage "signalai.session"` stores a single `tenantId` (`client/src/api/workspace.ts`). It must hold the active workspace and swap it on switch (frontend only).

---

## 2. Billing model: keep per-workspace, add an agency bulk plan

**Decision:** per-workspace billing stays the default. Agencies get a **bulk plan** owned by a personal email that covers several connected workspaces (with a limit), and the owner chooses which workspaces to include.

This is the standard **parent / child consolidated-billing** pattern. The design below was validated against how leading products implement it (see §8 Sources); the one correction research forced is in §4.

### 2.1 Data model (additive — existing per-workspace columns on `tenants` are untouched)

```sql
-- The PARENT / payer. One personal-email user owns it and holds the card.
create table billing_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references users(id),
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text not null,                 -- 'agency_bulk'
  workspace_limit int not null,       -- the "(with limit)" cap, enforced app-side
  billing_status text not null default 'none',  -- none | active | past_due | canceled
  created_at timestamptz not null default now()
);

-- Parent → child coverage. A tenant is covered by AT MOST ONE plan.
create table billing_account_tenants (
  billing_account_id uuid not null references billing_accounts(id) on delete cascade,
  tenant_id uuid not null unique references tenants(id) on delete cascade,  -- unique = no double-coverage
  per_workspace_token_cap bigint,     -- NULL = draw freely from the shared pool
  added_at timestamptz not null default now(),
  primary key (billing_account_id, tenant_id)
);
```

A workspace **not** listed in `billing_account_tenants` keeps paying its own way exactly as today — fully backward compatible, no data migration.

### 2.2 The linchpin: an "effective billing" resolver

Today ~7 files read `tenants.plan_tier` / `billing_status` / `trial_ends_at` directly (`db/tenants.ts`, `routes/dashboard.ts`, `routes/billing.ts`, `routes/workspaceManagement.ts`, `queue/alertsQueue.ts`, `services/leadEventReplyHandler.ts`, `services/usageRollupService.ts`), and quota enforcement funnels through `lib/planTiers.ts` + `services/replyEngine.ts`, `services/milestoneEngine.ts`, `routes/leads.ts`.

Every one of those must go through a single function instead:

```
resolveEffectiveBilling(tenantId):
  if tenant is in billing_account_tenants AND that billing_account is 'active':
      → use the bulk plan's status + quota   (plan-covered)
  else:
      → use the tenant's own columns          (today's behavior)
```

A plan-covered workspace is "active" **regardless** of its own trial columns — which also cleanly nullifies the `endTrialImmediately` trial-abuse guardrail surprise for agency workspaces (see §6). This resolver is the correctness linchpin and must be built **first, with tests**, before any Stripe wiring. Stripe's own guidance is to resolve entitlements from your own DB using stored customer/subscription refs — this is that.

---

## 3. Quota & usage: shared pool + per-workspace attribution + optional caps

The bulk plan grants **one shared AI-token pool** across all covered workspaces, enforced at the plan level, while **usage stays attributed per workspace** (`token_usage` / `daily_usage_rollup` are already tenant-keyed — do not change that).

- **One invoice, one number** — matches "all workspaces included in the plan."
- The agency still sees *which client burned what* (attribution already exists), which they need to bill their own clients.
- **Optional soft per-workspace cap** (`per_workspace_token_cap`) so one runaway client can't starve the others. Semantics (adopted from the proven ElevenLabs model): **resets each billing cycle; when a covered workspace hits its cap, reject that workspace's AI requests while others keep running; if no cap is set, the parent pool limit applies.**
- **Usage roll-up to Stripe:** sum `daily_usage_rollup` across covered tenants → report that aggregate to the plan's single metered item. No new per-usage plumbing; just an aggregation query.
- **Non-token caps** (`connectedAccounts`, `campaigns`, DMs/month in `lib/planTiers.ts`) stay **per workspace** even under a bulk plan — the bulk plan governs tokens + seats, but one client workspace still shouldn't connect 50 IG accounts. Open decision: do bulk-plan workspaces inherit `growth` per-workspace caps, or their own? (§7)

The header usage meter (the mock's "145.5K / 200K") shows **plan-aggregate** when the workspace is plan-covered, and **per-workspace** otherwise — the backend must expose both shapes.

---

## 4. Stripe mechanism: one Customer, one Subscription, two line items

> **Correction from research:** do **not** use Stripe Connect / multi-entity accounts here. Connect is for **separate legal entities with their own bank payouts**; an agency paying for its clients from one card is a single payer. Connect would wrongly split payouts and multiply integration complexity.

The best-practice shape for "one payer, N workspaces, metered AI on top" is a **single subscription with multiple prices** → one consolidated invoice:

| Line item | Stripe price type | Drives |
|---|---|---|
| Workspace seats | **licensed, with `quantity`** = number of covered workspaces | the per-workspace fee; update `quantity` as workspaces are added/removed (Stripe auto-prorates) |
| AI tokens | **metered usage** | overage, reported as the **aggregate** across all covered workspaces |

Both prices sit on one subscription, so Stripe combines fixed + metered on **one invoice** automatically. `workspace_limit` is enforced **app-side** (Stripe does not cap quantity) and is the upsell gate. Billing-account webhooks (`past_due`, `canceled`) flip `billing_accounts.billing_status`, which the resolver reads through to every covered workspace — no fan-out writes.

Alternative: a flat "up to N workspaces for $X" tier is viable if preferred for pricing comms, but quantity + metered flexes better and is the Stripe-native path. (A flat tier hits a hard wall at the cap and forces a tier-upgrade upsell.)

---

## 5. Membership rules & security

- **Who can add a workspace to a plan:** only a user who is the **`owner`** of that workspace (not member, not admin). This fits the agency story — they created these workspaces, so they are the owner — and avoids a consent handshake in v1. (Real multi-principal agencies, where the plan covers a workspace owned by someone else, need an invite/accept flow — future work, §7.)
- **Limit enforcement:** adding a workspace checks `count < workspace_limit`, else `409`.
- **Who manages the plan:** only the `billing_accounts.owner_user_id`.
- **No double-coverage:** `billing_account_tenants.tenant_id` is `unique`.

---

## 6. State transitions

- **Add workspace to an active plan:** immediately becomes plan-covered → "active" via the resolver, regardless of its own trial/billing columns. Stripe subscription `quantity += 1`.
- **Remove workspace from a plan:** falls back to its **own** billing columns, which may be trial-expired or unpaid → could lock. Make this **explicit in the UI** ("removing this workspace will require it to have its own plan") and consider a grace period so a live client's automations don't stop mid-cycle. Stripe `quantity -= 1`.
- **Plan goes `past_due` / `canceled`:** resolver reflects it on every covered workspace through `billing_accounts.billing_status`.
- **Trial-abuse guardrail (`endTrialImmediately`):** currently a secondary workspace's trial ends immediately when an already-trialed IG account connects to it. Under a bulk plan this is moot (the plan covers the workspace). For agency workspaces *not yet* in a plan, consider relaxing the guardrail for verified agencies — otherwise workspace #2, #3… get no trial.

---

## 7. Open product decisions

1. **Pricing shape:** per-workspace `quantity` (recommended) vs. flat "up to N" tier.
2. **Per-workspace non-token caps under a bulk plan:** inherit `growth` limits, or a dedicated agency limit set?
3. **Owner transfer / orphan handling:** the plan is tied to one personal email. If that person leaves, every covered workspace loses billing. Need a transfer-owner path (even manual/admin-only in v1) and a defined behavior when a `billing_account` is deleted (cascade children to their own billing, never silently unbill).
4. **Covering a workspace owned by someone else** (true multi-principal agency) — invite/accept handshake, deferred.
5. **Remove-from-plan grace period** length.

---

## 8. Edit-workspace endpoint (+ needed column)

`tenants` has no description column. Add it, then a role-gated update:

```sql
alter table tenants add column description text;
```

```
PATCH /tenants/:tenantId        requireTenantRole('owner', 'admin')
  body: { name?, description? }
```

Keep the existing **R14-05** guidance: the tenant `name` renders in the BUI header, in every tenant listing, and anywhere tenant names get logged (none of it scrubbable the way `lead_pii` is). Validate `name` and `description` against PII and length-cap both. Switcher avatars ("MW", "SN", "CD") are initials derived from `name`, so no avatar column is needed unless custom avatars are wanted later.

---

## 9. Implementation sequencing

1. **`resolveEffectiveBilling` resolver + tests** — route the ~7 existing billing-read sites through it. (Correctness linchpin; no behavior change yet, since no plans exist.)
2. **Switcher endpoints** — `GET /me/workspaces`, `POST /workspaces`, `PATCH /tenants/:tenantId` + `description` migration; client session model holds the active workspace.
3. **`billing_accounts` + `billing_account_tenants` schema** + plan-management endpoints (create plan, add/remove workspace with the owner-only + limit rules).
4. **Stripe wiring** — one Customer + one subscription (licensed `quantity` + metered token item), webhooks → `billing_status`, aggregate usage roll-up to the metered item.
5. **Per-workspace soft caps** (monthly reset, reject-on-exceed).
6. **UI** — switcher wired to real endpoints, plan management screen, plan-level usage breakdown, owner-transfer + audit log.

Everything is additive to a model already built for it; the only genuinely new surface is the parent billing entity + the resolver.

---

## 10. Sources

- [Stripe — Billing for a multi-entity business](https://docs.stripe.com/billing/multi-entity-business) — why Connect is the wrong fit for a single-payer agency.
- [Stripe — Subscriptions with multiple products](https://docs.stripe.com/billing/subscriptions/multiple-products) and [per-seat quantities](https://docs.stripe.com/billing/subscriptions/quantities) — one subscription, fixed + metered on one invoice.
- [Kinde — Multi-tenant billing across enterprise hierarchies](https://kinde.com/learn/billing/billing-infrastructure/multi-tenant-billing-architecture-scaling-b2b-saas-across-enterprise-hierarchies/) — parent/child model, per-child usage roll-up, pitfalls.
- [ElevenLabs — Consolidated billing](https://elevenlabs.io/docs/overview/administration/consolidated-billing) — closest real-world analog: shared pool, per-workspace caps, link rules (admin authority over both workspaces, unlink → separate subscription).
