# Precision Operations preview — UI audit and ship-blocker fixes

Branch: `feat/precision-operations-product-ui`. Scope: the design preview only; no production route or server code touched.

**Problem reported:** asked to review the deployed preview for inconsistencies and say how the UI could improve. The review turned up three defects that made the preview itself unreviewable, so those were fixed and redeployed.

## Root cause

The preview stacks four stylesheets, each patching the one before with blunter selectors:

| File | Lines | Role |
|---|---|---|
| `styles/precision-operations-preview.css` | 1,893 | token set A + all layout |
| `styles/precision-operations-design-system.css` | 101 | token set B + overrides of A |
| `styles/precision-operations-final-fixes.css` | 5 | overrides of B |
| `precision-operations-audit-fixes.css` | 3 | hides a button via `:has(+ …)` |

All three ship-blockers lived in the last two layers. `DESIGN.md` explicitly forbids this ("Do not create a parallel palette", "Do not add a new font, palette, token namespace, or UI framework for a page refresh").

## Fixes

**1. Three real tabs were invisible.** `[role="tablist"] > :last-child { display: none }` was written to hide one save-status `div` in the builder subnav, but it hid the last child of *every* tablist: "Start from a template", "Notes" and "Lead conversion" — all three linked from `PRECISION_OPERATIONS_PREVIEW_GUIDE.md` as screens to review. The div now sits outside the tablist (also fixing the ARIA violation — a tablist may only contain tabs) and is hidden by its own class.

**2. No focus indicator anywhere.** `--po-focus` was declared twice with incompatible types: a colour (`#6d36d8`) on `.po-preview-app` and a shadow triple on `body:has(.po-sidebar)`. Custom properties resolve by inheritance proximity, not source order, so the colour won; `box-shadow: var(--po-focus)` became invalid and was dropped, while the rule's `outline: none` survived. Measured live before the fix: `outline: none 0px; box-shadow: none` on nav items and both button variants.

Dropped the dead colour token *and* the override itself, so `preview.css`'s existing `outline: 2px solid var(--po-primary)` (5.7:1) applies again. The override had been replacing it with a 0.18-alpha shadow that composites to **1.31:1** — below the 3:1 non-text minimum. Also removed `outline: none` from the field `:focus` rule.

**3. Dark mode substantially broken.** The design-system token block is light-only and set on `body`, so the preview's own `.is-dark` class — which redefines a *different* namespace (`--po-ink`/`--po-line`/`--po-canvas` vs `--po-text`/`--po-border`/`--po-bg`) — never overrode it. Measured live: sidebar plan card **1.10:1**, KPI labels **2.17:1**, secondary button text **1.08:1**, plus 13 hardcoded light backgrounds with no dark counterpart.

Added a dark token block (same specificity as the light one, so source order decides — it must stay last) plus overrides for the light fills that had no token to follow. An audit found **41** hardcoded light fills in `preview.css` with no dark counterpart; the ones actually causing failures were fixed (conversation rows, canvas footer, add-step, icon buttons, leads table, thread empty state, post context).

Kept the production accent `#7c3aed` for *filled* shapes in dark mode — white on the lavender `--po-primary` is **2.36:1**. This also fixed the brand row, which was hardcoded `background: #fff` so the wordmark painted light ink onto white.

**4. Light-mode contrast.** Pointed the remaining muted literals (`#687386`, `#697386`, `#7b8496`, `#8a938d`, `#89928c`, `#929b94`, `#929a94`) at the token, and nudged `--po-muted`/`--po-text-muted` so they pass on the tinted canvas and table headers, not just on white. The "coming soon" palette rows are plain `<div>`s, not disabled controls, so the WCAG inactive-component exemption does not apply to them.

## Verification

Headless Chrome over 14 screens × 2 themes, plus a keyboard-tab pass for focus and a live check of the deployed bundle. Distinct contrast failures: **87 → 19**. All 19 remaining are exempt or false positives:

- `.text-accent` "AI" (2.87:1) — logotype, exempt under WCAG 1.4.3, and matches production's own dark sidebar
- `.po-canvas-watermark` "SAMPLE FLOW" — decorative
- Pagination "Previous" — confirmed `disabled: true`
- `.po-post-art-*` on Content — text sits on a CSS `linear-gradient`; the scanner reads `backgroundColor` as transparent and walks up to the page background

`npm run build` and `oxlint` clean (0 errors; the `set-state-in-effect` warnings are pre-existing). Deployed to `srv-db6jodij9qps73cmcdb0` (deploy `dep-db76qkui0phs738p9p30`, live) and re-verified against the URL.

## Not done / caller's call

The systemic problems behind these bugs were reported but deliberately **not** fixed, since they reshape the design system and want their own pass:

