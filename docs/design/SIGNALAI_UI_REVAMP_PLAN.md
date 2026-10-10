# SignalAI UI Revamp Plan

**Status:** Proposed — design and implementation plan only  
**Repository:** `akashdnb/signalAI`  
**Primary branch reviewed:** `main`  
**Scope:** Frontend visual system and UX consistency across the authenticated SaaS product, with special care for the automation/journey builder.

## 1. Executive direction

### Product position
SignalAI should feel like a **calm, premium, AI-native business workspace**: a place where a creator or business understands what is happening in customer conversations, what the AI did, which leads are valuable, and where a human needs to intervene.

The goal is not to make the product look “more futuristic.” The goal is to make it feel trustworthy, distinct, easier to scan, and more actionable.

### Recommended design blend
- **Foundation (about 70%):** modern SaaS/productivity UI, in the spirit of Linear/Stripe/Intercom—not a direct copy.
- **Workflow layer (about 15%):** contextual, layered workspace patterns for Inbox and Automation.
- **AI treatment (about 10%):** restrained violet/indigo surfaces, sparkle/AI labels, clear confidence and activity cues.
- **Micro-interaction (about 5%):** light elevation/pressed states and very occasional blur or gradient.

These are directional weights, not literal CSS quotas.

### Explicitly avoid
- Pure neumorphism across the app: weak separation and discoverability for dense CRM/automation screens.
- Full glassmorphism everywhere: visual noise, blur behind text and controls.
- Generic “dark purple glowing AI dashboard” styling.
- Card-everything layouts where each content group has the same border, radius and shadow.
- Decorative gradients that obscure data hierarchy.

**Light mode is the reference design.** Dark mode remains supported and should be made intentional and tested; it is not a separate redesign that can drift from the light theme.

---

## 2. Repository findings that shape the plan

The repository already has substantial UI foundations, so the revamp should be incremental rather than a frontend rewrite.

### Existing foundations to preserve
- React 19 + TypeScript + Vite frontend in `client/`, Tailwind CSS v4 utilities, and React Router.
- `client/src/components/AppShell.tsx` owns the authenticated navigation shell, tenant/account state, AI-token usage, theme control and plan card.
- `client/src/index.css` contains the shared CSS variables, Tailwind token bridge, hand-written component styles, light/dark theme rules, and core classes such as `.page`, `.card`, buttons, inputs and pills.
- The brand guide at `docs/signalai-brand-assets/BRAND-GUIDE.txt` specifies Purple `#7C3AED`, Blue `#2563EB`, Cyan `#22D3EE`, Dark `#0F172A`, Background `#F1F5F9`, and muted text `#6B7280`.
- The journey builder uses `@xyflow/react`; editing is local-draft-first with explicit save/discard, dirty-state tracking, and protection when navigating away.
- Node editing is dialog-based through `NodeInspectorDialog`/shared `BottomSheet`. Keep this pattern; **do not introduce a persistent right-side inspector**.
- Goal editing must retain its existing **Basic, Capture Fields, Validation, Success Message** tabs.

### Current inconsistencies / opportunities
- The Overview uses a fixed `maxWidth: 1080`, while other pages mix `.page` defaults, custom grid classes and per-page wrappers. Result: page widths and horizontal rhythm can feel inconsistent.
- Global `.card` applies a border, 14px radius, generous padding and a shadow. Repeating that on almost every data region produces a “rounded-card template” feel.
- The dashboard uses four icon-first StatCards, a large conversation chart, a lead-stage donut and a recent-conversations list. Low-volume / zero values can leave very large, uninformative chart areas.
- The top bar puts the tenant/Instagram connection, token quota/progress, theme, notification affordance and account menu at the same level.
- Purple is currently used for brand identity and many interactive/illustrative surfaces. It needs stronger semantics, not necessarily a new brand color.
- Page shells vary: Overview, Leads, Analytics, Knowledge, Content and Settings are not all visibly based on one shared page header / toolbar / section rhythm.
- Some secondary Automation tabs are explicitly “coming soon.” Do not imply unfinished destinations are live; use clear disabled states and meaningful labels.
- Dark-mode tokens exist already, but the supplied screenshot shows low surface separation and a visually heavy navy field. The dark theme needs a focused contrast/surface pass.
- The screenshots show sparse sample data. Empty/loading/low-data states need designed treatment; do not fill them with invented activity or misleading percentages.

