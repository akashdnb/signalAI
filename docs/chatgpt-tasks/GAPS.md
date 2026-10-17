# SignalAI Preview → Production UI GAP Review

This file records QA findings comparing the live production app against the Precision Operations preview. Real production data vs sample preview data is intentionally ignored unless the data changes the UI structure/state.

## Coverage checklist — first audit pass (2026-10-17)

- [x] AppShell / sidebar / top bar / workspace + account chrome — light; dark state checked on Overview; desktop natural BrowserMCP viewport only
- [x] Dashboard / Overview — light + dark
- [x] Leads list — light
- [x] Lead detail — light
- [x] Automation list — light
- [x] Journey Builder Flow — light
- [x] Journey Builder Setup — light
- [ ] Journey Builder Results — not yet verified side-by-side
- [ ] Journey Builder Leads tab — not yet verified side-by-side
- [x] Inbox list + selected conversation — light
- [x] Analytics — light
- [x] Content — light
- [ ] Knowledge — not yet verified side-by-side
- [x] Integrations — light
- [x] Settings navigation / Team & access — light
- [ ] Settings Profile — not yet verified side-by-side
- [ ] Settings Notifications — not yet verified side-by-side
- [ ] Settings Appearance — not yet verified side-by-side
- [ ] Settings other sections — not yet verified side-by-side
- [ ] Login / auth screens — not yet verified
- [ ] Additional production navigation / billing — not yet verified
- [ ] 390 / 768 / 1024 viewport passes — BrowserMCP setup did not expose viewport resizing; not claimed

## 2026-10-17 13:43 — AppShell / navigation chrome
- theme/viewport checked: light and dark state; natural desktop BrowserMCP viewport only (no dedicated resize control available)
- STATUS: NEW
- Gap: Production renders the sidebar expanded by default, with the full SignalAI wordmark and ~215px-wide navigation, while the preview renders the sidebar collapsed by default to a ~46px icon rail. This changes the available content width and shifts every page's main content horizontally.
- Evidence: Production Overview snapshot shows "Collapse sidebar" and nav items spanning x=12..227; preview Overview shows "Expand sidebar" and nav buttons spanning x=17..63. Production workspace selector begins around x=260 while preview begins around x=106. See production `https://signalai-bui.onrender.com/dashboard/008a82d5-a627-470f-88df-183fb25c45c/` and preview `https://signalai-precision-operations-preview.onrender.com/?preview=precision-operations&screen=overview&theme=light`.

## 2026-10-17 13:43 — Dashboard / Overview
- theme/viewport checked: light + dark; natural desktop BrowserMCP viewport only
- STATUS: NEW
- Gap: The production Overview has the legacy expanded-sidebar geometry and correspondingly different content positioning/density. The preview Overview uses the collapsed rail, compact workspace/account chrome, and a more compressed vertical layout. The preview's KPI/conversation/action sections begin substantially higher than production because production reserves more vertical space for its older header treatment.
- Evidence: Preview Overview reports reporting-period control around y=174 and first action cards around y=851; production Overview reports reporting-period control around y=265 and first action card around y=970. Preview and production were both opened directly at their live URLs. Real metric values were ignored.

## 2026-10-17 13:43 — Leads list
- theme/viewport checked: light; natural desktop BrowserMCP viewport only
- STATUS: NEW
- Gap: Production exposes a substantially larger filter toolbar than the preview. Production includes Qualification, Activity from/to, Sort leads, and a broader search/filter arrangement; the preview intentionally shows Pipeline stage, Handoff status, Search, Account, with a compact toolbar. This is a structural/control-set mismatch, not a data mismatch.
- Evidence: Production Leads text includes `Qualification`, `Activity from`, `Activity to`, and `Sort leads`; preview Leads text contains only `Pipeline stage`, `Handoff status`, `Search leads by username`, and `Account`. Preview URL `...?preview=precision-operations&screen=leads&theme=light`; production URL `/dashboard/<workspace>/leads`.

## 2026-10-17 13:43 — Lead detail
- theme/viewport checked: light; natural desktop BrowserMCP viewport only
- STATUS: NEW
- Gap: Production lead detail uses the older wider content geometry and places the workspace selector and profile content much farther right, while the preview uses the collapsed rail and a denser two-column review layout. Production also presents the live lead controls/score/deal state in a different visual arrangement from the preview's sample-oriented sections.
- Evidence: Production lead detail snapshot shows workspace selector at x≈260, tabs beginning x≈278 and a top `Back to leads` at x≈1339; preview lead detail has collapsed-rail content beginning at x≈106, an in-content `Back to leads` at x≈106 and a separate top back control at x≈1355. Real lead values were ignored.

## 2026-10-17 13:43 — Automation list
- theme/viewport checked: light; natural desktop BrowserMCP viewport only
- STATUS: NEW
- Gap: The production automation list uses the expanded AppShell geometry and older table/list proportions; the preview uses the collapsed rail and a wider, more deliberate list layout with preview-specific status/filter presentation. The horizontal positions and vertical spacing of the header, tabs, template block, search/filter row, and list are therefore not equivalent.
- Evidence: Production automation page has My automations at x≈278 and Create draft at x≈1335; preview has My automations at x≈106 and Create draft at x≈1362. Preview also shows the compact search/filter row beginning around x≈142, while production starts around x≈278.