- Collapse the four stylesheets into one, and drop the parallel `--po-*` palette in favour of the production tokens in `index.css` per `DESIGN.md`. Every "fixes" file is a signal the layer below has the wrong specificity.
- **Type:** 26 distinct font sizes (8px–36px, incl. `15.3px`); the two most common are 9px (95 uses) and 10px (108 uses) — 58% of declarations. `.po-panel-copy`, a description paragraph, is 10px.
- **Weight:** 17 values, only 5 loaded (`400;500;600;700;800`). `650` and `700` render identically; `720/730/740/750/760/780/800/820` — 90 declarations — all render as 800. The hierarchy is fiction.
- **Spacing:** every integer 2px–38px. **Radius:** 14 values against 4 tokens; the most-used (`4px`) isn't one.
- Purple does six jobs (primary buttons, active nav, links, chart bars, pipeline bars, status chips); three primary buttons compete on Automations. `Draft` and `Paused` are both neutral grey.
- **Touch targets:** nothing meets 44×44 — 15×15 row checkboxes, 21×17 pagination, 31×31 row menu, 34×34 global icons, 38px buttons.
- **Mobile 390px** (previously unverified, now checked): no horizontal scroll, but the sidebar becomes a horizontally-scrolling nav row with the active item clipped mid-word and no scroll affordance, hiding 7 of 11 destinations; three stacked header bands eat ~460px before content.
- Charts have no axis value labels.
- The dark palette is green-tinted (`#141816`/`#1b211e`/`#303a34`) while production dark is slate/navy (`#0f172a`/`#1f2937`/`#374151`) — two product identities. Left as-is here to keep the fix surgical.

---

# Round 2 — typography, controls, standalone screens (14 October 2026)

Commit `034fc07`, deploy `dep-db77g6d9fdbs739s362g` (live).

## Font consistency

**Sizes.** 26 declared sizes between 8px and 36px (incl. `15.3px`); the two most common were 9px (95 declarations) and 10px (108), so ~50% of visible text rendered below the 12px body minimum. Remapped 237 declarations onto a 10-step scale — `11/12/13/14/16/18/20/24/28/32` — scaling px line-heights by the same ratio so they stay proportional. 11px is now reserved for uppercase micro-labels; nothing else sits below 12px. A bare `<small>` on Knowledge was falling back to the browser's `0.8333em` (10.83px) and now takes the scale.

**Weights — measured, reported, not changed.** Only `400;500;600;700;800` are loaded, so the 18 declared weights collapse to **5 rendered faces**. Proven by measuring glyph widths of the same string at each weight: `450/500` are identical, as are `550/560/600`, `640/650/660/700`, and `720/730/740/750/760/780/800/820`. Three places lose an intended contrast — the builder breadcrumb (650 link vs 700 current), the inbox lead-context heading vs its button (700/650), and the docs sidebar where the section label (800) and its topic links (760) render identically. Fixing this means picking real steps per component, which belongs with the token rebuild.

Also 19 line-height values mixing unitless and px, 19 letter-spacing values (incl. a lone `-2px` among ems), and three different spellings of the same font stack — one hardcoding the family instead of `var(--font-sans-stack)`. Reported, not changed.

## Controls

- **Wrapping buttons.** "Add source" and "Invite teammate" each broke onto two lines: `.po-button` had no `white-space: nowrap` and was being shrunk by its flex parent.
- **Search fields.** Two heights (40/43px) and three paddings across five instances; unified.
- **Selects.** Six different treatments. Only `.po-select-wrap` drew a custom chevron — the other five used the **native OS arrow**, which sits flush against the right border, and `.po-automation-filter` reserved 30px of padding for a chevron it never drew. All now share one height, padding and chevron (with a dark-mode variant). The leads filter row was furthest out (48px tall, 11px radius, 16px text, its own border colour) and was normalised **at source** rather than with another override.

## Standalone screens

`precision-operations-design-system.css` was scoped to `body:has(.po-sidebar)`. The sign-in, invitation and connection-recovery screens render no sidebar, so **none of its 135 rules applied there** — the same `.po-button--secondary` rendered `5px/36px/11px/730` on sign-in versus `8px/38px/13px/650` in the app. Rescoped to `:has(.po-preview-app)`; all five screens now render identically in both themes (verified).

## Layout and markup