These are code-level observations from the files inspected, combined with the UI screenshots shared in the discussion.

---

## 3. Design principles

1. **Business outcome first.** Prioritize conversations, leads, qualification, response needs and measurable conversion over vanity metrics.
2. **AI is a capability, not a background effect.** Distinguish AI-generated / AI-handled / human-owned work using consistent labels and states.
3. **Keep information density purposeful.** Use compact layouts for operational tables and Inbox; use breathing room for empty states, onboarding and focused configuration.
4. **Use fewer surface containers.** Establish page background, content surface, separators and the occasional raised panel. Not every section needs a card.
5. **Make state visible.** Connected, running, paused, needs attention, unsaved, saving, saved, error and empty must be distinct and accessible.
6. **Consistency without flattening differences.** Shared controls and typography should match across pages; the Inbox and Journey Builder can still have task-specific layouts.
7. **Preserve working behavior.** This is primarily a design and usability revamp, not a backend/API overhaul.
8. **Design from the real data.** Treat missing revenue as unavailable (not ₹0), avoid presenting zero-filled charts as activity, and never fabricate trend deltas.

---

## 4. Proposed visual system

### 4.1 Palette and semantics

Keep the established SignalAI purple; refine its usage before changing brand colors.

| Token / role | Proposed light value | Usage |
|---|---|---|
| Canvas | `#F7F8FB` | Main app background; softer than current blue-gray |
| Primary surface | `#FFFFFF` | Sidebar, core panels, dialogs |
| Elevated surface | `#FFFFFF` with restrained shadow | Popovers, menus, focused/raised items only |
| Main text | `#171A24` | Headings and primary values |
| Secondary text | `#667085` | Helper text, timestamps, labels |
| Divider / border | `#E6E8EF` | Quiet separators, table boundaries |
| Brand / primary action | `#7C3AED` | Primary CTA, selected navigation, AI actions |
| Brand hover | `#6D28D9` | Primary action hover |
| Brand subtle surface | pale violet (e.g. `#F4EEFF`) | AI chips, selected state backgrounds |
| Success | green with accessible text/background pair | Connected, completed, healthy |
| Warning | amber pair | Limits, incomplete setup, caution |
| Error | red pair | Failed operations, blocked messaging, destructive states |
| Informational | blue pair | Neutral system notices |
| Cyan | existing `#22D3EE`, sparingly | Secondary chart series or special visual accent |

These are proposed refinements, not a request to replace tokens immediately. Validate foreground/background contrast first, then update the existing token definitions rather than layering a second token system over `index.css`.

### 4.2 Dark mode
Retain the existing toggle and theme preference behavior. Refine the dark palette around:
- Canvas: deep neutral/slate, not near-black everywhere.
- Sidebar: slightly distinct from canvas.
- Main surface: a visibly separate elevated slate surface.
- Border: enough contrast to define card/table edges without creating outlines around everything.
- Main text: high-contrast off-white.
- Violet accents: keep readable; avoid dark violet-on-dark-violet controls.
- Charts: use series colors with legible contrast on dark surfaces.

Do not force dark mode off or remove support. Ship the visual system light-first, then validate parity in dark mode.

### 4.3 Typography
Use the existing Plus Jakarta Sans stack as the starting point; avoid a font migration in the first phase. Refine a scale, line heights and weights:
- Page title: 26–30px, semibold/bold, tight line-height.
- Section title: 16–18px, semibold.
- KPI value: 26–30px; label 12–14px.
- Body/control: 13–14px for desktop density, 14–16px where reading is primary.
- Metadata: 12px, with sufficient contrast.
- Avoid large all-caps labels except for tiny, optional section overlines.

### 4.4 Spacing and shape
- App sidebar: about 220–232px at desktop, collapsed/overlay navigation on smaller viewports.
- Header: keep compact around 56–60px.
- Main content: one shared max-width and horizontal padding scale, with a full-width mode for task-heavy pages.
- Base spacing: 4px system; use 8/12/16/20/24/32 consistently.
- Cards / panels: 12–14px radius, depending on content density; avoid increasing all radii.
- Buttons and inputs: 8–10px radius.
- Chips/badges: pill only for short status labels, not arbitrary metadata.
- Shadows: tiny ambient shadow only where depth clarifies layering. Borders/separators do most of the work.

