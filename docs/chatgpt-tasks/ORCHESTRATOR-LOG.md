# Orchestrator Log

## 2026-10-17 — Bootstrap entry

**Timestamp:** 2026-10-17 02:10 Asia/Kolkata (IST)

### Initial review findings

- Read `AGENTS.md`, `DESIGN.md`, and `client/src/components/ui/README.md` first.
- The CSS consolidation audit found that `App.tsx` still imports `precision-operations-preview.css` alongside `app-shell-phase2.css`, `core-screens-phase4.css`, and `product-polish-phase5.css`. Meanwhile, `main.tsx` imports `index.css`, `precision-operations-production.css`, `precision-operations-workflows.css`, and React Flow CSS.
- Preview CSS contains 15 `--po-*` root/scope variables. Applying an exact semantic mapping in bulk is not safe before visual output and dark-mode contrast are verified.
- The live BrowserMCP comparison found that production `/leads` has real filtering for stage, qualification, handoff, activity date, sort/search, and Instagram account, plus 24 real leads and pagination. The live preview Leads screen uses sample data and simpler, different filters. Preserve all production behaviors.
- The login gradient should be treated as an intentional central-token decision, not an unreviewed page-level override.
- Production has not been deployed or changed.

### Next steps

1. Receive and review delegated audits.
2. Implement CSS consolidation in a reviewable PR.
3. Bring Leads and Automation to parity while preserving production behavior.
4. Address dashboard and analytics parity.
5. Perform QA at light and dark themes and supported widths.
6. Deploy only after all steps have been verified.

### Verification

No checks or builds have run for this entry.

## NEEDS DECISION

**BLOCKED — Step 1 requires a product/architecture decision.**

Should the sandbox route `?preview=precision-operations` and `precision-operations-preview.css` remain bundled in production for ongoing comparison, or be retired from the production bundle after QA and kept only in the separate preview service/branch? The implementation guide says the sandbox and `--po-*` namespace must not ship, but the task also requires preserving the sandbox's rendered output while mapping its private palette. Those requirements cannot both be satisfied by a direct shared-token replacement without visual changes.

**Recommendation:** preserve the separate live preview service as the reference and retire its production-bundle route/CSS reference only after final production visual QA is complete. Do not perform that removal or guess the user's decision in this PR. Until then, preserve all existing preview code and styles. Keep `precision-operations-production.css` and `precision-operations-workflows.css` separate unless computed-style tests prove a merge is safe.

## 2026-10-17 — CSS consolidation review

**Timestamp:** 2026-10-17 02:17 Asia/Kolkata (IST)

### Scope decision

- Inspected `AGENTS.md`, `DESIGN.md`, `client/src/components/ui/README.md`, `docs/PREVIEW_TO_PRODUCTION_IMPLEMENTATION.md`, `docs/PREVIEW_TO_PRODUCTION_LOG.md`, `App.tsx`, `main.tsx`, `index.css`, and the three Precision Operations CSS files on `feat/preview-to-production-foundation`.
- Reviewed recent Git history, merged PR #89 (the log bootstrap), the migration PR #57 notes, and existing open PRs before editing. The requested task branch was created from the specified base.
- **No safe no-output-change bulk mapping exists for the 15 `--po-*` values.** The preview palette uses `#f6f7f4 / #19221e / #59635e / #78817c / #dfe4de / #cbd3cc / #6d36d8 / #5c2cc0 / #f0eafe / #21734e / #e7f5ec / #8e5d10 / #fff3da`, plus white and off-white surfaces. Production tokens resolve to a slate/blue palette and change under `[data-theme]`, OS dark mode, and `data-palette` variants. Substituting the shared tokens would visibly change the scoped sandbox, especially dark mode; globally changing production tokens or overriding them screen-by-screen is out of scope.
- Accordingly, this PR retains the preview-scoped values and all current selector specificity/cascade/import order. It does not copy preview classes or palette into production.
- The production stylesheet and workflow stylesheet remain separate because they target different but load-bearing production selector groups; the workflow file's later import order may decide the winner for overlapping declarations. Their file headers now state this constraint. No import change or file move is justified without a computed-style visual parity test.

### Changes and safety boundary

- Clarified preview CSS comments documenting why the scoped palette is intentionally retained pending an exact semantic mapping.
- Clarified production/workflow CSS comments about the distinct roles and import-order contract.
- **Step 1 is NOT complete.** No `--po-*` token remapping was implemented.
- **Stylesheet consolidation is NOT complete.** The preview, production, and workflow stylesheets remain in their current locations and import boundaries.
- No component markup, API behavior, sample/real-data boundary, selectors, declarations, or imports changed.
- The prior entry incorrectly characterized the blocker as not requiring a product decision. This follow-up corrects that record: the preview-bundle disposition is a product/architecture decision and is now explicitly recorded under `NEEDS DECISION` above.

### Regression checklist (must be executed before merge)

- [ ] Preview route (`?preview=precision-operations`) still loads and remains isolated from production routes.
- [ ] Light theme at 390 / 768 / 1024 / 1440 CSS px.
- [ ] Dark theme at 390 / 768 / 1024 / 1440 CSS px.
- [ ] Production Dashboard, Leads, Automation, Analytics, and workflow builder styles remain unchanged.
- [ ] Confirm stylesheet request order: `index.css` → `precision-operations-production.css` → `precision-operations-workflows.css` → React Flow CSS → App stylesheet sequence (`app-shell-phase2.css` → `core-screens-phase4.css` → `product-polish-phase5.css` → preview CSS).
- [ ] Build/lint and CI checks pass.

### Verification

- Source inspection and git-history/open-PR reconciliation completed with GitHub tools.
- Automated build, lint, and rendered-browser checks were not run in this task environment; do not treat the checklist as passed. CI/live browser validation remains outstanding.
- Follow-up review confirmed that this branch preserves all existing CSS/code and only updates this orchestrator log; no destructive removal or token replacement was performed.

## 2026-10-17 — Step 1 decision follow-up

**Timestamp:** 2026-10-17 02:xx Asia/Kolkata (IST)

- **BLOCKED:** Step 1 remains incomplete. Token remapping is NOT complete and stylesheet/file consolidation is NOT complete.
- The current PR intentionally preserves all code and styles. No sandbox route/CSS removal, palette replacement, or production/workflow stylesheet merge was performed.
- The user decision requested above is still outstanding. The recommendation remains to preserve the separate preview service and retire its production bundle reference only after final visual QA, but this PR does not make that decision or perform the removal.
- `precision-operations-production.css` and `precision-operations-workflows.css` remain separate pending computed-style evidence that a merge preserves cascade behavior.