- **Horizontal overflow removed** at 390px and 768px. The analytics "Top posts" table had no scroll wrapper while its sibling did (fixed in markup); the lead profile heading had `min-width: 200px` that a status chip pushed past the viewport.
- **Mobile nav.** `:not(:first-child){display:none}` hid the entire Workspace section below 900px, making Integrations, Team, Billing and Settings **unreachable**. Both sections now scroll in one row, and the row no longer expands the page.
- **Duplicate DOM id.** Two `<Logo>` instances on sign-in emitted the same `#signalai-logo-gradient`; now per-instance via `useId()`.
- **Tabs.** Analytics, builder and inspector tablists had no `aria-controls` and no `role="tabpanel"`; all three are wired now. (Keyboard models still differ — only lead-detail implements roving tabindex with arrow keys. Reported.)
- **Search inputs had no accessible name** — each sits in a `<label>` containing only an icon and the input, so `label.textContent` is empty and the placeholder was the only name.

## Verified

Headless over 14 screens × 2 themes, re-run against the live deployment: **0** page-level horizontal overflow at 390/768/1024/1440; no dangling ARIA refs, duplicate ids or unnamed controls; contrast unchanged at 19 known-exempt items; rendered type down to **10 sizes**. Build and `oxlint` clean.

Two regressions the type bump introduced were caught and fixed: "AI usage" and the inbox "Pipeline stage" label — both label/value rows where only the value was `nowrap`, so the label absorbed the squeeze.

**Still not done:** the font-weight collapse, line-height/letter-spacing spread, collapsing the four stylesheets, the parallel `--po-*` palette, purple's six jobs, `Draft` vs `Paused`, and 44×44 touch targets.

---

# Round 3 — type sizes assigned by role (14 October 2026)

Commit `f3f866d`, deploy `dep-db77n1ad0e5s73fhvef0` (live).

**What round 2 got wrong.** It normalised the *vocabulary* of font sizes (26 → 10) but remapped each declaration relative to its old value, so every page kept its own base. Leads had been built on 14px while Inbox, Knowledge, Integrations and Team sat on 12px — Leads read ~17% larger — and the same role drifted per screen: section headings spanned 12/13/14/16/18/20/24/28px and page titles 24/28/32px.

**Fix.** Size is assigned by **role**, not per page, applied at source rather than through another override layer. Selectors were classified from the stylesheet inventory, then 258 declaration blocks rewritten with px line-heights scaled by the same ratio.

| Role | Size |
|---|---|
| Sign-in hero (display) | 40px |
| Page title (`h1`, every screen incl. auth/recovery) | 32px |
| Metric values | 28px |
| Section heading (every panel/card/modal/table-toolbar `h2`) | 18px |
| Sub-heading (`h3`) | 16px |
| Body, table cells, nav, buttons, inputs | 14px |
| Dense body (reserved) | 13px |
| Labels, captions, `<small>`, metadata, chips | 12px |
| Uppercase tracked labels and table `th` | 11px |

Rules where `font-size` sizes an icon glyph, an avatar initial or the wordmark were excluded, so icons did not change size. Two hand corrections after the mechanical pass: the sign-in hero was classified as a section heading (restored to display), and `.po-source-summary` was grouped with `small` though it is body copy.

**Result, measured live across 14 screens:** body mode is 14px on 13 of 14, `h1` is 32px and `h2` is 18px on every screen that has one. Overview keeps a 12px median because it is genuinely caption-heavy — KPI labels and footnotes are label-role — not because its scale differs.

The scale is recorded in `DESIGN.md` under "Type and copy" so the next screen inherits it instead of inventing another base. That section also records that weights must stay on the five loaded faces (`400/500/600/700/800`), since in-between values are silently rounded.

**Verified:** 0 page-level horizontal overflow at 390/768/1024/1440; contrast unchanged at 19 known-exempt items; build and `oxlint` clean.

**Deployment note.** Render fronts the static site with a CDN using `s-maxage=300` on `index.html`. For five minutes after a deploy the edge can serve the previous HTML, pointing at the previous CSS hash — a verification run against the plain URL during that window reports stale values. Append a cache-busting query param (or hard-refresh) when checking a fresh deploy.

---

# Round 4 — anti-slop guidelines applied (14 October 2026)

Commit `f942daf`, deploy `dep-db78cq7avr4c73fb0cu0` (live).

Audited against `AGENTS.md` "Anti-slop review before shipping frontend work", `DESIGN.md` "Deliberate anti-defaults" + the design-change self-audit, and the adaptation notes in `docs/ANTI_AI_DESIGN_SOURCES.md`.

## Already clean (checked, not changed)

No `transition: all`; no emoji iconography; no generic button labels (`Submit`/`Click here`/`Learn more`); no fabricated metrics, testimonials or customer logos — sample data is labelled 129 times across the two page files; `prefers-reduced-motion` handled in both stylesheets; every selector scoped under `body:has(.po-preview-app)`, so nothing leaks into production screens.

## Fixed

**Decorative purple gradients.** `.po-outcome-banner` carried a purple-to-white wash declared *three separate times* across the two stylesheets (`preview.css:1514`, `preview.css:1613`, `design-system.css:60`) plus purple-tinted borders — on an element that is neither an action nor a selected state. Now a plain surface with a neutral border.