## 2026-10-17 13:43 — Journey Builder / Flow
- theme/viewport checked: light; natural desktop BrowserMCP viewport only
- STATUS: NEW
- Gap: Production Flow renders a runtime-oriented builder with real account assignment and a sparse flow canvas, while the preview Flow is a structured four-step sample flow with explicit numbered nodes, node summaries, `Add another message`, and the preview-only action palette. The node presentation and surrounding hierarchy are materially different.
- Evidence: Preview Builder Flow text explicitly renders `01 / TRIGGER Instagram trigger`, `02 / MESSAGE AI reply`, `03 / GOAL Qualification question`, `04 / MESSAGE Follow-up message`, plus `Add another message` and `4 steps · Sample flow only`. Production builder Flow snapshot instead exposes `Add node`, `Trigger`, `AI Reply`, `Send Message`, `New Goal`, and a canvas with `Condition SOON`, `Delay SOON`, and `Handoff SOON`, without the same four-node sample presentation.

## 2026-10-17 13:43 — Journey Builder / Setup
- theme/viewport checked: light; natural desktop BrowserMCP viewport only
- STATUS: NEW
- Gap: Production Setup is a much larger live configuration form and exposes numerous controls that are absent from the preview's intended setup composition. Production includes reply style, backup reply, reply variations, reply channel, CTA link, message preview, tone/language, business information, post targeting, and multiple live conversation goals with many captured fields. Preview Setup is a compact five-section readiness-oriented design with Basics, Start condition, Instagram account, AI behavior, Lead qualification, and a readiness checklist.
- Evidence: Production Setup snapshot contains `How should it reply?`, `Reply Channel`, `CTA Link`, `Instagram message preview`, `AI reply preferences`, `Which posts should it respond to?`, and three detailed `Conversation goals`. Preview Setup snapshot contains sections `01 BASICS` through `05 LEAD QUALIFICATION` followed by `READINESS CHECK`.

## 2026-10-17 13:43 — Inbox / conversation view
- theme/viewport checked: light; natural desktop BrowserMCP viewport only
- STATUS: NEW
- Gap: Production's selected conversation pane is a much denser runtime conversation surface with a long message/activity history, messaging-window warning, disabled/send-state behavior, and full lead-context controls. Preview's selected conversation is a compact sample conversation with only a few messages and a simpler lead-context block. The overall two-pane structure exists in both, but the pane hierarchy and density do not match the preview.
- Evidence: Production selected `ankitpathak2108` shows many dated DM/team-reply events, `Load older messages`, a closed messaging-window warning, `Send`, and `Open full profile →`. Preview selected `@sample_fitness` shows three sample messages, `Take over to reply (demo)`, and a compact lead-context block. Production URL `/inbox`; preview `...?preview=precision-operations&screen=inbox&theme=light`.

## 2026-10-17 13:43 — Analytics
- theme/viewport checked: light; natural desktop BrowserMCP viewport only
- STATUS: NEW
- Gap: Production Analytics remained on `Loading analytics…` with no rendered metrics or tabs, while the preview renders the full Analytics screen including Activity volume / Lead conversion tabs, date range, account filter, KPI metrics, inbound activity, metric definitions, top posts, and trigger keywords. This is a major missing/blocked production rendering gap.
- Evidence: Production Analytics snapshot text is `PERFORMANCE ... Loading analytics…` and contains no metric content. Preview Analytics renders `Activity volume`, `Lead conversion`, four KPIs, activity table, top performing posts, top trigger keywords, and `Show metric definitions and attribution ↓`.

## 2026-10-17 13:43 — Content
- theme/viewport checked: light; natural desktop BrowserMCP viewport only
- STATUS: NEW
- Gap: Production Content is a legacy compact post grid/list with only All/Image/Carousel filters and two visible real posts. Preview Content has All media/Image/Carousel/Video filters, a caption/keyword search field, account filter, explicit Refresh posts control, and three purpose-built sample cards with trigger terms and review-comment actions. The filter/search/action structure is materially different.
- Evidence: Production Content snapshot exposes `All`, `Image`, `Carousel` and two post cards, with no content search or Refresh posts control. Preview exposes `All media`, `Image`, `Carousel`, `Video`, `Search captions and keywords`, account filter, `Refresh posts ↻`, and three sample cards with `Trigger terms` and `Review comments →`.

## 2026-10-17 13:43 — Settings / Team & access
- theme/viewport checked: light; natural desktop BrowserMCP viewport only
- STATUS: NEW
- Gap: Production Team & access did not render the team content in this pass and remained on `Loading page…`; preview renders the complete workspace-members table and role-permission matrix. This is a clear production missing/loading state mismatch.
- Evidence: Production `/settings/team` snapshot text ends with `Loading page…`. Preview `...?preview=precision-operations&screen=settings&theme=light&settingsSection=Team+%26+access` renders `WORKSPACE MEMBERS`, three sample members, invite state/actions, and a role-permissions table.

## 2026-10-17 13:43 — Integrations
- theme/viewport checked: light; natural desktop BrowserMCP viewport only
- STATUS: NEW
- Gap: Production Integrations is a live connection-management surface with `Add Instagram account`, real health/credential details, and `Disconnect`; preview is a design-validation surface with illustrative account state, `Simulate add account`, `Simulate health check`, technical-detail disclosure, and explicit sample scopes/token status. The core card structure is related, but the action/metadata treatment is not visually equivalent.
- Evidence: Production `/integrations` renders `1 connected Instagram account`, `Healthy`, last checked/credential expiry and `Disconnect`. Preview `...?preview=precision-operations&screen=integrations&theme=light` renders `Preview account state`, `Simulate add account`, `Simulate health check`, `Permissions`, `Webhook`, `Token status`, `Assigned automations`, and `Show technical details ↓`.

## Viewport / theme verification note

BrowserMCP exposed the user's natural desktop Chrome viewport but did not expose a dedicated viewport-resize action. Therefore this first pass does **not** claim 390, 768, 1024, or exact 1440px verification. Light-theme rendered pages were audited directly; dark-theme state was checked on Overview in both preview and production, but pixel/color conclusions were not inferred from text-only snapshots. More screen-by-screen dark and responsive passes remain open.
