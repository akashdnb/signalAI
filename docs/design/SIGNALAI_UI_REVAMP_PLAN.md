# SignalAI UI Revamp Plan

**Status:** Implementation in progress — shared foundation, page layout and Journey Builder explicit-save slice; source-reviewed against `main` on 2026-10-10  
**Repository:** `akashdnb/signalAI`  
**Primary branch reviewed:** `main`  
**Scope:** Frontend visual system and UX consistency across the authenticated SaaS product, with special care for the automation/journey builder. This plan includes a verified current-code delta section; it does not claim runtime/browser QA.

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

### Implementation kickoff

**Active branch:** `feat/ui-revamp-phase-1`

The implementation branch now includes shared focus-visible styling and contrast-token groundwork; modal/dialog focus handling; toast live announcements; accessible search/filter labels; keyboard-operable Automation, Journey Builder, inspector and Lead Detail tabs; a focus-managed mobile navigation drawer; shared page-width/surface conventions; dashboard empty/all-zero/error states; mobile-safe data tables/forms; visible retry paths for failed data loads; and an Add Goal action on the mobile builder canvas.

The Journey Builder save model now commits graph edits and goal structure/order/content as one version-checked transaction. Inspector “Apply to draft” does not persist independently; goal loading is guarded before Save; canvas-only saves preserve goal IDs; zero-goal journeys are saveable; and failed saves retain the draft. Backend regression tests cover empty-goal saves, goal creation, ID preservation, and rollback of invalid combined drafts.

The branch also adds a dedicated Chromium Playwright workflow with 12 route/interaction checks: mobile overflow across operational pages, Login/Docs, mobile drawer keyboard dismissal, populated Inbox recovery, Lead Detail arrow-key tabs, operational-page retry recovery, and an axe scan for critical violations on Leads. Browser reports/traces are uploaded as workflow artifacts.

**Verification snapshot (2026-10-10):** Client lint and production build passed on commit `70ae871`; the Chromium smoke suite passed on the same commit. Server CI passed typecheck, production build, database migrations and the full database-backed test suite on commit `b18b16c`, including the atomic-save regression tests. Real-device visual QA, tablet and dark-theme review, and manual keyboard/screen-reader testing have not been completed. The revamp remains in progress; those checks stay open rather than being treated as covered by automation.


---

### Audit findings to treat as implementation requirements

A source-level audit is documented in [SIGNALAI_UI_UX_AUDIT.md](./SIGNALAI_UI_UX_AUDIT.md). The findings below are a snapshot of `main` reviewed on 2026-10-10, not a claim that every item remains unimplemented on the active branch. Use the implementation progress above for branch-specific status. This is code inspection, not a formal WCAG conformance claim; browser, keyboard, assistive-technology and automated accessibility checks still need to be run during implementation.

#### P1 — Resolve before calling the journey builder safe
- **One consistent draft/save boundary.** In the reviewed code, BuilderCanvas keeps node movement and edge connections local, but JourneyBuilder calls the milestone API immediately when goals are added, removed or reordered. The server synchronizes milestone edits into the graph and advances its version. Graph positions, connections, graph structure, goal ordering and goal content must participate in one coherent draft/save model. No journey edit should commit or increment the saved version before the primary explicit Save action.
- **Preserve the inspector dialog pattern.** Do not introduce a persistent right-side inspector. Preserve the Goal editor tabs: Basic, Capture Fields, Validation, Success Message. Make the meaning of the inspector's Save/Apply action explicit; it must not secretly persist part of the journey ahead of the agreed Save boundary.
- **Fix the shared modal primitive.** BottomSheet marks a custom container as a modal dialog but does not itself implement initial focus, focus containment, focus restoration or Escape handling. Adopt a tested accessible dialog primitive or implement and verify those behaviors. Audit publish confirmation, unsaved-change prompts and mobile account UI because they share the component.

