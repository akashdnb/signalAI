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
