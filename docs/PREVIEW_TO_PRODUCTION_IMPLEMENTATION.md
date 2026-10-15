# Preview → Production implementation guide

**Audience:** any engineer or coding agent tasked with porting a screen's design
from the Precision Operations **preview** into the **production** SignalAI app.

**How to use this doc:** pick one screen, read §6 for its row, then follow the
§4 recipe step by step. Do not improvise the method. This doc is the contract;
the preview is the picture.

> This guide pairs with [`DESIGN.md`](./DESIGN.md), [`AGENTS.md`](../AGENTS.md),
> the route-by-route brief in [`FLAGSHIP_REDESIGN_PLAN.md`](./FLAGSHIP_REDESIGN_PLAN.md),
> and the primitives in [`client/src/components/ui/README.md`](../client/src/components/ui/README.md).
> When those conflict with this doc, they win — tell the author so this doc gets fixed.
>
> **Progress is tracked in [`PREVIEW_TO_PRODUCTION_LOG.md`](./PREVIEW_TO_PRODUCTION_LOG.md).**
> Before starting a screen, check it there; when you finish one, tick it. When the
> preview gains a new screen/feature, add an unticked row to the log.

---

## 1. The model (read this first)

- The **preview** (`?preview=precision-operations`, built from
  `client/src/pages/PrecisionOperationsPreviewPage.tsx` +
  `PrecisionOperationsFullScreens.tsx` + the `client/src/styles/precision-operations-*.css`
  sheets) is a **design sandbox**. It uses fake/sample data, query-param routing,
  a private `--po-*` token namespace, and `po-` CSS classes. **None of that ships.**
- **Production** is the real app under `/dashboard/:tenantId/*`, built from the
  real pages in `client/src/pages/`, the components in `client/src/components/`,
  the shared primitives in `client/src/components/ui/`, the design tokens in
  `client/src/index.css`, and real API data.
- Your job: make the production screen **look and behave like the preview**, using
  **production tokens, production primitives, and real data** — not by copying the
  preview's code or CSS.

### What transfers vs. what never transfers

| Transfers (use it) | Never copy (reference only) |
|---|---|
| Layout, hierarchy, spacing rhythm, grouping | The `po-*` CSS class system |
| Exact values: colors, radii, type sizes, gaps | The `--po-*` token namespace |
| Which states exist and their copy | The preview's monolithic JSX + sample data |
| Interaction model (tabs, filters, inspector, modals) | Query-param routing / `?preview=` wiring |
| Icon choices and sidebar structure | Any `client/src/styles/precision-operations-*.css` file |

**Rule of thumb:** you may read any number from the preview CSS. You may not
`import` any preview CSS or reuse a `--po-*` or `.po-*` name in production.

---

## 2. Non-negotiable rules

1. **No parallel design system.** Use the tokens in `client/src/index.css` and the
   primitives in `client/src/components/ui/`. Do not introduce a second palette,
   a `--po-*`-style namespace, or a new UI framework. (`AGENTS.md` “SignalAI
   implementation constraints”.)
2. **Reuse primitives before writing CSS.** `Button`, `Field`, `TextInput`,
   `SelectInput`, `TextareaInput`, `StatusBadge`, `PageHeader`, `Section`,
   `EmptyState`, `LoadingState`, `ErrorState`, `Skeleton`. Add a new primitive only
   when there is a concrete gap, and add it **once, centrally**.
3. **Real data only.** Wire the real API/hooks/permissions. Never ship the preview's
   sample values. If something is illustrative, it must be labelled as such and kept
   out of production surfaces.
4. **Both themes + a11y + responsive, every screen.** Light and dark (production
   uses `[data-theme]` + `prefers-color-scheme`), visible focus, labels, contrast,
   `prefers-reduced-motion`, no horizontal overflow at 390 / 768 / 1024 / 1440.
5. **One route per PR.** Keep the diff scoped to the screen you are porting. Do not
   restyle unrelated screens or add broad selectors.
6. **Add new tokens centrally.** If the design needs a value with no production
   token (see §5 gaps), add it to `client/src/index.css` (light **and** dark),
   then use it — never hard-code the hex on the screen.

---

## 2A. Anti-AI guardrails & good UI principles

