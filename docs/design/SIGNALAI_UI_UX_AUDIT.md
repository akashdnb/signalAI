# SignalAI UI/UX Best-Practices Audit

**Repository:** `akashdnb/signalAI`  
**Branch reviewed:** `main`  
**Purpose:** Source-level assessment of the current product UI against practical SaaS UX, accessibility, interaction-design, and quality-gate practices.  
**Status:** Findings documented; no application code changed by this audit.

## Executive verdict

**SignalAI follows some good practices, but it does not consistently meet a production-grade SaaS UI/UX bar yet.** The UI has a solid technical foundation and several well-considered interactions. The biggest gaps are not a lack of fashionable styling; they are consistency, accessible interaction behavior, contrast, and one important inconsistency in journey-save semantics.

The screenshots support the visual conclusion: the Overview looks clean but generic, surface-heavy, and sparse for low activity. The code review also uncovered concrete behavior and accessibility risks that cannot be judged from screenshots alone.

This is a **source-level review**, not a formal WCAG conformance claim. I did not run the app in a real browser, test a screen reader, run Lighthouse/axe, or execute CI as part of this audit. Findings below distinguish visible code evidence from issues that require runtime verification.

## Overall assessment

| Area | Assessment | Why |
|---|---|---|
| Visual hierarchy and product identity | Needs work | Repeated cards, borders and similar radii flatten the hierarchy; dashboard low-activity states are visually weak. |
| Design-system consistency | Partial | Shared tokens exist, but page wrappers, component conventions and local styling vary between routes. |
| Accessibility | Significant gaps | Custom modal focus behavior, missing form labels, unannounced toasts and some tab semantics need attention. |
| Contrast | Specific issues found | Success status and muted canvas text fall below the normal-text contrast target; the cyan chart line is faint. |
| Responsive foundation | Promising, needs device testing | Mobile layouts and overlays exist, but focus behavior and narrow-screen workflows need a runtime pass. |
| Data visualization | Mixed | Charts include table alternatives, but the conversation chart has no deliberate low/no-activity treatment. |
| Journey editor safety | Mixed / important inconsistency | Dragging and connecting are local drafts, but adding/removing/reordering goals persists immediately. |
| Test/CI coverage for UI | Insufficient | Client CI typechecks/builds only; no client test script or UI/e2e/accessibility checks were found. |

## What the UI already gets right

1. **A shared visual foundation exists.** `client/src/index.css` defines light/dark CSS tokens and bridges them into Tailwind utilities. There is a brand guide rather than ad-hoc colors alone.
2. **The app shell uses useful landmarks.** The authenticated layout includes an `aside`, a `nav`, and a `main`; most primary pages have an `h1`.
3. **Some important states are designed.** Multiple pages have loading and empty/error states; Content has a helpful no-posts message; the lead-stage donut handles a zero-lead case.
4. **Charts provide alternative data.** The conversation chart has a “View as table” disclosure, and Analytics exposes tabular funnel data. This is a good foundation for people who cannot interpret the graphic.
5. **Reduced-motion support exists.** CSS explicitly disables some transitions when `prefers-reduced-motion: reduce` is set.
6. **The graph's basic draft model is good.** Node dragging and edge connections update local draft state; graph save is explicit; save errors retain the draft; navigation warnings offer save/discard/keep-editing. Keep these protections.
7. **The UI is not overusing glassmorphism or neumorphism.** The right direction is refinement of the existing SaaS language, not adding effects everywhere.

## Findings, ordered by priority

### P1 — Journey-builder edits do not share one consistent Save boundary

**Evidence**
- `JourneyBuilder.tsx` calls `persistMilestones(next)` directly from `handleAddMilestone`, `handleRemoveMilestone`, and `handleReorderMilestone`.
- `persistMilestones` calls `api.setMilestones(...)` immediately and then updates the builder save state to “Saved.”
- The server's `PUT /milestones` handler updates milestone data, synchronizes graph nodes/edges, and calls `saveBuilderGraphWithClient`, advancing the saved graph/version.
- By contrast, moving nodes and connecting edges is kept in local refs until the separate **Save changes** action calls `api.saveBuilderGraph(...)`.