### 4.5 Interaction states and motion
- Provide clear hover, active, focus-visible, disabled, loading and pressed states.
- Keep motion subtle (roughly 120–180ms for color/opacity and 160–220ms for small transitions).
- Honor `prefers-reduced-motion`.
- Use a visible focus ring in both themes.
- Never rely on color alone to communicate status.

---

## 5. Shared application shell

**Primary file:** `client/src/components/AppShell.tsx`  
**Supporting files:** `client/src/components/ThemeToggle.tsx`, `client/src/index.css`, `client/src/components/icons/*` (as applicable)

### Sidebar
Keep current information architecture and names: Overview, Inbox, Leads, Automation, Knowledge, Content, Analytics; divider; Team, Integrations, Billing, Settings. Keep Contacts and Broadcasts visible as “Soon” only if the product decision remains to advertise them.

Improvements:
- Tighten consistent vertical rhythm and align every icon/label.
- Selected item: pale violet surface + violet icon/text. Add a restrained left marker only if it improves active-route scanning; do not combine multiple loud cues.
- Hover: subtle neutral surface.
- Unread Inbox count: use a calm badge; reserve red for urgent attention, not ordinary unread count.
- Distinguish primary workflow navigation from administrative destinations with spacing / separator rather than extra card containers.
- Keep the trial/upgrade card at the bottom, but simplify border/shadow and align it with the sidebar surface.
- Verify scroll behavior: nav list may scroll independently; plan card should remain anchored and not overlap items.
- Preserve and test mobile overlay/menu behavior.

### Top bar
Current token quota, theme, notifications and account controls compete horizontally. Refine the hierarchy:
- Left: workspace/tenant selector and compact Instagram connection state.
- Right: usage indicator (compact; clicking can route to Billing/usage when available), theme toggle, notification control, account menu.
- Put connection status next to the workspace identity, not as another floating dashboard badge.
- Keep account menu, logout, tenant details and responsive mobile account sheet functional.
- If notifications are only a placeholder, style them as a placeholder or remove the implied affordance until actionable (do not imply working notifications without behavior).
- Keep the top bar stable between routes.

---

## 6. Page-by-page redesign

### 6.1 Overview / Dashboard
**Files:** `client/src/pages/DashboardPage.tsx`, `client/src/components/ConversationsChart.tsx`, `client/src/components/LeadsByStageDonut.tsx`

Goal: a concise operational briefing, not an empty analytics canvas.

Proposed information hierarchy:
1. Page heading and short context line.
2. Workspace connection or onboarding action (only when relevant).
3. KPI row: New leads, Qualified leads, Meetings scheduled, Revenue won.
4. Main row: conversation activity (wide) plus an actionable “AI activity / Needs attention” panel if suitable data exists; otherwise show a designed low-data state.
5. Lead pipeline breakdown.
6. Recent conversations/leads with status and last activity.

Specific changes:
- Reduce excessive chart height when data is sparse; ensure chart drawing area is proportional to its content.
- Time range selector should be added only if data APIs support the same range consistently.
- Charts should show axis labels/gridlines only when they add meaning; keep their colors restrained and map series consistently.
- If data is empty or effectively all-zero, show a helpful empty state with a next action (e.g. open Inbox, create an automation, connect Instagram). Do not show a dramatic spike caused by a single event without adequate context.
- Distinguish “no revenue recorded” from true zero revenue. Keep the em dash / unavailable meaning when no revenue value exists.
- KPI change indicators must only display if there is a reliable comparison API; never hard-code sample percentage deltas.
- Rename “Recent conversations” only if the content actually contains lead records rather than full conversation objects; current code links recent entries to lead detail.
- Add an explicit “Needs attention” module only when the API can determine actionable attention states (for example, human-handoff requested); do not infer unimplemented signals.
- Maintain useful desktop density and stack cleanly on small screens.

### 6.2 Inbox
**Files:** `client/src/pages/InboxPage.tsx`, `client/src/components/ThreadPanel.tsx` and related conversation components.

Goal: make the Inbox feel like a focused communication workspace.