The preview was built to these principles; production must keep them. This is the
distilled version of `DESIGN.md` and `AGENTS.md` — read those for the full text.

### Good UI principles (what to aim for)

- **Specific beats generic.** Design for the real job (operating Instagram
  conversations, qualifying leads, configuring automations). Use the real entities,
  actions, statuses, and terminology of the screen.
- **Hierarchy beats decoration.** Make the next useful action obvious. Clear
  headings, readable data density, whitespace/dividers before another card.
- **Purpose beats trend.** Every color, border, icon, animation, and surface must
  help the user understand status, relationships, or actions — not just decorate.
- **Consistency with character.** Build a recognisable SignalAI UI from the
  established tokens and components; distinction comes from hierarchy, real content,
  and purposeful interaction, not novelty.
- **Truth beats marketing.** Never invent users, testimonials, logos, metrics, live
  activity, or success counts. Sample data stays in the sandbox; label anything
  illustrative.
- **Usability beats a visual trick.** Aesthetics must not obscure navigation,
  labels, data relationships, save state, permissions, or destructive actions.
- **Direction:** Swiss-functional, product-first, operational. Prefer whitespace,
  alignment, tables, and dividers over wrapping everything in cards. Reserve
  elevation for real layering. Use radius and color as semantic choices.

### Anti-AI / anti-slop guardrails (what to avoid)

Avoid these unless there is a concrete, approved product reason:

- Decorative purple/blue **gradients**, **glassmorphism**, **neon glows**, ornamental blobs.
- **Identical rounded cards** for every piece of content; decorative stat-card walls.
- A **centered headline + subtitle + two-button** hero on an unrelated page.
- **Three equal feature cards** with parallel slogans.
- **Emoji as the primary icon system.**
- Fake **“live” dashboards**, fabricated trust badges, placeholder customer logos, invented testimonials.
- **Shadow + scale hover** effects and generic entrance animations; blanket `transition-all`.
- Arbitrary **oversized rounding** or a one-off radius/color that ignores the tokens.
- Generic copy: **“Submit”, “Click here”, “Learn more”, “Something went wrong”**,
  “AI-powered”, “seamlessly”, “unlock”, “revolutionize”, slogan-like triplets, em-dash overuse.
- A **second palette / parallel token system** (the whole reason the `--po-*` set
  does not ship). Status colors must keep their meaning and never be the only signal.
- Adding a dependency, rewriting a working screen, or using broad CSS selectors to
  make a small visual change.

### Self-audit before each PR (from `DESIGN.md`)

1. What is specific to this screen and to SignalAI?
2. What is the visual hierarchy — which action should the user notice first?
3. Which decorative/default patterns did I deliberately avoid, and why?
4. Are all values/claims real, clearly sample-labelled, or absent?
5. What happens in loading, first-use empty, no-results, error, success, and edge states?
6. Does it work with keyboard, visible focus, reduced motion, both themes, and narrow viewports?
7. Did I reuse existing tokens/primitives and avoid unrelated regressions?

> These guardrails are also baked into the §7 Definition of Done. A screen that
> trips any “avoid” item above is not done, even if it matches the preview visually.

---

## 3. Environment & commands

**View the preview (the source of truth for the design):**
- Deployed: `https://signalai-precision-operations-preview.onrender.com/?preview=precision-operations&screen=<SCREEN>`
- Local: `cd client && npm run dev`, then
  `http://localhost:5173/?preview=precision-operations&screen=<SCREEN>`
- Full screen list / URLs: `docs/PRECISION_OPERATIONS_PREVIEW_GUIDE.md`.

**Capture reference screenshots** (Playwright is available; chromium is cached):
```python
# scratchpad/shoot.py  — run:  python3 shoot.py
import asyncio
from playwright.async_api import async_playwright
BASE = "https://signalai-precision-operations-preview.onrender.com/?preview=precision-operations"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await (await b.new_context(viewport={"width":1440,"height":900})).new_page()
        for name, q in [("overview","screen=overview"), ("leads","screen=leads")]:
            await pg.goto(f"{BASE}&{q}", wait_until="networkidle", timeout=45000)
            await pg.wait_for_timeout(1200)
            await pg.screenshot(path=f"{name}.png", full_page=True)
        await b.close()
asyncio.run(main())
```
Capture both themes (toggle via the preview's Settings → Appearance, or the
top-bar moon/sun) and 390px width for mobile.

