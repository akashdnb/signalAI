# Preview → Production implementation log

Living checklist of every preview screen/feature and whether it has been ported to
production. Pairs with the method in
[`PREVIEW_TO_PRODUCTION_IMPLEMENTATION.md`](./PREVIEW_TO_PRODUCTION_IMPLEMENTATION.md).

## How to maintain this file (do this, every time)

- **Preview gains a screen/feature →** add an **unticked** row (`[ ]`) in the right
  phase section, same PR/commit that changed the preview.
- **Screen/feature ported to production →** tick it (`[x]`), fill the **PR** column,
  in the same PR that ports it (see the implementation guide §9).
- **Preview design of an already-ported screen changes →** untick it (`[ ]`), add a
  note, so production is re-synced.
- Keep rows granular (tabs, sections, states) so partial progress is visible.
- Update the **Status** counts below when you tick/untick.

**Legend:** `[ ]` pending · `[x]` done in production · 🟡 = partially ported (note which parts).

**Status:** 0 / 29 screen-features fully verified · 15 partially ported · last updated 2026-10-15.

**Current work:** `feat/preview-to-production-foundation` — production Precision Operations implementation is active and intentionally remains deployed on `signalai-bui`. Overview, Inbox, Automations list, Analytics, Leads list, Lead Detail (Overview/Conversation/Activities/Notes), Builder tab routing, the Setup readiness summary, Builder Results scope and mobile KPI strip, Builder Leads table and Team & access have implementation slices using live API data and shared production tokens/components. Automation names are standard route links now, enabling direct deep-link/browser checks of a real campaign. The separate preview service remains on `feat/precision-operations-product-ui`. Do not tick a screen until its light/dark, 1440/1024/768/390, keyboard/focus, build and browser checks are all verified. BUI and preview were inspected using the connected Opera browser this session; full multi-viewport/theme keyboard verification remains pending. Lead Detail tabs were smoke-tested via `leadTab` URLs. The Team & access page describes explicit role guards from the server and calls out routes that currently use membership-only authorization.

---

## Phase 0 — Foundation (do first; gates everything)

- [ ] **App shell** — sidebar, nav items, icons, top bar, workspace switcher → `components/AppShell.tsx`
- [ ] **Theme + accent palette** (light/dark + palette switcher) → `index.css` tokens + shell

## Phase 1 — Trust & correctness

- [ ] **Login** (`&screen=login`) → `/login` · `LoginPage.tsx` — method → email → 6-digit code
- [ ] **Connection recovery** (`&screen=connect-error`) → `/connect` · `ConnectPage.tsx` — all recovery states
- [ ] **Invitation recovery** (`&screen=invite`) → `/invite` · `InvitationAcceptPage.tsx` — all recovery states
- [ ] **Integrations** (`&screen=integrations`) → `…/integrations` · `IntegrationsPage.tsx`
- [ ] **Billing & usage** (`&screen=billing`) → `…/billing` · `BillingPage.tsx` / `BillingPanel.tsx`
- [ ] **Knowledge base** (`&screen=knowledge`) → `…/knowledge` · `KnowledgePage.tsx` / `KnowledgeBasePanel.tsx`

## Phase 2 — Core workflows

- [ ] **Overview** (`&screen=overview`) → `/dashboard/:tenantId` · `DashboardPage.tsx` — 🟡 live-data layout ported and smoke-tested on BUI; responsive/theme/keyboard verification still pending.
- [ ] **Inbox** (`&screen=inbox`) → `…/inbox` · `InboxPage.tsx` — 🟡 preview workspace proportions/tabs/list treatment ported; responsive/theme/keyboard verification still pending.
- [ ] **Leads list** (`&screen=leads`) → `…/leads` · `LeadsPage.tsx` — 🟡 migrated toolbar and operational columns; BUI data/render smoke-tested through Opera; narrow viewport/theme/keyboard verification pending.
- [ ] **Lead detail — Overview** (`&screen=lead-detail&leadTab=Overview`) → `…/leads/:leadId` · `LeadDetailPage.tsx` — 🟡 two-column live-data layout, header/back link, status badge and contact summary; stage/owner/handoff, captured facts, intelligence and deals preserved; BUI smoke-tested on a real lead; viewport/theme/keyboard verification pending.
- [ ] **Lead detail — Conversation** — 🟡 existing live ThreadPanel/API preserved; `leadTab=Conversation` URL state smoke-tested; keyboard interaction verification pending.
- [ ] **Lead detail — Activities** — 🟡 existing activity ThreadPanel/API preserved; `leadTab=Activities` selects the correct tab and renders its empty state on BUI; keyboard interaction verification pending.
- [ ] **Lead detail — Notes** — 🟡 existing live notes API and add-note form preserved; `leadTab=Notes` selects the correct tab and renders the real empty state on BUI; keyboard interaction verification pending.
- [ ] **Automations list** (`&screen=automations`) → `…/automation` · `AutomationPage.tsx` / `JourneyTable(Paginated).tsx` — 🟡 production outcome guidance and table treatment aligned to preview; live automation behavior preserved; responsive/theme/keyboard verification still pending.