#### P2 — Address in the shared design-system pass
- **Contrast:** the source-token audit calculated about 3.58:1 for green success text (#059669 on #ECFDF5), 4.41:1 for muted text (#6B7280 on canvas #F1F5F9), and 1.81:1 for the cyan chart series (#22D3EE on white). Verify real component pairings in both themes. Target at least 4.5:1 for normal text and 3:1 for meaningful graphical objects, and darken success text / chart cyan-teal as needed.
- **Form names:** add explicitly associated labels to Leads stage and handoff filters and search fields; give Inbox search an accessible name. Prefer visible labels over placeholders where space permits.
- **Live feedback:** add an intentional live-region strategy to the shared toast stack. Routine success/status messages should be announced politely; reserve assertive alerts for genuinely urgent errors and avoid duplicate announcements.
- **Keyboard interactions:** BuilderNode is a button-like div with nested menu buttons. Ensure Enter/Space on child actions does not also trigger parent node selection. Verify node controls with Tab, Shift+Tab, Enter and Space.
- **Tabs:** use one consistent semantic model. Real navigation should use links; in-place tabs should expose selected state and expected keyboard behavior. Apply the chosen pattern to Automation and Journey Builder tabs.
- **Mobile navigation:** expose expanded/collapsed state and deliberately manage focus and background interaction according to the chosen modal or non-modal drawer pattern.
- **Truthful affordances:** review the workspace chevron, Notifications control and Upgrade destination. Visible controls must work as presented or be clearly marked non-interactive.
- **Low-data dashboard:** the conversation chart needs an intentional no-points/all-zero state. Distinguish loading, no recorded activity, low real activity, unavailable data and errors; never manufacture data or trends.

#### P2 — Make UI quality measurable
- The current client CI workflow runs dependency installation and the TypeScript/Vite build. The package has a lint script, but client CI does not run it; no dedicated client test script or configured UI/e2e/accessibility suite was found in the reviewed tree.
- Add lint to CI, focused component/interaction tests for dialogs, labels, toasts, tabs and journey drafts, Playwright smoke tests for core workflows, and an automated accessibility scan such as axe. Automated scans are a baseline, not a substitute for manual keyboard and assistive-technology review.

#### Audit conclusion
Keep the current design tokens, semantic app landmarks, reduced-motion rules, chart table fallbacks and working graph draft protections. The audit recommends targeted fixes and consistent polish—not a rewrite. Fix behavior and accessibility before visual effects. See the audit document for source links and detailed evidence.

## 2A. Delta review — current implementation gaps (2026-10-10)

This section records gaps re-verified against `main` on 2026-10-10. It supplements the existing source-level audit; it does not claim browser, screen-reader, visual-regression, or WCAG certification testing has been run. Source observations below are concrete. Runtime behavior must still be verified during implementation.

### Confirmed implementation gaps

| Priority | Area | Current code evidence | Design / product impact | Required direction |
|---|---|---|---|---|
| **P0** | Journey Builder save model | `JourneyBuilder.tsx`: `handleAddMilestone`, `handleRemoveMilestone`, `handleReorderMilestone` call `persistMilestones`; `handleSaveMilestone` persists goal edits from the inspector. `BuilderCanvas.tsx` saves graph edits separately through `api.saveBuilderGraph`. | The page presents a single “Save changes” action for canvas edits, but goals/content can already be persisted and advance the version independently. A user can believe the journey is still a draft when part of it is committed. Goal edits can also force-save pending canvas edits. | Unify graph positions/edges, goal structure/order/content and any journey-editable fields in one local draft and one explicit save transaction/API boundary. Inspector “Save changes” must stage into the draft, not commit separately. Until backend support exists, clearly separate the actions and label them honestly rather than pretending save is atomic. Preserve optimistic concurrency/version checks. |
| **P1** | Custom dialog accessibility | `components/BottomSheet.tsx` uses `role="dialog"` and `aria-modal`, but no focus-on-open, focus trap, focus restoration or Escape handler; backdrop and header both expose “Close”. It is shared by goal/node editing and journey confirmation flows. | Focus can remain behind a visually modal surface, and keyboard dismissal/return may be inconsistent. | Adopt a tested dialog primitive or implement complete dialog behavior. Test nested confirmation dialogs, close/backdrop behavior, scroll lock, focus return and mobile safe areas. Avoid two redundant ordinary close buttons in the tab sequence. |
| **P1** | Node interaction semantics | `BuilderNode.tsx` is a `div role="button"` with Enter/Space handling and accepts nested menu controls. | Nested action keys can bubble to the parent and trigger node selection/editing unexpectedly; drag surfaces also need clear focus affordances. | Use valid interactive structure with separate node-selection and menu controls; stop/guard keyboard propagation from descendants. Test keyboard activation and drag behavior without relying on color or pointer use. |
| **P1** | Shared save state is incomplete | Builder dirty state is driven by `canvasDirty`; goal changes persist separately. Goal inspector Save triggers a server mutation and graph reload rather than contributing to the primary draft. | Save disabled/enabled state and unsaved navigation guard cannot describe all edits on the page. “Saved” can be shown after a partial commit. | Make dirty/saving/saved/error state describe the whole journey draft. Save failure must retain all changes; Discard restores one saved snapshot. Save button remains disabled only when the complete draft is clean. |
| **P1** | App-shell actions that look interactive | `AppShell.tsx`: Notifications has an accessible name but no action; workspace/tenant identity is accompanied by a chevron without a working selector; the Upgrade link in `PlanCard` routes to `/settings`. | The interface promises actions that are not available, and Upgrade may not take users to plan/billing information. | Wire each action to a real destination/state or remove the affordance/mark it unavailable. Verify Upgrade's target with the billing route and keep the usage display linked to its source of truth. |
| **P1** | Mobile navigation state and focus | `AppShell.tsx` opens a fixed sidebar overlay but the trigger does not expose `aria-expanded`/`aria-controls`; background focus/interaction is not managed as a modal drawer. | Mobile keyboard/screen-reader navigation may not follow the visible overlay state. | Choose and document a modal-drawer or non-modal disclosure pattern; expose expanded state, focus entry/return, background interaction, Escape and route-change close behavior. |
| **P1** | Accessibility quality feedback | `Toast.tsx` adds/removes visible toast divs without a persistent live region; the Leads filters and Inbox search are placeholder-only/bare controls; tabs use mixed semantics. | Success/failure may not be announced, and search/filter context can be lost after typing. In-place tabs expose inconsistent state/keyboard behavior. | Add polite live announcements for routine feedback and assertive announcements only for urgent errors; use visible associated labels where practical; distinguish route navigation links from in-place tabs and implement the appropriate semantics/keyboard model. |
| **P1** | Automation page advertises unfinished sections | `AutomationPage.tsx` lets users select Templates, Keywords, Quick Replies, Handoff Rules and Settings, then renders only “is coming soon.” | The navigation suggests fully usable features but yields a large placeholder panel, undermining readiness and wasting a primary workflow surface. | Decide which sections are committed product scope. For unsupported tabs, show visibly disabled “Coming soon” navigation with brief scope/status and no selected-tab illusion, or hide them until useful. Do not make them look complete. |
| **P1** | Dashboard low-data states | `ConversationsChart.tsx` renders the line chart for the passed series without a deliberate empty/all-zero state; the chart includes a table fallback. `LeadsByStageDonut.tsx` handles no leads already. | An empty plot can read as broken or unfinished and consumes a large share of the first screen. | Distinguish loading, no recorded events, all-zero period, low real activity, unavailable data and fetch error. Keep low-activity charts compact and offer one useful next action; never invent trends or events. |
| **P2** | Page layout conventions are fragmented | Dashboard and Content set `maxWidth: 1080`; generic `.page` in `index.css` uses a 900px max width; Inbox opts out with `maxWidth: none`; Automation has its own padding and viewport-height rules. | The same app changes content width, page gutters and vertical rhythm between routes without a consistent meaning. | Define and document three layout variants: reading/content, standard page, and wide operational workspace. Apply through shared `PageContainer`/page-header conventions; keep Inbox and Builder wide for task density. |
| **P2** | Card and surface hierarchy | Shared `.card` combines background, border, radius, padding and shadow; many pages use repeated bordered/card regions. Builder nodes also use shadows by default. | Equal-looking containers compete for attention and make the app feel like a generic stack of cards rather than one intentional workspace. | Reserve elevation for overlays and a few focus surfaces. Use canvas + separators + plain sections, with cards for independent tasks/data groups only. Avoid a broad radius/shadow increase. |
| **P2** | Theme contrast needs component validation | `index.css` retains light success text `#059669` on `#ECFDF5`, muted text `#6B7280`, and chart cyan `#22D3EE`; previous source audit estimated pairings around 3.58:1, 4.41:1 on canvas, and 1.81:1 on white respectively. | Some normal-sized status/metadata text and a chart series can be hard to read in the actual pairing. | Verify final tokens with computed pairings used in components across light and dark themes, including hover/disabled/focus/chart/node-edge states. Change the live token mapping rather than layering duplicate token systems. |
| **P2** | Documentation search semantics | `DocsPage.tsx` uses a `listbox` wrapper with buttons `role="option"` and fixed `aria-selected="false"`; keyboard handling exists but selection state is not reflected as an option selection model. | Search suggestions may announce a constant, incorrect selection state; expected listbox keyboard interactions can diverge from semantics. | Either implement a complete combobox/listbox pattern with active descendant and accurate option state, or simplify suggestions to a semantic list of buttons/links. Test arrow keys, Enter, Escape, focus and no-results. |
| **P2** | Responsive builder / operations density | `BuilderCanvas.tsx` hides the node palette on small screens (`hidden md:block`) while core editing remains a graph workspace; Automation tabs are likewise hidden below desktop and no equivalent mobile tab control is visible in `AutomationPage.tsx`. | Mobile users may lose access to node creation or section navigation rather than getting an intentional compact/alternative interaction. | Decide explicitly whether the builder is desktop-only. If so, explain this in-product and provide a clear supported-device message; otherwise provide a touch-safe mobile palette/toolbar and accessible section navigation. Test 375/390px before calling it responsive. |
| **P2** | CI verifies compilation, not UI quality | `client/package.json` has `build` and `lint`; `.github/workflows/client-ci.yml` runs `npm ci` and `npm run build` only. No client test script is defined in that package. | UI regressions in save behavior, modal focus, responsive controls and accessibility can merge with a green build. | Add lint to client CI and incrementally add component/interaction tests, Playwright smoke routes and an automated accessibility scan. Keep manual keyboard and contrast review as required gates. |

### Scope and interpretation

- The existing `SIGNALAI_UI_UX_AUDIT.md` remains the evidence ledger for the original detailed source findings. Keep it linked rather than copying all evidence into this plan.
- Findings about contrast and accessibility are source-based and must be rechecked after token/component changes. They are not a formal WCAG audit.
- No new API or analytics behavior should be implied by design mockups. If a required state cannot be derived from the API, design the honest unavailable/empty state and record the dependency.
- Before implementation, verify if newer commits have changed these call sites. This snapshot is the `main` branch read on 2026-10-10.

## 3. Design principles

1. **Business outcome first.** Prioritize conversations, leads, qualification, response needs and measurable conversion over vanity metrics.
2. **AI is a capability, not a background effect.** Distinguish AI-generated / AI-handled / human-owned work using consistent labels and states.
3. **Keep information density purposeful.** Use compact layouts for operational tables and Inbox; use breathing room for empty states, onboarding and focused configuration.
4. **Use fewer surface containers.** Establish page background, content surface, separators and the occasional raised panel. Not every section needs a card.
5. **Make state visible.** Connected, running, paused, needs attention, unsaved, saving, saved, error and empty must be distinct and accessible.
6. **Consistency without flattening differences.** Shared controls and typography should match across pages; the Inbox and Journey Builder can still have task-specific layouts.
7. **Preserve working behavior.** This is primarily a design and usability revamp, not a backend/API overhaul.
8. **Design from the real data.** Treat missing revenue as unavailable (not ₹0), avoid presenting zero-filled charts as activity, and never fabricate trend deltas.
9. **Accessibility is part of the component definition.** Dialog focus, visible labels, keyboard behavior, live feedback, semantic tabs and contrast are acceptance criteria—not optional final polish.
10. **One action, one truthful result.** Every visible control should work as presented, and every Save affordance must clearly communicate what is committed versus still drafted.

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
- Use a visible focus ring in both themes; do not remove outlines without a clearly visible replacement.
- Verify real foreground/background pairings in both themes. Target WCAG 2.2 AA contrast for normal text and meaningful graphical controls.
- Every control needs an accessible name; tab-like controls must use a valid navigation or tab pattern; dynamic success/error messages need an intentional announcement strategy.
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
- Charts should show axis labels/gridlines only when they add meaning; keep their colors restrained and map series consistently. Darken the current cyan/teal DMs line so it is distinguishable on light and dark surfaces.
- Handle an empty timeseries and an all-zero series deliberately. Do not render a large, apparently broken plot in a new workspace.
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
- Give Inbox search an explicit accessible name; keep the reply composer’s existing accessible label.
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
- Give Pipeline stage, Handoff status and Search explicitly associated accessible labels; visible labels are preferred where layout permits.
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
- **Every journey edit must follow one explicit-save contract:** node movement, connections, graph structure, adding/removing/reordering goals, and goal content must update a local draft and dirty state. The audit found that add/remove/reorder goal handlers currently call the milestone API immediately, even though drag/connect edits wait for Save. Resolve this mismatch before the builder revamp is complete.
- The inspector remains dialog-based. Its local Save/Apply behavior must be explicit and must not persist part of the journey ahead of the primary Save contract. Preserve Goal editor tabs: **Basic, Capture Fields, Validation, Success Message**.
- Preserve dirty state, saved/saving/unsaved indicators, version handling, save-error recovery and save/discard/keep-editing navigation protection for every edit type—not only node positions and edges.
- Never regress to saving the graph on every drag or interaction.
- Keep node inspector/editor dialog-based. **Do not add a right-side persistent inspector.**
- Preserve Goal editor tabs: **Basic, Capture Fields, Validation, Success Message**.
- Preserve Preview, Test journey, Publish confirmation, and existing journey tabs unless a separate product decision approves change.

Visual improvements:
- Reduce canvas chrome and give the actual graph more room.
- Make the node palette compact, consistent and scannable; clearly separate available actions from “Soon” nodes.
- Give node types semantic icon/color accents, but use restrained light fills with clear readable text.
- Fix keyboard bubbling between selectable node surfaces and nested action menus. Test node selection and menu actions with Enter, Space, Tab and Shift+Tab.
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
- Correct the audited contrast pairings for success text, muted canvas text and the cyan/teal chart series; recheck actual components in both themes.
- Standardize AppShell navigation and top-bar hierarchy, including mobile menu state and truthful workspace/notification/Upgrade affordances.
- Establish accessible shared dialog and toast behavior (or adopt tested primitives), plus consistent labels, status messages and focus styles.
- Keep brand identity and existing theme preference behavior.
- Test light and dark mode together.

**Acceptance**
- Shared elements look consistent across routes.
- Text and meaningful graphics pass contrast checks in both themes; no color token is considered accessible solely because it looks good in isolation.
- Dialogs move focus inside when opened, contain focus while open, handle expected keyboard dismissal, and return focus to the trigger. Close/backdrop controls do not create confusing duplicate tab stops.
- Toast success/error states are announced appropriately to assistive technology.
- Controls have accessible names and visible focus styles; reduced-motion preferences remain honored.
- Desktop and mobile navigation, profile menu, trial card, usage display and theme toggle remain functional; the mobile drawer exposes state and follows its documented focus model.

### Phase 2 — Overview dashboard
**Scope**
- Rework the Overview into a concise, action-oriented business briefing.
- Improve KPI cards, chart proportions, lead-stage summary, recent lead rows and data-dependent empty/low-data states.
- Move connection status into workspace context where practical.

**Acceptance**
- Empty/low-data workspaces do not show huge meaningless charts; loading, no points, all-zero activity, low real activity, unavailable data and errors are distinct.
- The DMs series is distinguishable on light and dark surfaces and is not the only way the data is communicated; the table fallback remains available.
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
- Moving nodes, connecting edges, adding/removing/reordering goals and editing goal content change the local journey draft only; no graph/milestone persistence or saved-version increment occurs before the primary explicit Save action.
- Save is disabled when the complete draft is clean, enabled when any journey-editable field is dirty, and increments the saved version only after an explicit successful save.
- Save failure preserves the complete draft; discard restores the saved graph and goals together.
- Internal tab changes, route navigation and browser back/forward while any journey part is dirty offer keep editing / discard / save and continue.
- Inspector remains a dialog; Goal tabs remain Basic, Capture Fields, Validation, Success Message. Dialog-level Save/Apply stages draft changes without bypassing the primary save boundary.
- Keyboard interaction with node surfaces and nested action menus does not trigger duplicate actions.
- Preview/test/publish flows remain available; publish version/concurrency protections remain intact.

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
- Add `npm run lint` to client CI; the existing workflow currently runs install and build only.
- Add focused client interaction tests, Playwright smoke coverage and automated accessibility scans for representative routes. Supplement scans with manual keyboard and assistive-technology checks.
- Address build/lint/tests separately from cosmetic changes; do not smuggle behavior changes into styling PRs.

**Acceptance**
- Frontend build and lint pass (or any pre-existing failure is explicitly recorded).
- Automated UI checks cover dialog focus/keyboard behavior, toast announcements, labels, tab semantics, mobile navigation and journey draft/save behavior.
- Functional smoke tests pass.
- Light and dark mode tested at desktop, tablet and mobile sizes; contrast is checked on real components.
- Keyboard-only navigation, focus restoration, reduced motion, accessible names and dynamic status announcements have been reviewed.
- No critical overflow, obscured actions, misleading interactive affordances, unreadable statuses or navigation regressions.

---

## 9. Recommended execution strategy

Use small, reviewable PRs. Do not attempt an all-pages rewrite in one change.

Suggested sequence:
1. **PR 1:** Design tokens, contrast fixes and accessible shared primitives (dialogs, toast semantics, focus styles, labels/status patterns).
2. **PR 2:** AppShell navigation, mobile drawer and truthful workspace/notification/Upgrade affordances.
3. **PR 3:** Overview dashboard and sparse-data chart states.
4. **PR 4:** Inbox / Leads / Lead Detail, including labels and responsive states.
5. **PR 5:** Journey draft/save consistency and keyboard-safe node interactions; treat this as behavior-correctness work, not merely visual polish.
6. **PR 6:** Automation list and Journey Builder visual refinement, preserving the dialog inspector and Goal tabs.
7. **PR 7:** Knowledge / Content / Analytics.
8. **PR 8:** Settings / Team / Integrations / Billing / onboarding / docs.
9. **PR 9:** Client CI lint, UI/e2e/accessibility checks, responsive and visual-regression cleanup.

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
- [ ] Trial card and upgrade navigation; Upgrade leads to the intended billing/plan destination
- [ ] Workspace selector and notification controls work as presented, or are explicitly non-interactive
- [ ] Mobile menu exposes expanded state and follows the chosen focus/background interaction model

### Accessibility primitives
- [ ] Dialog focus enters, stays contained, handles expected keyboard dismissal and returns to opener
- [ ] Backdrop and close controls do not create confusing duplicate close stops in the tab order
- [ ] Toast messages use appropriate live announcements without duplicate speech
- [ ] Every form control has an accessible name; visible labels are associated with inputs/selects
- [ ] Tabs use a consistent navigation or tab interaction pattern with exposed state and keyboard support
- [ ] Success text, muted canvas text, chart series, node edges and focus rings have verified contrast in both themes
- [ ] Nested node action menus do not trigger parent node selection via keyboard

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
- [ ] Drag/move nodes, connect edges, add/reorder/remove goals and edit goal content
- [ ] Every journey edit stays local until the primary explicit Save action
- [ ] No milestone API mutation or saved-version increment occurs while staging goal structural changes
- [ ] Save disabled when the complete draft is clean; enabled when any journey part is dirty
- [ ] Save updates version on success; errors preserve the complete draft
- [ ] Discard restores saved graph and goal data as one consistent snapshot
- [ ] Internal tab change, route navigation and browser back/forward guard dirty drafts
- [ ] Inspector dialog opens/closes and warns on dirty node edits
- [ ] Goal tabs unchanged
- [ ] Preview, test journey, publish confirmation and version/analytics/lead tabs

### Whole app
- [x] `npm run build` in `client/` — CI pass on current branch head at the time of this update
- [x] `npm run lint` in `client/` and run it in client CI
- [ ] Add client component/interaction unit tests
- [x] Add and run Chromium Playwright route/interaction smoke checks; upload HTML report and traces from CI
- [x] Run an automated axe scan for critical violations on the representative Leads route
- [ ] Expand automated accessibility scans to more routes and manually review findings
- [x] Server typecheck, production build, migrations and database-backed tests pass in server CI
- [ ] Desktop, tablet, mobile; light and dark theme visual QA
- [ ] Manual keyboard-only navigation, focus trap/restoration, reduced motion, accessible names and live announcements
- [ ] Contrast for text/statuses/graph edges and focus indicators in both themes

---

## 11. Success criteria

The redesign is complete when:
- The product reads as one intentional design system across routes, not a collection of individually styled pages.
- P1/P2 findings in [SIGNALAI_UI_UX_AUDIT.md](./SIGNALAI_UI_UX_AUDIT.md) are resolved or explicitly dispositioned with evidence; modal, toast, form, tab, contrast, mobile navigation and node-keyboard behaviors are verified.
- Journey edits—including goal structure/content—share one predictable explicit-save boundary, with regression tests proving there is no premature persistence or version increment.
- Client lint, interaction smoke tests and accessibility scans run through the agreed quality gates.
- The first screen communicates business outcomes and operational status without empty visual bulk.
- AI activity is identifiable through meaningful labels and state treatment, not pervasive purple glow.
- Inbox and journey editing remain efficient and safe.
- Empty/error/loading states explain what happened and what the user can do next.
- Light and dark themes have comparable hierarchy and accessibility.
- No core behavior regresses as a side effect of styling.

## 12. Out of scope unless separately approved

- Backend/API changes to produce new analytics.
- Adding AI-generated insight claims or trend percentages without data support.
- Broad redesign of journey semantics or publish/version architecture; the specific draft/save consistency correction in §2 and Phase 4 is in scope and must preserve existing version-conflict and publish protections.
- Replacing the dialog-based node inspector with a right-side panel.
- Changing the product's navigation or hiding upcoming destinations without a product decision.
- Replacing the font, charting architecture or route structure just for visual novelty.

---

## Design north star

> **SignalAI is a premium AI-native business workspace: calm, clear and operationally powerful.**
>
> Light-first; compact but not cramped; strong typography; restrained borders and shadows; purple reserved for brand, primary actions and meaningful AI cues; data visualizations grounded in real data; explicit save and ownership states; no excessive gradients, glass or neumorphism.