- Keep a three-zone structure where viewport permits: conversation list, active thread, contextual lead controls—using the existing layout where possible.
- Improve search and filter hierarchy: All, Unread, AI Handling, Qualified, Needs Attention.
- Conversation rows should prioritize avatar/username, last message, time, unread state, and AI/human ownership.
- Selected conversation state should be obvious but not overly saturated.
- Separate thread transcript from metadata and actions; keep message sending and Meta's 24-hour window restriction highly clear.
- Human takeover / release and pending handoff require distinct, explicit visual state.
- Compact tags, assignment, lead-stage controls and contact facts; avoid nested cards inside cards.
- Preserve current 15-second list refresh behavior, pending-entry handling, read-state updates, assignment, pipeline-stage updates and handoff behavior.
- Design loading, no conversations, no filter matches, send failure, closed messaging window, and handoff-awaiting-response states.
- Mobile: list/detail navigation must remain clear, with a predictable return to conversation list.

### 6.3 Leads / Lead detail
**Files:** `client/src/pages/LeadsPage.tsx`, `client/src/pages/LeadDetailPage.tsx`

Goal: an efficient lightweight CRM rather than a generic table in a card.

- Add a shared page heading with title, explanation and contextual primary action only when one exists.
- Keep search and filters in a compact toolbar above the table.
- Reduce table padding where useful; align numbers and dates, keep stage / handoff states visually distinct, and use subtle row separators.
- Make rows scannable: username, stage, handoff owner/state, last contact/channel, messaging-window status.
- Keep table usability on mobile via deliberate horizontal scrolling or stacked row layouts—not a squeezed desktop table.
- Lead detail: prioritize identity, stage, conversation context, captured fields, qualification/handoff and recent activity. Ensure key actions do not disappear below long metadata.
- Use a shared stage color mapping that is consistent in table, dashboard, analytics and inbox.

### 6.4 Automation list
**Files:** `client/src/pages/AutomationPage.tsx`, `client/src/components/automation/AutomationHeader.tsx`, `AutomationTabs.tsx`, `JourneyTable.tsx`, `NewJourneyDialog.tsx`

Goal: make automation feel like a powerful workflow product, not a settings page.

- Keep the page title/description and Docs entry point, but normalize header alignment and spacing with other pages.
- Keep visible active-tab underline; preserve the existing dialog-based journey creation flow.
- Improve journey rows with consistent status, trigger type, last updated, and clear row actions.
- Make the primary “New journey” action the most obvious action; avoid multiple competing violet controls.
- For tabs that are not yet implemented, keep a graceful disabled/coming-soon state and do not show empty-looking fake content.
- Support loading, no journeys, filters with no results, errors, and inactive journeys.

### 6.5 Journey Builder
**Files:** `client/src/components/automation/JourneyBuilder.tsx`, `BuilderCanvas.tsx`, `BuilderNode.tsx`, `NodeInspectorDialog.tsx`, `Inspector.tsx`, `PreviewDialog.tsx`, `TestJourneyDialog.tsx`, `AnalyticsPanel.tsx`, `LeadsPanel.tsx`.

Goal: a clean visual automation canvas that remains task-focused and safe to edit.

Non-negotiable behavior constraints:
- Node movement, connection and layout changes are local until the user explicitly clicks Save.
- Preserve draft dirty state, “saved/saving/unsaved” status, version handling, save-error recovery and save/discard/keep-editing navigation protection.
- Never regress to saving the graph on every drag or interaction.
- Keep node inspector/editor dialog-based. **Do not add a right-side persistent inspector.**
- Preserve Goal editor tabs: **Basic, Capture Fields, Validation, Success Message**.
- Preserve Preview, Test journey, Publish confirmation, and existing journey tabs unless a separate product decision approves change.

Visual improvements:
- Reduce canvas chrome and give the actual graph more room.
- Make the node palette compact, consistent and scannable; clearly separate available actions from “Soon” nodes.
- Give node types semantic icon/color accents, but use restrained light fills with clear readable text.
- Improve selected-node outline and connection handles without making every node glow.
- Normalize edge/arrow contrast in light and dark themes.
- Keep zoom/fit, minimap and controls accessible without covering nodes.
- Treat the graph background as a work surface (subtle dot/grid pattern, minimal contrast); avoid blur/glass overlays behind text.
- Build a clear top-level builder header with journey name, status, save state, Save, Preview/Test, and Publish actions prioritized according to the existing product behavior.
- Save should be visibly disabled when clean, enabled when dirty, and show loading/error states when saving.
- Keep navigation warnings concise and action-oriented.
- Ensure canvas remains usable on smaller screens; maintain tap-to-edit behavior and dialogs/bottom sheets for node editing.
- Check keyboard navigation and node controls after visual changes.

