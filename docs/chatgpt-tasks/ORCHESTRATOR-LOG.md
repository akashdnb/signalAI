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

**Timestamp:** 2026-10-17 02:20 Asia/Kolkata (IST)

- **BLOCKED:** Step 1 remains incomplete. Token remapping is NOT complete and stylesheet/file consolidation is NOT complete.
- The current PR intentionally preserves all code and styles. No sandbox route/CSS removal, palette replacement, or production/workflow stylesheet merge was performed.
- The user decision requested above is still outstanding. The recommendation remains to preserve the separate preview service and retire its production bundle reference only after final visual QA, but this PR does not make that decision or perform the removal.
- `precision-operations-production.css` and `precision-operations-workflows.css` remain separate pending computed-style evidence that a merge preserves cascade behavior.


## 2026-10-17 — Auth and typography migration pass

**Timestamp:** 2026-10-17 02:30 Asia/Kolkata (IST)

### Merged work

- PR #90 (`chore(css): document safe Precision Operations stylesheet consolidation`) was squash-merged to `feat/preview-to-production-foundation` as `115ec7ff92d3b84ceedd7389e4c34acb00d01fce`. This was intentionally a log/comment safety update only. Step 1 token remapping and stylesheet consolidation are NOT done. The preview-bundle route/palette decision remains under `## NEEDS DECISION`. Preview CSS declarations and imports were preserved; production and workflow CSS remain separate pending actual cascade proof.
- PR #91 (`fix(ui): flatten login background and align page typography`) was squash-merged as `31b675fc28ac019e9c06a20b23b971edc6b9bd21`. It replaces the decorative login gradient with shared `var(--bg)`, removes unused `--auth-gradient` definitions, caps the Overview title at 32px, adjusts the eyebrow to 12px, and aligns Analytics title/labels. Auth/data/API behavior remains unchanged.

### CI and smoke status

- CI run `client-ci` #506 passed lint/typecheck/build for head `0fec0c5dd2e9d686a976265b28ad946ca254623a`.
- Chromium smoke run #412 failed 6 assertions: Team mobile fit, automation list keyboard dismissal, Inbox fixture text, username fallback, AI reply preferences initial state, and draft label.
- A read-only source comparison found that PR #91 does not touch those implementations or the e2e test file. Classify these failures as likely unrelated, not confirmed pre-existing, because no base-branch smoke run was found. These failures did NOT pass.

### Outstanding QA and next work

- Rendered before/after visual checks across light/dark themes and widths 390/768/1024/1440 remain outstanding.
- Production has not been deployed or modified by this migration.
- Next: do a focused Leads visual parity PR while preserving the richer real production filters, account scope, pagination, and data; separately inspect and polish the actual production JourneyBuilder editor against preview BuilderScreen (do not reshape AutomationPage catalog into a canvas); then stage all changes for full rendered QA and deploy only once steps 1–4 and the visual check are complete.

## 2026-10-17 — Release branch divergence and visual QA status

**Timestamp:** 2026-10-17 02:46 Asia/Kolkata (IST)

### Verified source drift / visual reference

- The live Render preview service `signalai-precision-operations-preview` is configured to branch `feat/precision-operations-product-ui`.
- Its `client/src/pages/PrecisionOperationsPreviewPage.tsx` is approximately 124 KB (blob SHA `35382f4865c6ae78ab37a53b7f5c57a6747db03e`) and `client/src/styles/precision-operations-preview.css` approximately 152 KB (blob SHA `d5da61d519cddc0e7fd7edfca22a20dab53e846c`). The same paths on `feat/preview-to-production-foundation` are approximately 28.7 KB (blob SHA `c1d838c048c26bde2227238383b81fe2f9d392be`) and approximately 43.4 KB (blob SHA `2d081d2d591cd91496b9df6da40bd5c8948d344e`).
- The deployed preview contains newer Preview Full Screens plus design-system/color/palette override files that are not present on foundation. Visual parity tasks must therefore use the **live rendered preview** as the source of truth. Do not copy `.po-*` or `--po-*` styles into production; keep the guide's production-token policy.

### Release blocker: main/foundation divergence