**Run production for comparison:** `cd client && npm run dev`, open
`/dashboard/<tenantId>/...` (see §6 for each route). Use a real/dev tenant.

**Verify before every PR (the build gate Render runs):**
```
cd client && npx oxlint --format=unix && npm run build
```
`npm run build` runs `tsc -b` then `vite build`. Both must pass. (oxlint exits 0
on warnings; do not add new errors.)

---

## 4. The per-screen recipe (follow in order)

1. **Capture the spec.** Screenshot the preview screen (desktop light, desktop
   dark, 390px). Note every state the preview shows (empty, loading, error,
   no-results, success, long values, disconnected, permission-limited).
2. **Open the production target.** Find the route/page/components in §6. Read the
   current page and its components fully before editing.
3. **Diff.** Write a short delta list: layout, hierarchy, spacing, components,
   states, copy, icons — preview vs. current production.
4. **Map tokens & primitives.** For every color/size, pick the production token
   from §5. For every `po-` block, pick the production primitive from §5. Flag any
   gap; add the token/primitive centrally first.
5. **Implement on the real page** with real data. Prefer primitives; write screen-
   scoped CSS only for genuinely one-off layout, and keep it next to the
   page/component that owns it.
6. **Cover all states** from step 1 using `EmptyState` / `LoadingState` /
   `ErrorState` / `Skeleton`.
7. **Verify** against §7 Definition of Done: both themes, a11y, responsive, real
   data, no regressions. Re-screenshot production and compare side-by-side with
   the preview.
8. **Ship** one reviewed PR for the route. Build gate green.

---

## 5. Mapping tables

### 5a. Tokens: preview `--po-color-*` → production (`client/src/index.css`)

Use the **semantic** production token (`--color-*`) where one exists; otherwise the
raw (`--text`, `--border`, `--accent`, …). Production already defines dark values,
so using these makes dark mode work for free.

| Preview token | Light value | Use in production | Match |
|---|---|---|---|
| `--po-color-canvas` | `#f1f5fa` | `--color-canvas` (`--bg`) | ≈ exact |
| `--po-color-surface` / `--po-color-white` | `#ffffff` | `--color-card` | exact |
| `--po-color-ink` | `#111827` | `--color-ink` | near (`#0f172a`) |
| `--po-color-secondary` | `#4b5563` | `--color-subtle` | near |
| `--po-color-muted` | `#616a7a` | `--color-subtle` | near |
| `--po-color-border` | `#e2e8f0` | `--color-line` | exact |
| `--po-color-border-strong` | `#cbd5e1` | **GAP → add `--color-line-strong`** | none |
| `--po-color-primary` | `#7c3aed` | `--color-accent` | exact |
| `--po-color-primary-hover` | `#6d28d9` | `--color-accent-hover` | exact |
| `--po-color-primary-soft` | `#f3e8ff` | `--color-chip` | exact |
| `--po-color-success` | `#21734e` | `--color-ok-ink` | shade differs |
| `--po-color-success-soft` | `#e7f5ec` | `--color-ok` | near |
| `--po-color-warning` | `#8e5d10` | **GAP → add `--color-warn-ink`** | none |
| `--po-color-warning-soft` | `#fff3da` | **GAP → add `--color-warn`** | none |
| `--po-color-error` | `#9b2c28` | `--color-err-ink` | shade differs |
| `--po-color-error-soft` | `#fff1f0` | `--color-err` | near |
| `--po-color-info` | `#3265a4` | `--accent-blue` | near |
| `--po-color-info-soft` | `#edf4ff` | **GAP → add `--color-info`** | none |
| chart bars / stages | blue family | `--funnel-1..6`, `--accent-blue` | use chart tokens |
| builder node: `--po-color-trigger` / `-goal` / `-instagram` | pink / green / purple | **GAP → add builder-node tokens** | none |

**Known token gaps to add centrally** (in `index.css`, light + dark + the
`[data-theme="dark"]` block) before screens that need them:
`--color-line-strong`, warning set (`--color-warn`, `--color-warn-ink`,
`--color-warn-line`), info set (`--color-info`, `--color-info-ink`), and the
builder node tones. Derive dark values the same way existing tokens do.

