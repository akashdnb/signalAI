# SignalAI flagship redesign plan

**Status:** Proposed direction and implementation plan  
**Target:** SignalAI web app, desktop-first with mobile/tablet support  
**Product outcome:** Make SignalAI feel like a credible, distinctive operations product built for handling real Instagram conversations and automations—not a generic AI dashboard.

## 1. Why a major redesign is warranted

The production audit dated 13 October 2026 found that SignalAI's visual consistency is a useful foundation, but the product is not yet at flagship quality. The blockers combine product trust, visual sameness, unfinished states, and unclear workflows; they cannot be solved with another round of shadows, spacing tweaks, and rounded cards.

The audit directly observed or reported:
- Analytics labels message activity as a conversion funnel and displays 154 DMs as 642% of 24 leads.
- The Overview stage chart totals 20 leads while Leads and Analytics report 24, without a visible explanation.
- Content cards show large blank media areas even though image URLs are present in the accessible tree.
- The Leads table breaks headings and values mid-word at desktop width.
- Billing says it is not configured while also showing trial usage and an upgrade affordance.
- Integrations show a raw numeric Instagram account ID without useful account health.
- Settings expose implementation-style snake_case labels.
- Documentation uses names and controls that do not match the current UI.
- The persistent navigation exposes several not-yet-usable destinations, making the product feel unfinished.
- Core Builder save/discard/publish interactions and mobile/accessibility behavior were not verified in that audit; these remain evidence gaps, not established defects.

The visual complaint is therefore treated as a product-level problem: too many surfaces look templated, while the product's real operational model is not consistently visible.

## 2. Redesign objective and non-goals

### Objective

Create a distinctive, trustworthy interface where a non-technical business owner can understand what SignalAI is doing, what needs attention, which account/journey/conversation is involved, and what will happen before they activate an automation.

### Non-goals

- Do not rewrite the product backend to deliver a visual change.
- Do not replace real product behavior with demo data.
- Do not run one global style migration that breaks all legacy pages at once.
- Do not make every screen dark, editorial, brutalist, or visually loud merely to avoid AI aesthetics.
- Do not add motion, illustrations, charts, or decorative card grids without a workflow reason.
- Do not treat a screenshot-perfect happy path as a shippable feature.

## 3. Proposed visual direction

**Working direction: a human-designed conversation operations studio.**

The interface should combine the precision of an operations console with the clarity of a well-edited business tool. The personality should come from information structure, typography, realistic content, status, and interactions—not from effects layered onto generic layouts.

### Visual principles

1. **Structure before cards.** Use page-level grouping, typography, tables, separators, and negative space. A card is justified only when it expresses a meaningful grouping or interaction boundary.
2. **Workflow-specific layouts.** Inbox, automation builder, leads, analytics, and settings must not be variations of the same dashboard template.
3. **Restrained color.** Keep status colors semantic. Use one primary action accent and neutrals for most of the interface. Avoid decorative purple/blue gradients, glows, glass panels, and colorful surfaces applied everywhere.
4. **Intentional typography.** Establish a deliberate display/heading/body/metadata hierarchy, readable table typography, and tabular numerals where comparison matters. Avoid giant headline treatment inside operational screens.
5. **Specific, honest copy.** Name the object, state, consequence, and next action. No invented activity, success rates, testimonials, or generic AI promises.
6. **Purposeful motion.** Motion may clarify canvas manipulation, navigation, feedback, or state transitions. Routine business tasks should remain fast, predictable, and respectful of reduced-motion settings.
7. **One coherent system.** Token, radius, spacing, typography, and component rules must be chosen centrally and reused. Do not create competing per-page systems.
8. **Useful empty states.** Empty space should explain the state and suggest a real next step, rather than being filled with decorative artwork.

### Design-system decision

The current palette and component foundations are starting points, not untouchable visual requirements. A major redesign may intentionally revise the brand tokens, typography, surface/radius grammar, navigation, and selected UI primitives. Make those changes once in the shared system, document the rationale, verify both themes, and migrate screens deliberately. Do not preserve a style solely because it exists today.