### 6.6 Knowledge
**Files:** `client/src/pages/KnowledgePage.tsx`, `client/src/components/KnowledgeBasePanel.tsx`

Goal: communicate that knowledge is what grounds AI answers.

- Standardize page heading and supporting copy.
- Organize document upload, indexing/status, and document list as a clear flow (only reflect states the API actually exposes).
- Use a strong upload drop zone sparingly; make indexing/errors/empty knowledge base understandable.
- Explain where knowledge is used without overstating its scope; current copy says journeys can enable knowledge-base context.
- Make destructive/retry actions explicit and confirm removal where needed.

### 6.7 Content
**Files:** `client/src/pages/ContentPage.tsx` and any media-card components.

Goal: make observed Instagram content easy to inspect and use for targeting.

- Use a responsive media grid/list with visible media type, last-seen time and post context when available.
- Filter tabs should be compact and clearly selected.
- Design empty/error/loading states that explain how content appears, not generic blank space.
- Use imagery as content; don't apply generic elevated cards to every thumbnail.
- Ensure the type filter is derived from real media types (as existing code already does).

### 6.8 Analytics
**Files:** `client/src/pages/AnalyticsPage.tsx`, related chart/table components.

Goal: make metrics interpretable, honest and useful.

- Give conversion funnel, revenue, top posts and top keywords a consistent hierarchy.
- Keep an accessible table equivalent for charts.
- Use consistent pipeline colors and meaningful percentages; maintain current correct rule that funnel subset percentages are anchored to Leads (with independent event counts explained).
- Add time filters only when backed by API support.
- Prioritize insights that are backed by existing data; don't manufacture “AI insights.”
- Prevent empty panels from consuming large areas; use contextual empty states.
- Distinguish no data, zero values and load failure.
- Review chart legends, axis labels, responsive sizing and dark-theme contrast.

### 6.9 Settings, integrations, team and billing
**Files:** `SettingsPage.tsx`, `IntegrationsPage.tsx`, `TeamPage.tsx`, `BillingPage.tsx`, shared panels.

- Establish page headings, intro copy, section spacing and action placement.
- Group related configuration logically; use dividers for simple groups and cards only for substantial independent panels.
- Use consistent field spacing, labels, descriptions, validation errors and save feedback.
- Keep sensitive/destructive actions visually distinct.
- Ensure usage/quota shown in shell and billing remains consistent; usage warnings must not overtake every page.
- Design permission, empty, loading, error and success states consistently.

### 6.10 Login / onboarding / documentation
**Files:** `LoginPage.tsx`, `OnboardingWizard.tsx`, `DocsPage.tsx`, docs CSS.

- Carry the same typography, color, buttons and spacing into auth/onboarding without making them look like the dashboard.
- Treat onboarding as guided setup: connect account, clarify value, configure required settings and establish the first useful automation. Only show steps actually supported by the current flow.
- Give documentation a calm content-first layout with readable line length, left navigation, clear heading hierarchy, code/steps, and contextual links back to the product.
- Keep docs editorial and less card-heavy, as discussed.

---

## 7. Shared component and token work

Prioritize building consistency before polishing every page independently.

### Token layer
Audit and normalize existing variables in `client/src/index.css`; do not create duplicate design-token systems. Establish documented values for:
- Canvas / surface / raised surface
- Text primary / secondary / disabled
- Border / divider / focus ring
- Brand / hover / subtle brand background
- Success / warning / danger / info
- Spacing and radius
- Shadows
- Type scale
- Layer/z-index conventions

Ensure Tailwind utilities and legacy CSS classes continue to resolve to the same live variables, including theme switching.