> Semantic status rule (`DESIGN.md`): purple = primary action / selection only.
> Success / warning / error / info must keep their meaning and never be the only
> signal (pair with text/icon).

### 5b. Patterns: preview `po-*` → production primitive

| Preview pattern | Production primitive / approach |
|---|---|
| `.po-button`, `.po-button--primary/secondary/quiet` | `Button` (variant=primary/secondary/ghost, size) |
| `.po-field-block`, label + input/select/textarea | `Field` + `TextInput` / `SelectInput` / `TextareaInput` |
| `.po-tag`, status pills (`Live`/`Draft`/`Paused`/`Needs …`) | `StatusBadge` (tone: success/warning/danger/info/neutral/accent) |
| Page title + description + action row | `PageHeader` |
| Section heading + description + action + divider | `Section` |
| First-use / nothing-yet panels | `EmptyState` |
| Spinners / skeleton loads | `LoadingState` / `Skeleton` |
| Error panels with a retry/next step | `ErrorState` |
| `.po-automation-table`, `.po-field-table`, `.po-permission-table` | real `<table>` styled with tokens; reuse existing table styling if present |
| Tabs (`builderTab`, `leadTab`, `analyticsTab`) | existing tab component (e.g. `components/automation/AutomationTabs.tsx`); keep `tab`/`tabpanel` a11y wiring |
| Modals / dialogs (publish, invite, unsaved) | existing dialog pattern (e.g. `NodeInspectorDialog`); keep focus trap + `role="dialog"` |
| Sidebar + top bar | `components/AppShell.tsx` (do the shell once in Phase 0) |
| Icons | `client/src/components/icons.tsx` — reuse; add missing glyphs here, not inline |

---

## 6. Screen → production target map

Routes are under `/dashboard/:tenantId` unless noted. “Components” lists the main
files that hold the real UI (edit these, not the thin page wrapper).

| Preview screen (`&screen=`) | Prod route | Page file | Key components | Notes |
|---|---|---|---|---|
| App shell / sidebar / top bar | (all) | — | `components/AppShell.tsx` | **Phase 0, do first** — gates every screen. Port nav, sidebar icons, workspace switcher, theme/palette. |
| `overview` | `/dashboard/:tenantId` | `DashboardPage.tsx` | — | Decision surface: next-actions, pipeline, recent activity. Real metrics; label sample data. |
| `inbox` | `…/inbox` | `InboxPage.tsx` (445 L) | — | 3-pane conversation workspace. Real threads, handoff states, messaging window. |
| `leads` | `…/leads` | `LeadsPage.tsx` | — | Pipeline table, filters, account scope, semantic handoff/stage badges. |
| `lead-detail` | `…/leads/:leadId` | `LeadDetailPage.tsx` (593 L) | — | Tabs (Overview/Conversation/Activities/Notes), captured fields, scoring, deals. |
| `automations` | `…/automation` | `AutomationPage.tsx` | `automation/JourneyTable.tsx`, `JourneyTablePaginated.tsx`, `AutomationTabs.tsx` | My automations / templates, filters, bulk actions, row menu, mobile cards. |
| `builder` | `…/automation/journeys/:campaignId` | `JourneyBuilderPage.tsx` | `automation/JourneyBuilder.tsx` (1.2K), `BuilderCanvas.tsx` (1.4K), `Inspector.tsx` (1.6K), `NodeInspectorDialog.tsx`, `LeadsPanel.tsx` | **Flagship / biggest.** Flow/Setup/Results/Leads tabs, inspector, validation, save/publish lifecycle. Treat as its own track. |
| `knowledge` | `…/knowledge` | `KnowledgePage.tsx` | `components/KnowledgeBasePanel.tsx` | Source trust (Ready/Processing/Needs review/Failed), retrieval test. |
| `content` | `…/content` | `ContentPage.tsx` | — | Media cards, trigger terms, review comments. |
| `analytics` | `…/analytics` | `AnalyticsPage.tsx` | `components/LeadsByStageDonut.tsx` | Activity vs. conversion tabs; honest metric definitions; chart tokens. |
| `integrations` | `…/integrations` | `IntegrationsPage.tsx` | — | Account health, coming-soon/disabled pattern. |
| `team` | `…/team` | `TeamPage.tsx` | — | Members, roles, pending invites, role-permission table. |
| `billing` | `…/billing` | `BillingPage.tsx` | `components/BillingPanel.tsx` | Plan, usage meters, honest “not configured” states. |
| `settings` (+ `settingsSection`) | `…/settings` | `SettingsPage.tsx` | `components/ScoringRulesPanel.tsx`, section panels | General / Lead fields / AI behavior / Forbidden topics / Escalation / Scoring / Appearance / Profile / Notifications. |
| `login` | `/login` | `LoginPage.tsx` | — | Method → email → 6-digit code flow. |
| `connect-error` | `/connect` | `ConnectPage.tsx` | — | Connection recovery states. |
| `invite` | `/invite` | `InvitationAcceptPage.tsx` | — | Invitation recovery states. |
| `docs` | `/docs/*` | `DocsPage.tsx` | — | Documentation shell. |