No final font or palette change should be made on a screen-by-screen whim. Select the system, validate it in representative screens, then apply it consistently.

## 4. Product experience principles

### Make the system's current state obvious

At any time, users should be able to answer:
- Which Instagram account am I operating on?
- Is the account actually healthy and receiving events?
- Is this journey a draft, ready to publish, live, paused, or blocked?
- Has my change been saved, and will leaving this page lose it?
- Is AI replying, a human replying, or is no one assigned?
- What did the metric count, over what period, and against which denominator?
- What happens if I click this action?

### Explain before asking users to configure

Use plain-language setup, contextual help, meaningful defaults, and progressive disclosure. Show technical identifiers, schema keys, token usage details, and low-level configuration only where a user needs them, with clear labels.

### Treat operational correctness as design

Correct counts, stable media thumbnails, explicit ownership, truthful integration health, and safe save/publish behavior are part of the experience. Visual quality cannot compensate for incorrect numbers or unclear consequences.

## 5. Proposed experience architecture

This is a proposed information hierarchy to validate during the redesign, not an instruction to change routing all at once.

### Primary work areas

- **Home:** what needs attention today, with definitions and a clear reporting period.
- **Inbox:** conversation triage and the full AI/human handoff lifecycle.
- **Leads:** pipeline, qualification details, ownership, follow-up, and captured facts.
- **Automations:** reusable automation list, setup readiness, builder, testing, publishing, and lifecycle status.
- **Knowledge:** source management, indexing/health, and a test-question experience.

### Secondary/workspace administration

- **Content:** reliable media previews and the context needed to understand comments/posts.
- **Analytics:** distinct activity-volume and lead-conversion views.
- **Workspace:** Instagram accounts and their health, teammates/roles, AI behavior, and settings.
- **Plan & usage:** honest beta/trial state, quotas, reset dates, and billing action availability.

Keep planned/unavailable features out of the operational primary navigation until usable. If the product needs to preview a roadmap, make it clearly separate from daily work.

## 6. Screen-by-screen redesign brief

### A. App shell and navigation — foundational

**Problem to solve:** current consistent navigation is useful, but "Coming soon"/"SOON" items add noise and make the system feel incomplete.

**Redesign direction**
- Establish a clear separation between daily work and workspace administration.
- Use active states with restrained color and a clear location indicator.
- Keep account/workspace identity visible where it is relevant to the current task.
- Hide non-functional destinations from primary navigation; communicate roadmap availability separately.
- Preserve a predictable mobile navigation model rather than simply squeezing the desktop sidebar.

**Acceptance checks:** no unavailable destination masquerades as a usable page; keyboard focus and active route are clear; no content is obscured at 390 px or 768 px.

### B. Home/Overview — decision surface, not a metric-card gallery

**Problem to solve:** counts conflict across pages; reporting periods and some metric definitions are unclear.

**Redesign direction**
- Lead with the most actionable information: connection/automation health, conversations needing a human, blocked journeys, and leads needing follow-up.
- Use a reporting-period selector and definitions for KPIs.
- Separate actionable alerts from historical trends.
- Reconcile stage counts, including an explicit uncategorized bucket or documented exclusions.
- Show a meaningful explanation for unavailable revenue rather than an unexplained dash.

**Acceptance checks:** totals reconcile with the corresponding source pages or explicitly explain why not; every metric has a period and definition; action links describe their destination.

### C. Inbox — conversation-first workspace

**Problem to solve:** an unselected conversation creates wasted space, repeated generic Instagram identities are difficult to distinguish, and signed media URLs can leak into preview names.

**Redesign direction**
- Give the conversation list a strong, scan-friendly hierarchy for identity, last message, time, and handling mode.
- Use semantic previews such as "Shared a Reel" rather than raw URLs.
- Design intentional no-selection, no-conversations, filtered-empty, loading, failed-send, and retry states.
- Make AI/human ownership and take-over/return actions unmistakable.
- Use the third pane only when a conversation is selected or when it provides a useful contextual empty state.