### Shared primitives to establish/refine
- `AppPageHeader`: title, description, optional actions and status.
- `PageContainer`: common width/padding; optional wide workspace variant.
- `Button`: primary, secondary, quiet, destructive, icon-only, disabled/loading.
- `StatusBadge`: connected, active, paused, draft, qualified, AI handling, human handling, needs attention, errors.
- `Panel` / `Section`: avoid mandatory card wrappers; support plain and bordered variants.
- `EmptyState`: icon/illustration, headline, concise explanation, one relevant action.
- `LoadingState` / skeletons.
- `ErrorBanner` and toast conventions.
- `PageToolbar`: search, filters and actions.
- Table primitives / row states.
- Focus-visible and keyboard-accessible icon button patterns.

Do not immediately refactor every component to a new abstraction. Add primitives only where they remove real duplication, then migrate route-by-route.

---

## 8. Phased implementation roadmap

### Phase 0 — Baseline and inventory
**Deliverables**
- Capture reference screenshots for Overview, Inbox, Leads, Automation list, Journey Builder, Knowledge, Content, Analytics, Settings and mobile layouts.
- Inventory routes/components and identify global CSS selectors with cross-page impact.
- Record functional smoke checks for existing actions and the journey builder's draft/save flow.
- Decide on the target viewport sizes (desktop 1440/1280, tablet, mobile 390/375).

**Acceptance**
- Current routes and major actions have an agreed baseline.
- A change-risk checklist exists before broad CSS changes.

### Phase 1 — Design tokens and app shell
**Scope**
- Refine `index.css` tokens, type hierarchy, radii, borders, buttons, inputs, focus rings and surfaces.
- Standardize AppShell navigation and top-bar hierarchy.
- Keep brand identity and existing theme preference behavior.
- Test light and dark mode together.

**Acceptance**
- Same shared elements look consistent across all routes.
- No native browser button chrome, broken input/autofill styles, inaccessible muted text or invisible dark-mode controls.
- Desktop and mobile navigation, profile menu, trial card, usage display and theme toggle remain functional.

### Phase 2 — Overview dashboard
**Scope**
- Rework the Overview into a concise, action-oriented business briefing.
- Improve KPI cards, chart proportions, lead-stage summary, recent lead rows and data-dependent empty/low-data states.
- Move connection status into workspace context where practical.

**Acceptance**
- Empty/low-data workspaces do not show huge meaningless charts.
- No invented comparative percentages, revenue, AI activity or attention counts.
- Existing API data and navigation destinations remain correct.

### Phase 3 — High-frequency operational pages
**Scope**
- Inbox, Leads and Lead Detail.
- Focus on scanability, selection state, clear AI/human ownership and compact but usable metadata.

**Acceptance**
- Conversation filters, polling, send flow, messaging-window rules, read state, handoff, assignment and stage change still work.
- Lead search/filters/links remain correct.
- Mobile layout is usable and preserves important controls.

### Phase 4 — Automation and journey builder
**Scope**
- Refine Automation list and Journey Builder visuals.
- Improve canvas work surface, node palette, selected states, graph contrast, builder top actions and save affordance.
- Preserve the existing dialog pattern and unsaved-draft safety.

**Acceptance**
- Dragging/moving/connecting nodes changes local draft only.
- Save increments the version only when explicitly invoked and data is dirty.
- Save failure retains draft; discard restores the saved graph.
- Navigation away while dirty offers keep editing / discard / save and continue.
- Inspector remains a dialog; Goal tabs remain Basic, Capture Fields, Validation, Success Message.
- Preview/test/publish flows remain available.

### Phase 5 — Knowledge, Content, Analytics
**Scope**
- Normalize page title hierarchy, toolbars, filters, panels, visualization empty states and data tables.
- Ensure chart semantics remain correct.

**Acceptance**
- Charts remain interpretable and accessible; tables offer equivalent data where currently supported.
- Zero, no data, loading and error are distinct states.
- No fabricated insights.

### Phase 6 — Admin pages, onboarding, documentation
**Scope**
- Settings, Team, Integrations, Billing, Connect/Login, onboarding and docs.
- Migrate repeated UI patterns to the shared system.

**Acceptance**
- Common forms, panels, notices and buttons are visually consistent.
- Existing account, billing, knowledge, settings and onboarding workflows continue to work.

### Phase 7 — QA, accessibility and polish
**Scope**
- Responsive pass, keyboard/focus testing, contrast checks, reduced motion, browser visual QA and regression run.
- Address build/lint/tests separately from cosmetic changes; do not smuggle behavior changes into styling PRs.