## Phase 3 — Flagship (own track)

- [ ] **Builder — Flow** (`&screen=builder&builderTab=Flow`) → `…/automation/journeys/:campaignId` · `JourneyBuilder.tsx` / `BuilderCanvas.tsx` — 🟡 production tab routing accepts preview values `Flow`, `Setup`, `Results`, `Leads` and syncs the query after accepted navigation; existing React Flow canvas, explicit Save, dirty guard and publish flow are preserved; a QA-only draft was opened read-only and the real graph nodes/edges rendered; `builderTab=Flow` direct URL selected the Flow tab; Render build/deploy passed; responsive/theme/keyboard checks remain pending.
- [ ] **Builder — Setup** (readiness, validation) · `Inspector.tsx` / `NodeInspectorDialog.tsx` — 🟡 added a live-data readiness summary for saved Setup state, trigger keywords, flow/milestone save state and actual assigned-account health; the existing CampaignEditor and server publish validation remain authoritative; a QA-only draft was opened read-only via `builderTab=Setup`; readiness summary, real account assignment, and existing CampaignEditor rendered without errors; Render build/deploy passed; responsive/theme/keyboard checks pending.
- [ ] **Builder — Results** — 🟡 added a live-data results header clarifying matched-event totals, the last-30-days activity timeline, and current active-goal lead cohort; existing analytics APIs/charts and attention summary retained; mobile KPI strip uses two columns; a QA-only draft was opened read-only via `builderTab=Results`; header, reporting-window/cohort text, KPI strip, timeline, and attention summary rendered from the live analytics API without errors; Render build/deploy passed; responsive/theme/keyboard checks pending.
- [ ] **Builder — Leads** · `automation/LeadsPanel.tsx` — 🟡 changed desktop table to show handoff as its own column and renamed the scope to “Leads from this automation”; retained live goal attribution, captured facts, owner editing, filters and pagination; read-only `builderTab=Leads` was tested against `cold_dm1`; real view shows separate Stage, Handoff and Owner columns, live lead scope/empty/data states; goal attribution, captured facts, owner editing, filters and pagination retained; Render build/deploy passed; responsive/theme/keyboard checks pending.

## Phase 4 — Observability & workspace admin

- [ ] **Analytics — Activity** (`&screen=analytics&analyticsTab=Activity`) → `…/analytics` · `AnalyticsPage.tsx` — 🟡 preview-inspired activity tab, metric strip and definitions ported using current workspace-wide API data; preview-only time/account filters were not invented because the current API slice does not expose them; responsive/theme/keyboard verification still pending.
- [ ] **Analytics — Conversion** · `LeadsByStageDonut.tsx` — 🟡 current pipeline progression/revenue view is ported; full preview parity and responsive/theme/keyboard verification remain.
- [ ] **Content** (`&screen=content`) → `…/content` · `ContentPage.tsx`
- [ ] **Team & access** (`&screen=team`) → `…/team` · `TeamPage.tsx` — 🟡 production header, primary invite action, semantic status badges and role table using current server-enforced controls; it explicitly notes where core routes use membership-only authorization instead of role-based restrictions; real member/invitation API remains authoritative; verify all themes/viewports and action states before marking complete.
- [ ] **Settings — General** (`&screen=settings&settingsSection=General`) → `…/settings` · `SettingsPage.tsx`
- [ ] **Settings — Lead fields**
- [ ] **Settings — AI behavior**
- [ ] **Settings — Forbidden topics**
- [ ] **Settings — Escalation**
- [ ] **Settings — Scoring** · `ScoringRulesPanel.tsx`
- [ ] **Settings — Appearance / Profile / Notifications** (personal)
- [ ] **Documentation** (`&screen=docs`) → `/docs/*` · `DocsPage.tsx`

---

> Preview URLs: `https://signalai-precision-operations-preview.onrender.com/?preview=precision-operations&screen=<SCREEN>`
> Full route list: [`PRECISION_OPERATIONS_PREVIEW_GUIDE.md`](./PRECISION_OPERATIONS_PREVIEW_GUIDE.md).