**Acceptance checks:** full AI → human → AI lifecycle tested; send/retry/error states tested; keyboard navigation works; identity fallbacks remain distinguishable.

### D. Leads — pipeline and ownership

**Problem to solve:** the table breaks words even at desktop width; total count differs from Overview; human handoff can coexist with an unassigned owner.

**Redesign direction**
- Give pipeline stages clear hierarchy and filtering, but keep the lead table optimized for scanning rather than decoration.
- Prevent mid-word wrapping; use responsive horizontal scrolling or a purposeful narrow-screen row layout.
- Display compact timestamps with full-date detail available.
- Make ownership explicit; a handoff should be assigned to a person or a visible work queue.
- Turn empty lead-detail sections into specific next actions.

**Acceptance checks:** no clipped/fragmented headings at desktop, tablet, or mobile; lead totals reconcile; handoff without ownership is impossible or explicitly queued.

### E. Automations list — outcome-oriented operational catalog

**Problem to solve:** existing template-first entry is a good foundation, but duplicate names and test artifacts reduce clarity.

**Redesign direction**
- Preserve the outcome-first entry point and plain-language draft/live distinction.
- Give each automation a meaningful summary: trigger, connected account, last change/run if available, and current state.
- Make duplicate names distinguishable and coach users toward useful naming.
- Keep draft creation separate from activation, and clearly identify blocked readiness.
- Provide clear empty, filtered-empty, error, and no-template states.

**Acceptance checks:** template-to-draft, search/filter, duplicate names, delete confirmation, and save/discard paths are tested. Test artifacts are removed from production only through an explicit cleanup process.

### F. Automation Builder — flagship design workstream

**Problem to solve:** the builder is core value creation, but the audit could not verify actual save/discard/reload/publish behavior. The redesign must not style over this uncertainty.

**Redesign direction**
- Treat the canvas as a working surface, not a decorative diagram.
- Keep block types, connection points, validation errors, selection, and block configuration visually distinct.
- Separate editing from saving: local edits should be visibly unsaved; Save should only persist on explicit user action; navigation away with unsaved changes must offer clear choices.
- Separate Save, Test/Sample walkthrough, Publish, Pause, and Resume as distinct lifecycle actions.
- Present a readiness checklist with blockers before publishing, including connected account, trigger, invalid nodes, and required configuration.
- Use an inspector panel for node configuration where it preserves canvas context; on mobile, use a deliberate full-screen or sheet model.
- Build useful empty-canvas guidance, loading, autosave-not-in-progress, save success/failure, validation, test result, publish confirmation, and live/paused states.

**Acceptance checks:** edit → navigate away → cancel/discard/save → reload is verified; existing execution versions remain safe; malformed content is handled; a sample run cannot accidentally send real replies; publishing requires readiness and explicit confirmation.

### G. Knowledge — source trust and testability

**Problem to solve:** a Ready badge alone does not prove the right content was parsed or indexed.

**Redesign direction**
- Show source name, document type, parse/index state, last update, and an extracted-content preview.
- Give upload and indexing failures precise remediation and retry actions.
- Let users test a question against the current sources before enabling AI replies.
- Make delete impact clear when the source may be used by multiple journeys.

**Acceptance checks:** upload, parsing, indexing, preview, retrieval test, retry, and delete-impact states are covered.

### H. Content — media is the interface

**Problem to solve:** blank image areas make post/reel cards look broken.

**Redesign direction**
- Make thumbnails reliable and give failed media a purposeful placeholder, reason, and retry path.
- Pair the media with caption, media type, comment context, freshness, and account identity.
- Add refresh/last-synced feedback and useful filtering as volumes grow.
- Avoid uniform oversized containers when media aspect ratios and caption lengths differ.