> The standalone `PrecisionOperationsPreviewPage`, `WorkspaceSettingsPreviewPage`,
> and all `precision-operations-*.css` files are **preview-only**. They are never
> edited for production work and never imported by production pages.

---

## 7. Definition of done (per route)

A ported route is done when all are true (see also `FLAGSHIP_REDESIGN_PLAN.md` §9):

- [ ] Matches the preview's layout, hierarchy, spacing, and copy at 1440 / 1024 / 768 / 390.
- [ ] Uses only `index.css` tokens and `ui/` primitives — no `--po-*`, no `.po-*`, no imported preview CSS, no new palette.
- [ ] Any new token/primitive was added centrally (light + dark) and reused, not hard-coded.
- [ ] Real data wired; no sample values on the production surface; permissions respected.
- [ ] States implemented: first-use empty, loading, no-results, recoverable error, success, and relevant edge cases (long names, partial data, disconnected, denied).
- [ ] Light + dark both correct; visible focus, labels, contrast, `prefers-reduced-motion` honored.
- [ ] Buttons name their action; status colors keep meaning; no decorative gradient/glass/neon added.
- [ ] `npx oxlint --format=unix && npm run build` pass; no unrelated screens restyled.
- [ ] Side-by-side screenshot vs. preview attached to the PR (light + dark).

---

## 8. Suggested order (from `FLAGSHIP_REDESIGN_PLAN.md` §7)

0. **Foundation:** token mapping + add token/primitive gaps (§5) + `AppShell` shell/nav/sidebar/icons + theme/palette. *Do this first; it unblocks everything and parallelizes the rest.*
1. **Trust & correctness:** Login/recovery, Integrations, Billing, Knowledge.
2. **Core workflows:** Overview, Inbox, Leads list + detail, Automations list.
3. **Flagship:** Automation Builder (own track).
4. **Observability & admin:** Analytics, Settings & Team, Content, Docs.

After Phase 0, screens are largely independent and can be split across people.

---

## 9. PR & commit conventions

- One route per branch/PR: `feat/redesign-<screen>` (e.g. `feat/redesign-leads`).
- Commit style: `feat(redesign): port <screen> to production design`.
- PR body: link the preview URL for the screen, list states covered, attach
  light + dark side-by-side screenshots, and tick the §7 checklist.
- **Update [`PREVIEW_TO_PRODUCTION_LOG.md`](./PREVIEW_TO_PRODUCTION_LOG.md) in the
  same PR:** tick the screen/feature you ported. If you added a screen/feature to
  the preview, add it to the log as an unticked row.
- Do not merge the preview branch or any `precision-operations-*.css` into production.

---

## 10. Common pitfalls

- **Copying `po-` CSS wholesale.** It is scoped to `.po-preview-app`, keyed to the
  `--po-*` namespace, and will fight production tokens. Read values; re-implement.
- **Hard-coding a hex** because “there's no token.” Add the token (§5 gaps) and use it.
- **Shipping sample data.** The preview fakes everything; production must use real
  endpoints, loading/error/empty states, and permissions.
- **Breaking dark mode** by using a light-only value. Always use tokens that have a
  dark counterpart, and test the dark theme.
- **Scope creep.** Porting one screen must not restyle another. No broad selectors.
- **Skipping states.** The happy path is ~40% of the work; the states are the rest.