**Why this matters**
Adding, removing or reordering a goal/node can be committed before the user clicks the main **Save changes** button. The Save button only describes the canvas graph draft, not all changes the user perceives as “journey edits.” This conflicts with the stated product intent that flow edits remain local until explicitly saved.

**Recommendation**
Unify canvas structure, edge/position data and goal order/content under a single draft model. Every editing action should update the draft and mark it dirty. One explicit Save action should persist a consistent snapshot with version-conflict protection. Keep node-editor Save semantics clear: if it edits only the local draft, label/behavior should reflect that; do not silently persist another part of the journey behind the main Save button.

**Acceptance checks**
- Add/remove/reorder a goal; verify no network mutation/version change before the explicit save.
- Navigate away; the unsaved-changes guard must account for every dirty type, not just node positions/edges.
- Save once; verify the whole draft persists and the displayed version advances once.
- Save failure must preserve the entire local draft; discard must restore all saved graph and goal data.

Code: [JourneyBuilder.tsx](https://github.com/akashdnb/signalAI/blob/main/client/src/components/automation/JourneyBuilder.tsx#L282-L361), [BuilderCanvas.tsx](https://github.com/akashdnb/signalAI/blob/main/client/src/components/automation/BuilderCanvas.tsx#L740-L872), [milestone route](https://github.com/akashdnb/signalAI/blob/main/server/src/routes/campaigns.ts#L80-L164).

### P1 — The shared modal primitive does not implement the full modal keyboard/focus pattern

**Evidence**
- `BottomSheet.tsx` uses a custom `div role="dialog" aria-modal="true"`.
- The component does not implement initial focus placement, focus trapping, focus restoration, or Escape-key handling.
- A full-screen backdrop is itself a focusable button named “Close”, in addition to the dialog's close button.
- The same primitive is used by journey editing, publish confirmation, unsaved-change prompts, and the mobile account sheet, so the issue can affect multiple workflows.

**Why this matters**
A visual overlay plus `aria-modal="true"` does not, by itself, stop keyboard focus from reaching the page behind it. Users should enter the dialog when it opens, remain inside it while it is open, and return to the invoking control when it closes. See the [WAI-ARIA modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) and [W3C HTML dialog technique](https://www.w3.org/WAI/WCAG22/Techniques/html/H102).

**Recommendation**
Prefer the native `<dialog>` element with `showModal()`, or adopt a tested accessible dialog primitive. Verify initial focus, Tab/Shift+Tab containment, Escape behavior, backdrop dismissal, and return-focus behavior. Avoid exposing the backdrop as a second ordinary “Close” control in the tab sequence.

Code: [BottomSheet.tsx](https://github.com/akashdnb/signalAI/blob/main/client/src/components/BottomSheet.tsx#L34-L75).

### P1 — Some light-theme text and chart colors have weak contrast

Contrast ratios calculated from the CSS token values in the current source:

| Combination | Approx. ratio | Guidance / impact |
|---|---:|---|
| Success text `#059669` on success background `#ECFDF5` | **3.58:1** | Below 4.5:1 for normal-sized text; used by `.pill-ok`, including connected status. |
| Muted text `#6B7280` on canvas `#F1F5F9` | **4.41:1** | Slightly below 4.5:1 for normal-sized text in areas placed directly on the canvas. On white cards the same muted text is about 4.83:1. |
| Cyan chart line `#22D3EE` on white | **1.81:1** | The DMs series can appear faint and hard to distinguish from the chart surface. |
| Purple `#7C3AED` on white | 5.70:1 | Passes the normal text contrast ratio in this pairing. |

The chart offers a table fallback, which reduces reliance on color alone, but the line contrast should still be improved for everyday visual interpretation. WCAG references: [Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) and [Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast).

**Recommendation**
Use a darker, accessible green for success text; darken muted text slightly or adjust its canvas pairing; choose a darker teal/cyan for the DMs series. Test actual component pairings in both themes rather than validating the palette in isolation.

Code: [index.css tokens](https://github.com/akashdnb/signalAI/blob/main/client/src/index.css#L58-L145), [status styles](https://github.com/akashdnb/signalAI/blob/main/client/src/index.css#L340-L365), [ConversationsChart.tsx](https://github.com/akashdnb/signalAI/blob/main/client/src/components/ConversationsChart.tsx#L53-L115).

### P2 — Leads filters do not have explicit accessible names

**Evidence**
- `LeadsPage.tsx` renders the stage filter and handoff filter as bare `select` controls without associated `label` elements or `aria-label` attributes.
- The search input has a placeholder but no explicit label.
- The Inbox search field is also placeholder-only, although the message composer is correctly labeled with `aria-label="Message reply"`.

**Why this matters**
A visible option inside a select or a placeholder is not a reliable replacement for a label explicitly associated with the form control. This affects screen-reader and speech-input users, and visible labels help users understand filters after the placeholder is no longer visible. See [W3C form-label guidance](https://www.w3.org/WAI/tutorials/forms/labels/).

**Recommendation**
Give the filter controls visible labels such as “Pipeline stage,” “Handoff status,” and “Search conversations,” explicitly associated through `htmlFor`/`id`. An `aria-label` is acceptable for genuinely compact controls, but prefer visible labels when there is room.

Code: [LeadsPage.tsx](https://github.com/akashdnb/signalAI/blob/main/client/src/pages/LeadsPage.tsx#L55-L86), [InboxPage.tsx](https://github.com/akashdnb/signalAI/blob/main/client/src/pages/InboxPage.tsx#L205-L215).

### P2 — Toasts are not announced to assistive technology

**Evidence**
`ToastStack` dynamically adds and removes visible messages but does not set `role="status"`, `role="alert"`, or an `aria-live` region.

**Impact**
A sighted user sees “Journey created” or a failure message; a screen-reader user may not be told that feedback appeared.

**Recommendation**
Use a persistent live region: polite status announcements for success and non-urgent updates, and assertive alert announcements only for errors that genuinely need immediate attention. Avoid announcing the same message twice.

Code: [Toast.tsx](https://github.com/akashdnb/signalAI/blob/main/client/src/components/Toast.tsx#L25-L39).

### P2 — The journey builder's node uses a button role around nested action buttons

**Evidence**
`BuilderNode` is a `div role="button" tabIndex={0}` with an `onKeyDown` handler that opens the node when Enter/Space is pressed. The component receives nested action controls through its `menu` prop. The mouse click in `DotsMenu` stops propagation, but the parent's key handler does not ignore Enter/Space events originating from child buttons.

**Impact**
Keyboard activation of a node's menu can also trigger the parent node action (opening the inspector), because the keydown event bubbles. Nested interactive controls inside a button-like container are also confusing to assistive technology.

**Recommendation**
Separate node selection from action-menu controls semantically and structurally. Ensure nested buttons do not trigger node selection via pointer or keyboard. Test Enter, Space, Tab and Shift+Tab for every node type and menu action.

Code: [BuilderNode.tsx](https://github.com/akashdnb/signalAI/blob/main/client/src/components/automation/BuilderNode.tsx#L50-L110), [BuilderCanvas menus](https://github.com/akashdnb/signalAI/blob/main/client/src/components/automation/BuilderCanvas.tsx#L110-L197).

### P2 — Tab-like controls do not expose consistent tab state/keyboard behavior

**Evidence**
- `AutomationTabs` switches content using buttons inside a labeled `nav`; it sets `aria-current="page"`, but does not use the tablist/tab/tabpanel pattern.
- `JourneyBuilder` has another tab row with buttons and visual underline, but does not expose `aria-selected`, `role="tab"`, or a linked tab panel.

**Recommendation**
Pick one model per control:
- If it is navigation, use links with real destinations.
- If it swaps content in place, implement the WAI-ARIA tabs pattern (`tablist`, `tab`, `tabpanel`, selected state and keyboard support), or use an established accessible tab primitive.

Code: [AutomationTabs.tsx](https://github.com/akashdnb/signalAI/blob/main/client/src/components/automation/AutomationTabs.tsx#L20-L49), [JourneyBuilder.tsx](https://github.com/akashdnb/signalAI/blob/main/client/src/components/automation/JourneyBuilder.tsx#L430-L490).

### P2 — Mobile navigation overlay needs proper focus/state handling

**Evidence**
The mobile menu visually overlays the page and has open/close buttons, but the toggle does not expose `aria-expanded`/`aria-controls`. The open sidebar is not handled as a modal navigation drawer, and the background is not made inert or kept outside the keyboard tab sequence.

**Recommendation**
Either implement the mobile menu as a properly managed modal drawer, including focus movement/containment and return focus, or choose a non-modal disclosure pattern and ensure its visual and keyboard behavior agrees. Expose the expanded state to assistive technology.

Code: [AppShell.tsx](https://github.com/akashdnb/signalAI/blob/main/client/src/components/AppShell.tsx#L432-L501).

### P2 — Some header controls imply behavior that is not wired

**Evidence**
- The workspace/account area shows a chevron but is not a button or an interactive workspace selector.
- The Notifications button has an accessible name but no click handler.
- The sidebar's Upgrade link currently navigates to `/settings`, even though Billing has a separate route and the Settings page describes Billing as moved out.

**Impact**
The visuals promise actions the user cannot take, and Upgrade may route to an unexpected destination.

**Recommendation**
Wire up the workspace selector and notification action if they are part of the current scope; otherwise remove the dropdown affordance or make the unavailable state explicit. Route Upgrade to the intended billing/plan screen.

Code: [AppShell.tsx](https://github.com/akashdnb/signalAI/blob/main/client/src/components/AppShell.tsx#L123-L143), [account header](https://github.com/akashdnb/signalAI/blob/main/client/src/components/AppShell.tsx#L227-L321).

### P2 — Low-activity dashboard chart needs a designed state

**Evidence**
`ConversationsChart` renders the line chart for the provided time series without a check for no points or all-zero activity. The chart does include a good table fallback, but zero activity still looks like an empty plot. The Overview is dominated by large chart panels, which looks disproportionate when there are only a few leads and almost no conversation activity.

**Recommendation**
Differentiate three states:
1. **Loading:** compact skeleton or clear loading state.
2. **No recorded activity:** short explanation and the next useful action, such as “Open Inbox” or “Create a journey.”
3. **Low but real activity:** keep the chart but make the data point and date context understandable.

Do not create fake trends, invented percentage deltas, or AI activity counts that the current API does not supply. For very low lead counts, consider a stage list/progress rows rather than relying on a donut with one segment.

Code: [DashboardPage.tsx](https://github.com/akashdnb/signalAI/blob/main/client/src/pages/DashboardPage.tsx#L160-L245), [ConversationsChart.tsx](https://github.com/akashdnb/signalAI/blob/main/client/src/components/ConversationsChart.tsx#L14-L115), [LeadsByStageDonut.tsx](https://github.com/akashdnb/signalAI/blob/main/client/src/components/LeadsByStageDonut.tsx#L25-L90).

### P2 — Client quality gates do not verify UI behavior

**Evidence**
- `client/package.json` has `build` and `lint` scripts, but no client `test` script.
- `.github/workflows/client-ci.yml` runs `npm ci` and `npm run build`; it does not run lint, component tests, end-to-end tests, or an accessibility scan.
- I found no client test/e2e/axe setup in the repository tree. There is substantial backend test coverage, but it does not validate frontend interactions.

**Recommendation**
Add CI gates incrementally:
1. Run `npm run lint` in client CI.
2. Add focused component tests for modal, toast, labels/tabs and journey draft/save behavior.
3. Add Playwright smoke tests for the main workflows.
4. Add axe-core or equivalent accessibility checks for representative routes, then supplement them with keyboard and screen-reader testing. Automated scans do not replace manual interaction testing.

Code: [client-ci.yml](https://github.com/akashdnb/signalAI/blob/main/.github/workflows/client-ci.yml#L1-L35), [client/package.json](https://github.com/akashdnb/signalAI/blob/main/client/package.json#L1-L20).

### P3 — The visual system is too card-heavy and page rhythm is inconsistent

**Evidence**
- The shared `.card` rule applies background, border, rounded corners, padding, and shadow together.
- Overview uses a custom max width; other pages use the default `.page` width, and Inbox opts into full width. Those choices can be valid, but the conventions are distributed across page implementations.
- The screenshots show similarly rounded/bordered surfaces competing for attention.

**Recommendation**
Retain the existing tokens and component foundation, but define explicit layout variants (reading width, standard content, wide operations workspace). Use cards for meaningful grouped content, not every section. Standardize page headers, section spacing, control heights, status badges and focus styles. Make purple signify brand/primary action/meaningful AI state rather than applying it as decoration everywhere.

This supports the agreed direction: **premium, calm, light-first modern SaaS, with restrained AI accents—not pure neumorphism, all-over glassmorphism, or a neon “cyber AI” theme.**

Code: [index.css](https://github.com/akashdnb/signalAI/blob/main/client/src/index.css#L190-L225), [DashboardPage.tsx](https://github.com/akashdnb/signalAI/blob/main/client/src/pages/DashboardPage.tsx#L150-L240).

## Recommended fix order

### First: behavior and access blockers
1. Unify journey draft/save semantics for graph and goal/node structure.
2. Fix the shared modal primitive, then audit the mobile nav overlay.
3. Correct the success-text and muted-text contrast pairings; darken the cyan chart line.
4. Add explicit labels to Leads filters.
5. Add accessible live regions to toasts.
6. Fix keyboard bubbling/nested controls in BuilderNode and expose tab state correctly.

### Second: remove confusing affordances and improve data UX
7. Make workspace, notifications and Upgrade actions truthful.
8. Add intentional zero/low-activity dashboard states.
9. Normalize page/container and panel variants.

### Third: make quality measurable
10. Add client lint to CI.
11. Add interaction tests for save/discard, dialogs, filters, handoff, mobile navigation and tabs.
12. Run contrast, keyboard, screen-reader and responsive tests on the live app at desktop and mobile viewports.

## Manual QA checklist before declaring the UI “best-practice compliant”

- [ ] Keyboard-only pass on every route; visible focus is always apparent.
- [ ] Open every modal, use Tab/Shift+Tab, press Escape where appropriate, close it and confirm focus returns to the trigger.
- [ ] Use screen reader or accessibility tree to verify form labels, tab selection, toast messages and dialog names.
- [ ] Confirm every journey change stays local until explicit Save, and Save/Discard covers all related data.
- [ ] Test at 1440px, 1280px, tablet widths and 375–390px mobile.
- [ ] Check light and dark themes for text, controls, charts, statuses and focus indicators.
- [ ] Run an automated accessibility scan, then manually verify issues; do not treat a clean scan as full conformance.
- [ ] Run client build and lint in CI; add interaction regression tests.
- [ ] Verify loading, empty, low-data, errors, unavailable data, disabled controls, and success states.
- [ ] Confirm every visible icon/button/chevron either performs the advertised action or is clearly non-interactive.

## References

- [W3C WCAG 2.2 — Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- [W3C WCAG 2.2 — Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast)
- [WAI-ARIA Authoring Practices — Modal Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- [W3C Forms Tutorial — Labeling Controls](https://www.w3.org/WAI/tutorials/forms/labels/)
- [WAI-ARIA Authoring Practices — Tabs Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)

## Bottom line

The UI is **not fundamentally bad and does not need a rewrite**. It has reasonable architecture, brand tokens, a usable responsive foundation, and careful graph-draft protections for some actions. However, it is not yet consistently following best practices across accessibility, save semantics, data visualization, and validation.

Fix the explicitly unsaved-journey behavior and accessible modal foundation first; those are more important than visual polish. Then refine contrast and feedback semantics, make dashboard states purposeful, and add tests so future redesign work cannot quietly regress working behavior.
