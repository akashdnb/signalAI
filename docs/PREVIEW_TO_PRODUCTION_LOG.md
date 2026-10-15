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

**Status:** 0 / 29 screen-features ported · last updated 2026-10-15.

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

- [ ] **Overview** (`&screen=overview`) → `/dashboard/:tenantId` · `DashboardPage.tsx`
- [ ] **Inbox** (`&screen=inbox`) → `…/inbox` · `InboxPage.tsx`
- [ ] **Leads list** (`&screen=leads`) → `…/leads` · `LeadsPage.tsx`
- [ ] **Lead detail — Overview** (`&screen=lead-detail&leadTab=Overview`) → `…/leads/:leadId` · `LeadDetailPage.tsx`
- [ ] **Lead detail — Conversation**
- [ ] **Lead detail — Activities**
- [ ] **Lead detail — Notes**
- [ ] **Automations list** (`&screen=automations`) → `…/automation` · `AutomationPage.tsx` / `JourneyTable(Paginated).tsx`

## Phase 3 — Flagship (own track)

- [ ] **Builder — Flow** (`&screen=builder&builderTab=Flow`) → `…/automation/journeys/:campaignId` · `JourneyBuilder.tsx` / `BuilderCanvas.tsx`
- [ ] **Builder — Setup** (readiness, validation) · `Inspector.tsx` / `NodeInspectorDialog.tsx`
- [ ] **Builder — Results**
- [ ] **Builder — Leads** · `automation/LeadsPanel.tsx`

## Phase 4 — Observability & workspace admin

- [ ] **Analytics — Activity** (`&screen=analytics&analyticsTab=Activity`) → `…/analytics` · `AnalyticsPage.tsx`
- [ ] **Analytics — Conversion** · `LeadsByStageDonut.tsx`
- [ ] **Content** (`&screen=content`) → `…/content` · `ContentPage.tsx`
- [ ] **Team & access** (`&screen=team`) → `…/team` · `TeamPage.tsx`
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