- GitHub compare `main` → `feat/preview-to-production-foundation` remains diverged. `main` head is `f81a47e5ffc10b0da35bd12897c5fa997778e5e2`; foundation head at audit time is `0d398f44665ec2e72b96d32cb33ac02e6e1553cd`; merge base is `dbc787a797105e3a8a16515099dfb78339f57ed2`. `main` is 33 commits ahead of the merge base and those commits are absent from foundation; foundation has 114 unique commits.
- Main-only production behavior includes workspace/account selection and role access controls, tenant-validated selected-account scoping across Leads/Inbox/Content/Analytics, newer API pagination and CRM filters, persisted notifications, analytics correctness, knowledge APIs, migration-history/notification-schema fixes (#84–#86), and MCP/OAuth/capability paths. The current foundation Leads page also lacks several main filters/context.
- **Release blocker:** a foundation deploy is unsafe until a reviewed reconciliation PR brings main-only production behavior into a child branch from foundation and then back into foundation. Never write to `main`.

### Current visual PRs / CI and smoke status

- PR #93 (`style(builder): align production journey editor with preview`) remains open and unmerged at head `003baced0c610b6d0f705591e6ec2cf84a7ce95d`. It is a narrow presentation-only change: the PR adds a scoped parity stylesheet and a small page hook, with no preview tokens or API/behavior removal.
- PR #94 (`style(leads): polish production table visual hierarchy`) remains open and unmerged at head `f3076db1c0eb709bb4fa27584c9040a1a3cd404e`. It is a narrow CSS-only presentation change with no preview tokens or API/behavior removal.
- Verified CI mapping: PR #93 head passed `client-ci` run **#518** (lint/typecheck/build); its Chromium smoke run **#424** failed. PR #94 head passed `client-ci` run **#521** (lint/typecheck/build); its Chromium smoke run **#427** failed.
- Both Chromium smoke runs failed the same six assertions, with 26 other tests passing: Team mobile fit; automation-list keyboard dismissal; Inbox fixture/text mobile behavior; unresolved Instagram username fallback; AI reply preferences initial expansion; and draft status label. The failures are similar across the two sibling PRs but are **not confirmed pre-existing** without a base-branch smoke run. Do not claim smoke passed.
- Neither PR has received rendered before/after checks in both themes and responsive widths. Visual QA remains outstanding.

### Reconciliation attempt

- Branch `task/reconcile-main-into-foundation` exists, but its first pass made no code/merge commit and opened no PR. GitHub compare currently confirms that branch is identical to foundation (`0d398f44665ec2e72b96d32cb33ac02e6e1553cd`).
- A temporary integration-only PR #95 was created from `main` into `task/reconcile-main-into-foundation` to test GitHub's real three-way merge without changing `main`. GitHub reported `mergeable=false`; PR #95 is **closed without merge**.
- PR #95 previewed 136 changed files across 33 main-only commits (+18,625/-1,611). Conflicts span client/App.tsx, AppShell, TenantContext, index.css, Leads/Inbox/Content/Analytics/JourneyBuilder, and backend runtime/migration files. The audit also found a same-timestamp migration identity issue; no migration was renumbered or deleted.
- No integration commit was created. `task/reconcile-main-into-foundation` remains identical to foundation at `0d398f44665ec2e72b96d32cb33ac02e6e1553cd`. No outer task→foundation reconciliation PR exists. `main`, foundation, PR #93/#94, and production deployment state were not changed by that attempt.
- The worker stopped rather than manufacturing a merge tree with unvalidated conflicts. A genuine local Git checkout plus semantic three-way resolution and client/server/build/migration/security tests is required. The local runtime in this chat could not reach github.com, so no local checkout/test is available here.

### Step 1 status

- Step 1 stylesheet/token consolidation remains **NOT complete**. The existing `## NEEDS DECISION` question about whether the production-bundled preview route/palette remains or is retired remains unanswered.
- No `--po-*` token replacement, preview-route removal, or production/workflow CSS merge has been performed.

### Next steps / release gates

1. Hand off `main` → foundation reconciliation to a real local Git checkout for semantic three-way conflict resolution and client/server/workflow/migration/security validation; do not manufacture a merge tree from Git Data APIs.
2. Create the final reviewed child→foundation reconciliation PR only after that local resolution and test evidence is complete; do not merge or deploy until reviewed, and never write to `main`.
3. Bring PRs #93/#94 onto the reconciled base if needed.
4. Rerun relevant builds/smoke and visually inspect light/dark themes at 390/768/1024/1440 CSS px.
5. Resolve or accurately document the smoke failures and the outstanding preview-route decision.
6. Deploy only after all release gates pass.

### Verification

- Read `AGENTS.md`, the existing orchestrator log, current foundation/main branch metadata, the main/foundation compare, the reconciliation branch compare, and PR #93/#94 metadata before the original docs-only update.
- Verified PR #95 is closed and unmerged, with `mergeable=false`, and recorded its integration scope and conflict/test handoff above.
- This branch changes only `docs/chatgpt-tasks/ORCHESTRATOR-LOG.md`. No application files were modified. No merge, deploy, or `main` change was performed.

## 2026-10-17 — Reconciliation worker outcome follow-up

**Timestamp:** 2026-10-17 02:49 Asia/Kolkata (IST)

- Definitive reconciliation-worker outcome: temporary integration-only PR #95 was closed **without merge** after GitHub reported `mergeable=false` for the real three-way `main` → `task/reconcile-main-into-foundation` preview.
- PR #95 covered 136 changed files across 33 main-only commits (+18,625/-1,611), with conflicts across client runtime/layout, major production screens, and backend runtime/migration files. The audit also identified a same-timestamp migration identity issue; no migration was renumbered or deleted.
- No integration commit was created. `task/reconcile-main-into-foundation` remains identical to foundation at `0d398f44665ec2e72b96d32cb33ac02e6e1553cd`; no outer reconciliation PR exists. `main`, foundation, PR #93/#94, and production deployment state were unchanged.
- The worker intentionally stopped rather than manufacturing an unvalidated merge tree. Safe handoff is a genuine local Git checkout with semantic three-way conflict resolution, followed by client/server/build/migration/security validation. The local runtime in this chat could not reach github.com, so no local checkout or tests are available here.
- **Deployment remains blocked.** Continue to use BrowserMCP only; NEVER use Browser Use.

## 2026-10-17 — Cross-agent merge audit follow-up

**Timestamp:** 2026-10-17 03:02 Asia/Kolkata (IST)

### Audit outcome

- The requested read-only cross-agent audit found **NO candidate safe to squash-merge into `feat/preview-to-production-foundation` now**.
- Historical main-side snapshots that must be consumed through the current-main reconciliation rather than directly merged are **#81, #77, #75, #70, #71, #83, #72, #66, #63, #65, and #84–#86**. These are main-based historical snapshots whose changes overlap later fixes and/or the broader main/foundation divergence. Reconcile their final main state semantically rather than cherry-picking individual PRs.
- **#57 is already the foundation branch itself**, not a separate merge candidate.
- Open presentation-only PRs **#93 and #94** remain open and cannot be merged yet: current PR metadata does not provide a green overall CI state for either PR, and rendered parity verification remains incomplete. Their presentation-only scope does not remove the stale-base/reconciliation and visual-QA blockers.
- Open main-based work **#76 and #62** also require the main→foundation reconciliation path; neither is a direct foundation merge candidate.

### Reconciliation / POC status

- Temporary POC PR **#97 was closed without merge**. It remains a disposable conflict-editor test only and is not product work to merge into foundation.
- No code merge, deployment, or `main` change occurred during this audit step.

### Release gate

- Release remains blocked on a real local three-way reconciliation of current `main` into a child branch from current foundation, semantic conflict resolution, migration-history validation, and full client/server/browser checks. GitHub compare/PR metadata alone is not sufficient to manufacture the release merge tree.

### Browser cleanup

- Orchestration-owned stale agent/PR/source tabs were closed; user-owned tabs were left untouched.

### Step 1 status

- Step 1 token/style consolidation remains **INCOMPLETE**. The existing `## NEEDS DECISION` section remains unanswered; no preview-route disposition, `--po-*` remapping, or stylesheet consolidation decision was made in this step.

### Verification

- Read the current foundation `ORCHESTRATOR-LOG.md` before editing and preserved all prior history and the existing `## NEEDS DECISION` section.
- Refetched the current foundation ref before creating `task/log-agent-audit` and changed only `docs/chatgpt-tasks/ORCHESTRATOR-LOG.md` on that branch.
- Checks actually run in this docs-only step: GitHub source/PR metadata inspection, current foundation ref/file inspection, branch creation, and log-file verification. No application build, lint, smoke, rendered-browser, merge, or deployment check was run.

## 2026-10-17 — Current cross-agent audit implementation follow-up

**Timestamp:** 2026-10-17 03:10 Asia/Kolkata (IST)

### Audit outcome

- Refetched the current `feat/preview-to-production-foundation` ref before this docs-only update; current foundation includes the prior merged log-audit entry.
- The cross-agent audit found **no safe direct merge candidate** for foundation. Main-only functional PRs **#81/#77/#75/#70/#71/#83/#72/#66/#63/#65** and migration chain **#84–#86** must be recovered through a semantic reconciliation of current `main`, not cherry-picked individually.
- **#57 is already the foundation migration branch itself** and is not a separate feature to merge.
- **#93/#94 remain open presentation-only PRs.** Current PR metadata does not establish a currently verified green overall status, and rendered parity remains incomplete; neither is release-safe to merge before reconciliation and full QA.
- **#76/#62 remain open main-based PRs** and are not direct foundation merge candidates.
- **#97 is closed and unmerged**, and remains only the temporary conflict-editor POC.

### Release / validation gate

- Release remains blocked on a real semantic local reconciliation of current `main` into a child branch from foundation, followed by client/server/browser/migration/security validation. No merge tree should be manufactured from GitHub metadata alone.
- The Step 1 token consolidation remains incomplete and the existing **`NEEDS DECISION` is still unanswered**. No preview-route disposition, `--po-*` remapping, or stylesheet consolidation decision was made here.

### Browser cleanup

- Orchestration-owned stale tabs from the prior audit workflow were cleaned up; user-owned tabs were not touched.

### Verification

- Branch `task/log-agent-audit` was aligned to the exact current foundation head before the log update.
- This change is docs-only: `docs/chatgpt-tasks/ORCHESTRATOR-LOG.md`.
- No app changes, merge, deployment, or `main` changes were made.

## 2026-10-17 — Real local three-way reconciliation completed (PR #100)

**Timestamp:** 2026-10-17 (Asia/Kolkata)

### Outcome

- Performed the real local Git checkout + semantic three-way reconciliation that every prior GitHub-API-only attempt (PR #95, temp POC #97, and the several audit entries above) said was required and could not perform itself.
- Foundation base `3897dff7d08bb31413af8843fc044b25f4795e57`, main `f81a47e5ffc10b0da35bd12897c5fa997778e5e2`, merge-base `dbc787a797105e3a8a16515099dfb78339f57ed2` — matches the divergence stats already recorded above (33/117 commits, 136 files, +18,625/-1,611) exactly.
- Created disposable branch `task/reconcile-current-main-into-foundation` from current foundation HEAD, ran a real `git merge --no-ff origin/main`, and resolved all 14 real content conflicts by hand (client/src/App.tsx, AppShell.tsx, index.css, main.tsx, KnowledgeBasePanel.tsx, automation/AnalyticsPanel.tsx, automation/JourneyBuilder.tsx, pages/AnalyticsPage.tsx, DashboardPage.tsx, InboxPage.tsx, IntegrationsPage.tsx, LeadsPage.tsx, SettingsPage.tsx, TeamPage.tsx). The remaining ~122 of 136 changed files merged without conflict.
- Opened **PR #100**, `task/reconcile-current-main-into-foundation` → `feat/preview-to-production-foundation`. **Not merged.** `main` and foundation were not written to directly.

### What main-side functionality this recovered

Workspace/multi-account switching and `selectedAccountId` scoping (Leads/Inbox/Analytics), Leads CRM qualification/date/sort filters and the Analytics→Leads source-media deep link, real Notifications (replacing two non-functional "visual shell" settings mockups that this reconciliation found and fixed in `SettingsProfilePage`/`SettingsNotificationsPage`), Team role-gating and the editable workspace-settings card, Integrations role-gating, Inbox lead tags (foundation's own merge of this file left a dangling `setTags(null)` call referencing no declared state — a `ReferenceError` on first render — fixed by restoring the full feature rather than deleting the call), a funnel analytics correctness fix (server-computed `stageCounts`/`unmappedLeadCount`), and the MCP/OAuth/notifications backend plus its migrations, now wired into `app.ts`.

### CSS / preview-token audit result

Repo-wide search for `.po-*`/`--po-*` outside preview-scoped files found one file pair (`ConnectedAccountSwitcher.tsx`/`.css`, added by main) that references the preview namespace, but traced it to a `previewOnly`-gated code path `AppShell` never activates — the production render path uses canonical tokens only. No preview CSS or token was copied into a reachable production path. The `## NEEDS DECISION` above (retire vs. keep the production-bundled preview route) was left untouched, as instructed — still open.

### Validation (full detail in PR #100's description)

- Client build/typecheck: PASS. Client lint: PASS (pre-existing warnings only).
- Server build/typecheck: PASS.
- Server `migrate:up` and the full vitest suite were run against a disposable `pgvector/pgvector:pg16` Docker container created for this task (never against the shared dev database) — `migrate:up` passed cleanly, including the same-timestamp migration pair noted below. Test suite: 1003/1010 passed; 7 failures in `webhooks.test.ts`/`auth.test.ts`/`mediaMetadata.test.ts` were verified — by running the identical 3 files against a pristine `origin/main` checkout with the same container — to be pre-existing on `main` today and unrelated to this reconciliation.

### Known pre-existing issue, flagged not fixed

`1792108804000_lead-operations-search-and-indexes.sql` and `1792108804000_notification_system.sql` share an identical timestamp prefix (both from main; previously flagged above). Confirmed no cross-dependency and both idempotent; applied cleanly in filename-sort order against the fresh container in this task. Left unrenumbered — renumbering an already-named migration is a product/ops call, not this task's to make.

### Remaining blockers

1. The 7 pre-existing test failures above need a real fix from whoever owns that code (independent of this PR).
2. Rendered browser QA (light/dark × 390/768/1024/1440 against the live preview) was not performed — no running dev server in this pass.
3. The `## NEEDS DECISION` above remains open.
4. Product/ops call on the same-timestamp migration pair.
5. PRs #93/#94 remain open and unmerged; checked their changed files against this branch — no overlap with anything this reconciliation touched, so both stay cleanly rebasable onto this branch or onto foundation after it merges. Not reapplied here.

### Verification

- Read this log in full before appending; no prior entries were edited or removed.
- Branch/commit/PR references above are exact (`task/reconcile-current-main-into-foundation`, commit `95c330f`, PR #100).
- No merge into foundation or `main`, and no deployment, occurred.

## 2026-10-17 11:00 IST — Step 1: retire the production-bundled preview route (PR #101)

- Re-read the current repository guidance (`AGENTS.md`, `DESIGN.md`, and `client/src/components/ui/README.md`) and reviewed the current Inbox source before planning follow-up work.
- Confirmed `feat/preview-to-production-foundation` remains at `eaf50af2d38c04715a6b9b8016d9f87e1cc7f3bf`. PR #101 (`task/retire-production-preview-bundle` → foundation) is open and not merged: head `c1d86a85a6149e94fd67421c5efff5bfbf851c6a`. It removes the production-bundled `?preview=precision-operations` path and preview-only page/CSS while retaining production CSS and the standalone preview service. Build/lint/CI are not yet verified; no deployment was triggered.
- Current Inbox parity evidence indicates that selecting a conversation can call `api.markLeadRead`; blindly auto-selecting the first conversation on initial load could mark an unread lead read. Follow-up implementation must not auto-select on initial load. A safe parity correction is to clear selected conversation/thread/lead context when filtering/search/pagination/account scope makes the selection disappear from the current results, while preserving server pagination (`PAGE_SIZE=20`), 15-second polling, account scope, tags, handoff, permissions, and read/unread behavior.
- Delegated session findings: a read-only Inbox audit session reports the initial auto-selection mismatch is unsafe to port literally because preview uses sample/local data while production has real read semantics. The audit also reports a selected conversation can become stale after filters change; viewport resizing is unavailable through current BrowserMCP, so 390/768/1024 checks are not claimed. An independent broad QA session reported potential additional parity issues in AppShell, Analytics, Team, Journey Builder Setup, Leads, Content, and Integrations; these remain audit findings until independently re-verified on the current refs.
- Next: continue narrow, separately delegated parity tasks from a freshly checked foundation head, and append evidence to this log via GitHub read–concat–write using the latest file SHA. Keep PRs targeted and unmerged until verified. Do not touch `main`; never deploy production without Akash's explicit instruction.