**Acceptance checks:** thumbnail success/failure, long captions, missing captions, refresh, and preview interaction tested.

### I. Analytics — trustworthy measurement

**Problem to solve:** message-event volume is incorrectly presented as a conversion funnel; a 642% label is visually clipped; counts conflict with Overview.

**Redesign direction**
- Split **Activity** (comments, DMs, replies) from **Lead conversion** (unique leads progressing through stages).
- For every conversion metric, define the cohort, period, denominator, and attribution rules.
- Reconcile underlying lead counts instead of masking discrepancies with styling.
- Label unavailable/unconfigured measures differently from a genuine zero.
- Use charts only where comparison helps; provide a readable data-table equivalent and meaningful drilldowns.
- Design for real sparse data; avoid fake or artificially populated charts.

**Acceptance checks:** activity volumes never masquerade as stage-conversion percentages; chart labels do not clip; totals and definitions are tested against source records.

### J. Integrations — account health, not just connection status

**Problem to solve:** raw account IDs and a single Connected indicator hide whether the account is operationally healthy.

**Redesign direction**
- Show username/display identity, connected workspace, permissions/scopes, last successful event, webhook health, and reconnect need.
- Explain which journeys depend on the account.
- Make disconnect a confirmed, consequence-aware action.
- Keep unsupported providers out of the main working path.

**Acceptance checks:** healthy, expired/reconnect-required, permission-denied, webhook-failure, disconnected, and reconnect-success states can be understood from the screen.

### K. Billing & usage — honest state

**Problem to solve:** trial usage, "billing not set up", and an upgrade affordance contradict each other.

**Redesign direction**
- If billing is disabled during beta, say so clearly and explain exactly what usage caps mean.
- Show reset/expiration dates, usage units, warnings, and expected behavior at a cap when the backend supports them.
- Never render a non-functional Upgrade action as if it works.
- Keep billing details readable and distinguish configured data from unavailable data.

**Acceptance checks:** trial/beta/paid/unconfigured states have different copy and actions; usage limits and reset behavior are documented.

### L. Settings & Team — business language and safe changes

**Problem to solve:** technical snake_case labels, long mixed-purpose settings sections, unclear destructive impacts, and thin role explanations.

**Redesign direction**
- Organize settings around user mental models: lead fields, AI behavior, forbidden topics, escalation, and scoring.
- Use human-readable labels with technical keys only in advanced detail.
- Explain field types, where values appear, and which journeys depend on a field.
- Use confirmation/impact previews for destructive changes.
- Explain roles and attribute important administrative actions where supported.

**Acceptance checks:** non-technical users can explain what each setting changes before saving; destructive actions show consequences; role restrictions are understandable.

### M. Login, recovery and documentation

**Problem to solve:** auth errors are generic in at least one invalid OAuth state; docs refer to outdated controls.

**Redesign direction**
- Give OAuth and invitation failures specific diagnoses and safe recovery paths without exposing sensitive tokens.
- Keep login design aligned with the new system but optimize for successful entry, not decoration.
- Synchronize docs language to shipped navigation, tabs, and button labels; link contextual help from complex setup screens.

**Acceptance checks:** valid/invalid/expired/used invitation and OAuth states tested; docs control names match the application; keyboard/focus and responsive layout verified.

## 7. Workstreams and order

### Phase 0 — Design foundation and proof screen

- Inventory current routes, components, tokens, and CSS migration boundaries.
- Set a new token/style direction deliberately; document color, type, spacing, surface/radius, density, icon, status, and motion rules.
- Create a reusable design-review checklist and representative screen specs.
- Validate the direction on three unlike screens before migrating broadly: Automation Builder, Inbox, and a data-heavy table/analytics view.
- Build a small number of representative coded screens, review them at desktop and mobile sizes, and revise the system before roll-out.

**Exit gate:** the screens look recognizably part of the same product without sharing a generic layout; core actions and states are functional; no unscoped CSS regressions.

### Phase 1 — Trust and correctness