**Purple as a blanket colour.** It was doing six jobs: primary buttons, active nav, links, activity chart bars, pipeline bars and the usage meter. Data bars moved to the supporting blue accent (`--po-info`), so purple reads as "action or selection" again per `DESIGN.md` "Brand and tokens". Verified against the 3:1 non-text minimum in both themes — which surfaced that the usage meter's track was a hardcoded light purple with no dark value (1.62:1 in dark); it now has one.

**Status colour without meaning.** `Draft` and `Paused` both rendered as the same neutral chip. `Paused` is now its own tone. Colour was never the only signal — the chips carry text labels.

**Generic AI claim.** "AI-powered Instagram automation: …" replaced with what the product does. `DESIGN.md` names "AI-powered" explicitly.

**Arbitrary rounding.** 13 radius values against 4 defined tokens → `6/8/12/16` plus the pill. Live now reports only `6px/8px/12px/999px`. The chart bar cap keeps its `3px 3px 0 0` shape.

**Tiny touch targets.** Row checkboxes 15×15, row action menu 31×31, global icons 34×34, pagination 21×17. Hit areas expanded with an overlay so the dense desktop layout keeps its visual size, and controls grow to 44px under `@media (pointer: coarse)` where the minimum actually applies. Down from 14 undersized controls to 2 — an input whose 44px wrapper is the real target, and a tab 1px under on width. Inline text links keep their size (WCAG 2.5.8 exempts them).

**Weights implying a hierarchy they did not have.** 17 declared weights collapsed onto the 5 loaded faces, so `650` and `700` rendered identically. All snapped to what the browser already drew — visually a no-op — and the three places where this had erased a real distinction were given genuine steps: the builder breadcrumb (parent link now 500 against the current page's 700) and the docs sidebar (group label now an 11px uppercase eyebrow against its 500-weight links). Live now reports only `400/600/700/800`.

## Judgement call left in place

`backdrop-filter: blur(2px)` on the modal scrim. The anti-defaults list "glassmorphism", but this is layering depth on an overlay — which `DESIGN.md` explicitly reserves elevation for — not a glass treatment applied to a content surface.

## Verified

0 page-level horizontal overflow at 390/768/1024/1440; contrast unchanged at 19 known-exempt items; 0 remaining invisible weight contrasts; build and `oxlint` clean. One regression introduced and fixed during the pass: the `.po-detail-control` padding change met the nowrap "Pipeline stage" label in a narrow panel and overflowed at 768px — the lead-context rows now wrap.

---

# Round 5 — same role, same type on every page (14 October 2026)

Commit `715eda4`, deploy `dep-db7g8paj9qps73cbm71g` (live).

Round 3 made the **sizes** consistent but not the **weights**, and the differences still tracked which page you were on. Measured role-by-role across 14 screens:

| role | before |
|---|---|
| table `th` | leads **800** vs 700 everywhere |
| table `td` | leads **500** vs 400 |
| tag/chip | leads **500** vs 700 |
| input | leads **400** vs 600 |
| select | **400 / 500 / 600** — three weights |
| panel heading | integrations **800** vs 700 |

## Two causes

**The leads table is a parallel component.** `.po-leads-production-table` was built with its own treatment: a 48px header and 55px rows against the standard 42/64, weights 800/500 against 700/400, its own borderless 27px chip, and a **purple `#f3e8ff` header** — purple as decoration on a table header, which `AGENTS.md` rules out and which the round-4 audit missed. It now uses the same treatment as the automations table.

**The heading rules enumerated their components.** The design system forced 700 on a *list* of `h2` selectors, so any `h2` not on the list kept its own 800 — `.po-integration-card-header h2` was one. Headings and form controls are now assigned by **element** (`h1`/`h2`/`h3`, `input`/`select`/`textarea`), which covers every component including ones added later. The sign-in hero keeps its display size through an explicit exception.

## Result

Verified on the live deployment: page title, subtitle, eyebrow, panel heading, panel description, table header, table cell, primary and secondary button, chip, caption, input and select are **identical on all 14 pages**. Nav items read 700 active / 600 inactive on every page — a selection state, not a per-page difference (confirmed by measuring both states on three screens).

0 page-level horizontal overflow at 390/768/1024/1440; contrast unchanged at 19 known-exempt items; build and `oxlint` clean.

**Repeat of the CDN trap:** the first live verification reported 600 for inputs on three pages. Direct measurement of the same elements with a fresh cache-buster showed 500 on both local and live — the edge had served a stale `index.html`. Always confirm a suspicious live reading against the specific element before treating it as a real difference.