**Acceptance**
- Frontend build and lint pass (or any pre-existing failure is explicitly recorded).
- Functional smoke tests pass.
- Light and dark mode tested on representative pages.
- No critical overflow, obscured actions, unreadable statuses or navigation regressions.

---

## 9. Recommended execution strategy

Use small, reviewable PRs. Do not attempt an all-pages rewrite in one change.

Suggested sequence:
1. **PR 1:** Tokens + shared primitives + AppShell.
2. **PR 2:** Overview dashboard.
3. **PR 3:** Inbox / Leads / Lead Detail.
4. **PR 4:** Automation list.
5. **PR 5:** Journey Builder canvas and controls (visual-only except UI state needed for save affordance).
6. **PR 6:** Knowledge / Content / Analytics.
7. **PR 7:** Settings / Team / Integrations / Billing / onboarding / docs.
8. **PR 8:** Responsive, accessibility and visual regression cleanup.

Each PR should include:
- Scope and screenshots before/after.
- A list of routes/components changed.
- Functional smoke checks performed.
- Explicit statement whether behavior/API changed (default should be “no”).
- Any known data/API limitations that impact the design.

---

## 10. Functional regression checklist

### Shared shell
- [ ] Auth redirect and tenant scoping
- [ ] Workspace name and Instagram connection state
- [ ] Usage quota / near-limit display
- [ ] Theme toggle and persisted preference
- [ ] Profile menu and logout
- [ ] Inbox unread badge
- [ ] Mobile sidebar/account sheet
- [ ] Trial card and upgrade navigation

### Overview / data
- [ ] Analytics, funnel, revenue, timeseries and leads load
- [ ] Connect Instagram flow and connected query banner
- [ ] Recent lead navigation
- [ ] Loading, empty, error, zero and unavailable revenue cases

### Inbox / leads
- [ ] Filters, search, selection, read state and polling
- [ ] Message send and pending entries
- [ ] 24-hour messaging window display / server restriction
- [ ] Handoff request/takeover/release
- [ ] Assignment and pipeline-stage updates
- [ ] Lead detail deep links and table filters

### Automation
- [ ] List, create, navigate to journey
- [ ] Drag/move nodes, connect edges, add/reorder/remove goals
- [ ] Local draft state remains unsaved until Save is clicked
- [ ] Save disabled when clean; enabled when dirty
- [ ] Save sets saved state and updates version; errors preserve draft
- [ ] Discard restores backend snapshot
- [ ] Internal tab change, route navigation and browser back/forward guard dirty drafts
- [ ] Inspector dialog opens/closes and warns on dirty node edits
- [ ] Goal tabs unchanged
- [ ] Preview, test journey, publish confirmation and version/analytics/lead tabs

### Whole app
- [ ] `npm run build` in `client/`
- [ ] `npm run lint` in `client/`
- [ ] Existing tests run; pre-existing CI/test issues are documented rather than hidden
- [ ] Desktop, tablet, mobile; light and dark theme
- [ ] Keyboard-only navigation, focus-visible states, reduced motion
- [ ] Contrast for text/statuses/graph edges in both themes

---

## 11. Success criteria

The redesign is complete when:
- The product reads as one intentional design system across routes, not a collection of individually styled pages.
- The first screen communicates business outcomes and operational status without empty visual bulk.
- AI activity is identifiable through meaningful labels and state treatment, not pervasive purple glow.
- Inbox and journey editing remain efficient and safe.
- Empty/error/loading states explain what happened and what the user can do next.
- Light and dark themes have comparable hierarchy and accessibility.
- No core behavior regresses as a side effect of styling.

## 12. Out of scope unless separately approved

- Backend/API changes to produce new analytics.
- Adding AI-generated insight claims or trend percentages without data support.
- Reworking journey semantics, publish/version behavior or save architecture.
- Replacing the dialog-based node inspector with a right-side panel.
- Changing the product's navigation or hiding upcoming destinations without a product decision.
- Replacing the font, charting architecture or route structure just for visual novelty.

---

## Design north star

> **SignalAI is a premium AI-native business workspace: calm, clear and operationally powerful.**
>
> Light-first; compact but not cramped; strong typography; restrained borders and shadows; purple reserved for brand, primary actions and meaningful AI cues; data visualizations grounded in real data; explicit save and ownership states; no excessive gradients, glass or neumorphism.