- Fix the metric definitions and 24-vs-20 count discrepancy.
- Fix broken Content thumbnails/fallbacks.
- Fix the Leads table fit and handoff ownership.
- Resolve the truthful billing/beta state.
- Verify Builder save/discard/reload/publish lifecycle before visual polish.
- Remove/hide non-working navigation destinations.

**Exit gate:** operational state is correct and explainable.

### Phase 2 — Core workflows redesigned

- App shell and navigation.
- Automation list and Builder.
- Inbox and conversation details.
- Leads and lead detail.
- Knowledge source management.

**Exit gate:** end-to-end tasks can be performed without confusing state, hidden consequences, or broken responsive layout.

### Phase 3 — Observability and workspace control

- Overview.
- Analytics.
- Content.
- Integrations.
- Settings and Team.
- Billing & usage.

**Exit gate:** data definitions, account health, settings impact, and plan limits are easy to understand.

### Phase 4 — Cross-product quality

- Update and smoke-test documentation.
- Run Playwright, lint/build, axe review, responsive screenshots, and manual keyboard passes.
- Verify light/dark themes, 200% zoom, long labels, sparse data, and failure states.
- Remove obsolete styles and components only after routes are migrated and verified.

**Exit gate:** documented evidence that critical routes and workflows work. Screenshots alone do not establish interaction or accessibility compliance.

## 8. Design system contract

Before the broad screen migration, document the following central tokens and components:

- Color roles: canvas, surface, raised surface, text, subtle text, border, primary action, focus, success, warning, error, disabled.
- Typography: display/page heading, section heading, body, compact body, metadata, data/table numbers.
- Spacing and layout density: standard content, wide work area, builder/inbox full workspace, mobile gutters.
- Radius and elevation: semantic tiers rather than one radius on everything.
- Components: button/action hierarchy, field/form validation, tabs, menus, confirmation dialog, status badge, data table, filter bar, empty/loading/error/success state, toast/inline feedback.
- Interaction rules: focus, keyboard behavior, reduced motion, disabled/loading behavior, destructive confirmation.
- Screen templates: use only when they make the workflow better; do not force every page into one.

Use the existing React + TypeScript stack and current shared UI foundation where possible. Refactor the system deliberately rather than adding a second component framework.

## 9. Definition of done for each redesigned route

- [ ] Actual user task and primary action are explicit.
- [ ] Visual choices reflect SignalAI's direction and this route's workflow.
- [ ] Real data, status, and metric definitions are correct.
- [ ] First-use empty, no-results, loading, error, success, and relevant edge states are handled.
- [ ] Destructive and live/production actions explain their consequences.
- [ ] Keyboard, focus, labels, screen-reader status, and reduced motion are reviewed.
- [ ] Desktop, 768 px tablet, and 390 px mobile layouts are checked.
- [ ] Both supported themes are checked.
- [ ] Tests/build/lint are run as appropriate; skipped checks are recorded.
- [ ] Documentation and visible product terminology stay in sync.

## 10. Source and evidence boundaries

The initial issue list is based on the production audit dated 13 October 2026. It is a desktop audit at approximately 1600 × 950, and the source report explicitly notes limitations: interactive controls could not be activated, responsive sizes were not captured, and the Builder interactions were not verified. These are called out as evidence gaps rather than proven defects.

The anti-slop principles are adapted from the external sources listed in [ANTI_AI_DESIGN_SOURCES.md](./ANTI_AI_DESIGN_SOURCES.md). These sources inform the review method; the route findings and priorities above are SignalAI-specific.

## 11. Recommendation

Do not attempt a giant one-commit redesign of every page. Make this a **system-level redesign shipped through small, verifiable route migrations**. Start with the design foundation, then correct data/trust defects and prove the Builder, Inbox, and Leads patterns. Expand only after the foundations behave correctly in real workflows.

The result should be visually more distinctive because it is specifically designed around SignalAI's operating model—not because it contains more decoration.
