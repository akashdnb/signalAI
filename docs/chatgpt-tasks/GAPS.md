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
- [ ] Journey Builder Results — audited again below; remains OPEN
- [ ] Journey Builder Leads tab — audited again below; remains OPEN
- [x] Inbox list + selected conversation — light
- [x] Analytics — audited again below; remains OPEN
- [x] Content — audited again below; remains OPEN
- [ ] Knowledge — audited again below; remains OPEN
- [x] Integrations — light
- [x] Settings navigation / Team & access — audited again below; remains OPEN
- [ ] Settings Profile — audited again below; remains OPEN
- [ ] Settings Notifications — audited again below; remains OPEN
- [ ] Settings Appearance — audited again below; remains OPEN
- [ ] Settings other sections — not yet verified side-by-side
- [ ] Login / auth screens — not yet verified
- [ ] Additional production navigation / billing — not yet verified
- [ ] 390 / 768 / 1024 viewport passes — BrowserMCP setup did not expose viewport resizing; not claimed

## 2026-10-17 13:43 — AppShell / navigation chrome
- theme/viewport checked: light and dark state; natural desktop BrowserMCP viewport only (no dedicated resize control available)
- STATUS: NEW
- Gap: Production renders the sidebar expanded by default, with the full SignalAI wordmark and ~215px-wide navigation, while the preview renders the sidebar collapsed by default to a ~46px icon rail. This changes the available content width and shifts every page's main content horizontally.
- Evidence: Production Overview snapshot shows "Collapse sidebar" and nav items spanning x=12..227; preview Overview shows "Expand sidebar" and nav buttons spanning x=17..63. Production workspace selector begins around x=260 while preview begins around x=106. See production `https://signalai-bui.onrender.com/dashboard/008a82d5-a627-470f-88df-183fbf25c45c/` and preview `https://signalai-precision-operations-preview.onrender.com/?preview=precision-operations&screen=overview&theme=light`.

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

## 2026-10-17 14:02 — Re-verification: Analytics
- theme/viewport checked: production light + dark; preview light + dark; natural desktop BrowserMCP viewport only
- STATUS: STILL OPEN
- Gap: Production Analytics is no longer stuck on the loading state after the dark-theme toggle, but it still does not match the preview composition. Production uses the expanded sidebar and positions the analytics tabs around x≈278/y≈326, while preview uses the collapsed rail and positions the same tabs around x≈106/y≈204. Production's rendered content is also materially different: it has `Workspace-wide current data`, current pipeline KPI content, `DMs reserved`, and a shorter activity/content-signals presentation; preview has four KPI cards (`Comments received`, `Direct messages`, `Replies sent`, `Human handoffs`), a 7-day activity chart/table, metric definitions, sample post ranking, and trigger keywords.
- Evidence: Production light snapshot at `/dashboard/<workspace>/analytics` initially showed `Loading analytics…`; production dark-theme snapshot after clicking the theme control rendered `Activity volume`, `Lead conversion`, current-data KPI/content sections and links. Preview light and dark URLs `...?preview=precision-operations&screen=analytics&theme=light|dark` both rendered the complete preview analytics structure. Real metric values were ignored.

## 2026-10-17 14:02 — Re-verification: Settings / Team & access
- theme/viewport checked: production light + dark; preview dark (preview light was verified in the first pass); natural desktop BrowserMCP viewport only
- STATUS: STILL OPEN
- Gap: The previous production loading gap is resolved, but Team & access remains structurally different from the preview. Production now renders workspace-name/description controls, live pending invitations and invitation history, and a server-enforced role-permissions table; preview renders a compact three-member sample roster with one pending invite and a different role-permission matrix. The AppShell/sidebar geometry also remains expanded in production versus collapsed in preview.
- Evidence: Production light snapshot `/settings/team` now renders `WORKSPACE MEMBERS`, `Invite teammate`, two pending invitations, invitation history, and capability rows; production dark snapshot after theme toggle renders the same content. Preview dark `...?preview=precision-operations&screen=settings&theme=dark&settingsSection=Team+%26+access` renders `WORKSPACE MEMBERS`, three sample members, `Invite teammate`, and preview role permissions. No data-value mismatch was treated as a gap.

## 2026-10-17 14:02 — Settings / Profile
- theme/viewport checked: production light + dark; preview light + dark; natural desktop BrowserMCP viewport only
- STATUS: NEW
- Gap: Production Profile uses the expanded settings layout and a substantially different live form from the preview. Production's light state briefly showed `Loading profile…`; its dark state rendered editable `First name`, `Last name`, and optional `Profile image URL` fields plus `Save profile`. Preview renders a compact profile identity card with avatar/name/email/role, fields labeled `Display name`, `Email address`, `Workspace role`, a `Save profile` action, and an explicit `Account updates are not sent to a server.` note. Production also places the settings navigation around x≈278, while preview places it around x≈115.
- Evidence: Production `/settings/profile` snapshots were taken in light and dark. Preview `...?preview=precision-operations&screen=settings&theme=light|dark&settingsSection=Profile` both rendered the complete preview profile structure. Theme differences were observed through the rendered theme state; exact color-token comparison was not inferred from text snapshots.

## 2026-10-17 14:02 — Settings / Notifications
- theme/viewport checked: production light + dark; preview light + dark; natural desktop BrowserMCP viewport only
- STATUS: NEW
- Gap: Production Notifications is a detailed two-channel notification matrix with six operational events and separate `IN-APP` / `EMAIL` On/Off controls, an email recipient, and a workspace/account persistence explanation. Preview Notifications is a shorter preference list with four user-facing categories (`Automation failures`, `Human handoffs`, `New qualified leads`, `Weekly summary`) and a single save action, plus a preview-only note that no email or push notifications are sent. The information architecture and control density therefore differ materially.
- Evidence: Production `/settings/notifications` light and dark snapshots render six events including `New leads`, `Automation failures`, `Instagram connection needs attention`, `Instagram disconnected`, and `Important system alerts`, with IN-APP/EMAIL controls and `Save notification preferences`. Preview light and dark `...?preview=precision-operations&screen=settings&theme=light|dark&settingsSection=Notifications` render the four preference rows and the preview-only delivery note. Real recipient/account values were ignored.

## 2026-10-17 14:30 — Re-verification: Analytics
- theme/viewport checked: production light + dark; natural desktop BrowserMCP viewport only; preview light + dark were already directly verified in the preceding cycle
- STATUS: STILL OPEN
- Gap: The production light state is still visibly stuck on `Loading analytics…` when opened directly. Toggling the production theme to dark causes the analytics data shell to render, but the resulting structure remains materially different from the preview. Production uses `Activity volume` / `Lead conversion` tabs at x≈278, workspace-wide/current-pipeline KPI content, `Comments received` / `DMs reserved`, and content-signals sections; the preview uses its collapsed rail, four KPI cards including `Replies sent` and `Human handoffs`, 7-day activity presentation, metric definitions, sample post ranking, and trigger keywords.
- Evidence: Direct production light snapshot at `/dashboard/<workspace>/analytics` still showed `Loading analytics…`; after clicking the theme control, production dark rendered the analytics tabs and current-data sections. Preview light and dark were directly opened earlier and rendered the complete preview composition. No metric-value mismatch was counted.

## 2026-10-17 14:30 — Settings / Team & access
- theme/viewport checked: production light + dark; natural desktop BrowserMCP viewport only; preview light + dark were verified across the prior cycles
- STATUS: STILL OPEN
- Gap: The production Team & access page is no longer blocked by the earlier loading state, but its rendered information architecture remains different. Production shows workspace name/description editing, live pending invitations, invitation history, and a server-enforced role-permission table; preview shows a compact sample roster, one pending invite, and a different preview role-permission matrix. Production remains on the expanded sidebar while preview remains on the collapsed rail.
- Evidence: Production light `/settings/team` rendered workspace settings plus `WORKSPACE MEMBERS`, invitations, role permissions and invitation history; production dark after theme toggle rendered the same content. Preview light/dark settings Team & access screens were directly verified in the prior cycles. Real member/invitation values were ignored.

## 2026-10-17 14:30 — Settings / Appearance
- theme/viewport checked: production light + dark; preview light + dark; natural desktop BrowserMCP viewport only
- STATUS: NEW
- Gap: Both production and preview expose the same broad Appearance controls (theme mode and the same named accent palette choices), but the surrounding composition is materially different. Production uses the expanded AppShell and a settings navigation starting around x≈278; preview uses the collapsed rail and settings navigation starting around x≈115. Production describes the palette as applying across navigation/actions/selected items/charts, while preview presents the same choices inside a more compact `PERSONAL PREFERENCES` composition and adds the preview-specific bookmark/share note. Production also exposes live workspace/account chrome and usage context that is absent from the preview composition.
- Evidence: Production `/settings/appearance` was directly inspected in light and dark states; preview `...?preview=precision-operations&screen=settings&theme=light|dark&settingsSection=Appearance` was directly inspected in both themes. Production dark showed `Switch to light mode`; preview dark showed the corresponding `Switch to light mode`. No exact color-token claim was made from text snapshots.

## 2026-10-17 14:30 — Knowledge
- theme/viewport checked: production light + dark; preview light + dark; natural desktop BrowserMCP viewport only
- STATUS: NEW
- Gap: Production Knowledge is a live operational knowledge-base management screen, while the preview is a substantially different review-oriented composition. Production has a single live source row plus `Upload source`, `Preview`, `Delete`, a `Sample question` retrieval field and a table-style source document area. Preview presents five illustrative sources across Ready / Needs review / Processing / Failed states, `Add source`, a full-width source search, expanded source-detail/extracted-content treatment, and a separate `RETRIEVAL CHECK` section. The state hierarchy and overall layout therefore differ materially; this is not treated as a data-count mismatch.
- Evidence: Production `/knowledge` rendered `Knowledge base`, grounding explanation, `Sample question`, `Check retrieval`, one `Ready` source, upload/search/actions in both inspected theme states. Preview light and dark `...?preview=precision-operations&screen=knowledge&theme=light|dark` rendered the five sample source cards, source-detail panel, and retrieval-check composition. The preview itself labels its extracted content as representative sample excerpts, so those values were ignored.

## 2026-10-17 — Merged-PR re-audit (PRs #101, #104, #105, #108, #109)

- foundation head audited: `29b4256bddb08330c8dc90915cfae8857997dd91` (`feat/preview-to-production-foundation`), the current foundation head at audit time.
- merged source/history checked: #101 retired the bundled preview route; #104 targeted Knowledge/Settings parity; #105 targeted Analytics/Content parity; #108 targeted Journey Results/Leads parity; #109 targeted AppShell/Overview/Leads/Lead detail/Automation parity.
- verification rule: a gap is marked VERIFIED only when the current live production render demonstrates the preview's intended composition/state. Source parity or a merged PR is not sufficient.
- viewport: natural desktop BrowserMCP viewport only. BrowserMCP did not expose a viewport-resize action, so no 390 / 768 / 1024 / 1440 resized verification is claimed.

### Journey Builder / Results
- STATUS: OPEN
- Current production now renders the Results tab and real automation analytics rather than the pre-#108 legacy result surface. It still does not demonstrate rendered parity with the preview: production has matched-event/conversation/active-goal/qualified/won KPI content, source breakdown, milestone/drop-off rows and AI-behaviour summary; preview has four sample KPIs, a seven-day run-volume presentation and recent-run activity. The information hierarchy and density remain different.
- Live evidence: production `/dashboard/008a82d5-a627-470f-88df-183fbf25c45c/automation/journeys/22a9b6f5-1066-44ac-8106-e6d3d2c0c38b?builderTab=Results`; preview `...?preview=precision-operations&screen=builder&theme=light&builderTab=Results`.

### Journey Builder / Leads
- STATUS: OPEN
- Current production now renders the dedicated Leads tab with real automation-linked leads and the preview-aligned table concept, but the rendered structure is not equivalent. Production adds current-goal and stage summary counts and uses `Current goal / Stage / Handoff / Owner / Last activity / View`; preview uses `LEAD STAGE / HANDOFF / LAST ACTIVITY / OWNER / VIEW` with three illustrative rows. The common shell also remains expanded in production versus collapsed in preview.
- Live evidence: production `/dashboard/008a82d5-a627-470f-88df-183fbf25c45c/automation/journeys/22a9b6f5-1066-44ac-8106-e6d3d2c0c38b?builderTab=Leads`; preview `...?preview=precision-operations&screen=builder&theme=light&builderTab=Leads`.

### AppShell / navigation chrome
- STATUS: OPEN
- Current production still renders `Collapse sidebar` with the expanded ~215px navigation rail; the preview still renders `Expand sidebar` with the collapsed ~46px icon rail. This remains a global geometry mismatch and shifts the content origin on every affected screen. No source-only parity claim is promoted to VERIFIED.

### Overview
- STATUS: OPEN
- Current production direct light load still renders the page with the real shell but KPI/action/conversation regions are visibly `Loading…` at audit time. The preview renders the complete sample overview. Production also remains on the expanded rail and its reporting-period control is much lower on the page than preview. The current render therefore cannot demonstrate parity.
- Live evidence: production `/dashboard/008a82d5-a627-470f-88df-183fbf25c45c/`; preview `...?preview=precision-operations&screen=overview&theme=light`.

### Leads list
- STATUS: OPEN
- Current production renders the real leads table and preserves the richer production filters, but it remains structurally different from preview: production exposes Qualification, Activity from/to and Sort leads in addition to the preview's compact stage/handoff/search/account composition. Production also remains on the expanded shell. This is not verified as rendered parity.
- Live evidence: production `/dashboard/008a82d5-a627-470f-88df-183fbf25c45c/leads`; preview `...?preview=precision-operations&screen=leads&theme=light`.

### Lead detail
- STATUS: OPEN
- Current production direct lead-detail load remained at `Loading lead…` during this re-audit, so rendered parity cannot be demonstrated. The preview renders the complete review composition with lead identity, handoff/owner/stage controls, captured facts, intelligence, deals and recent activity. The production shell is also still expanded.
- Live evidence: production `/dashboard/008a82d5-a627-470f-88df-183fbf25c45c/leads/b1682cc8-24d8-41dc-9182-90875626ebf3`; preview `...?preview=precision-operations&screen=lead-detail&theme=light`.

### Automation list
- STATUS: OPEN
- Current production now has the preview-aligned information architecture (My automations, template block, Create draft, Search, status/start-condition/sort controls and tabular automation list), so PR #109 materially reduced the previous gap. It is not marked VERIFIED because the live production shell remains expanded while preview is collapsed and the rendered header/list geometry therefore still differs. The live production list also exposes real 12-automation data rather than the preview's illustrative 11-row presentation; data values are ignored, but geometry remains unverified.
- Live evidence: production `/dashboard/008a82d5-a627-470f-88df-183fbf25c45c/automation`; preview `...?preview=precision-operations&screen=automations&theme=light`.

### Analytics
- STATUS: OPEN
- Current production now renders real analytics content after the merged #105 changes, but it still does not match the preview composition. Production has two KPI metrics (`Comments received`, `DMs reserved`), workspace-wide current-data/current-pipeline sections, an all-time activity definition table and content signals; preview has four KPI cards including `Replies sent` and `Human handoffs`, a selected date range, account filter, seven-day activity presentation, metric definitions, sample post ranking and trigger keywords. The expanded production shell remains a geometry mismatch.
- Live evidence: production `/dashboard/008a82d5-a627-470f-88df-183fbf25c45c/analytics`; preview `...?preview=precision-operations&screen=analytics&theme=light`.

### Content
- STATUS: OPEN
- Current production still renders the older compact Content surface: `All / Image / Carousel`, two visible real posts, and no rendered caption/keyword search, Video filter, account filter or `Refresh posts` action. The preview renders all four media filters, search, account selection, refresh, trigger terms and review-comment actions. The merged #105 source changes therefore have not been demonstrated in the current production render, so the gap remains open.
- Live evidence: production `/dashboard/008a82d5-a627-470f-88df-183fbf25c45c/content`; preview `...?preview=precision-operations&screen=content&theme=light`.

### Knowledge
- STATUS: OPEN
- Current production still renders the older operational Knowledge composition with `How grounding works`, one live source row, `Upload source`, `Preview`, `Delete`, and the `Sample question` / `Check retrieval` panel. Preview renders the PR #104 target hierarchy: `Add source`, source search, multiple source-state cards, source details/extracted content and a separate `RETRIEVAL CHECK` section. Rendered parity is therefore not demonstrated despite #104 being merged into the foundation.
- Live evidence: production `/dashboard/008a82d5-a627-470f-88df-183fbf25c45c/knowledge`; preview `...?preview=precision-operations&screen=knowledge&theme=light`.

### Settings / Team & access
- STATUS: OPEN
- Current production renders real workspace settings, members, two live pending invitations, invitation history and server-enforced capability rows. Preview renders a compact sample roster, one pending invite and a different role-permission matrix. The production expanded shell also remains different. This is an intentional data/state boundary, not a data-count defect, but rendered parity is not demonstrated.
- Live evidence: production `/dashboard/008a82d5-a627-470f-88df-183fbf25c45c/settings/team`; preview `...?preview=precision-operations&screen=settings&theme=light&settingsSection=Team+%26+access`.

### Settings / Profile
- STATUS: OPEN
- Current production renders a real editable form with `First name`, `Last name`, `Profile image URL`, `Save profile` and identity-provider email copy. Preview renders a profile identity card plus `Display name`, `Email address`, `Workspace role`, `Save profile` and its preview-only persistence note. The information architecture and field presentation remain different, so no VERIFIED status is justified.
- Live evidence: production `/dashboard/008a82d5-a627-470f-88df-183fbf25c45c/settings/profile`; preview `...?preview=precision-operations&screen=settings&theme=light&settingsSection=Profile`.

### Settings / Notifications
- STATUS: OPEN
- Current production renders six operational events with separate IN-APP and EMAIL controls and a real email recipient; preview renders four user-facing preference rows and a single save action. The information architecture and control density remain materially different. Keep OPEN.
- Live evidence: production `/dashboard/008a82d5-a627-470f-88df-183fbf25c45c/settings/notifications`; preview `...?preview=precision-operations&screen=settings&theme=light&settingsSection=Notifications`.

### Settings / Appearance
- STATUS: OPEN
- Current production now renders the preview-like theme/palette choice-card hierarchy from #104, including the same named palette choices, but it still differs in composition and semantics: production includes a genuine `System` theme option and workspace copy, while preview is a more compact `PERSONAL PREFERENCES` surface with the preview-specific bookmark/share note. The expanded production shell remains different. This is close but not demonstrated as rendered parity, so it remains OPEN.
- Live evidence: production `/dashboard/008a82d5-a627-470f-88df-183fbf25c45c/settings/appearance`; preview `...?preview=precision-operations&screen=settings&theme=light&settingsSection=Appearance`.

### Re-audit conclusion
- No affected gap was promoted to VERIFIED in this cycle. The merged source changes in #101, #104, #105, #108 and #109 are reflected in the current foundation history, but several live production routes still render pre-parity composition/state, while the routes that improved still retain measurable shell or information-architecture differences from the live preview.
- No responsive-width claim was made beyond the natural BrowserMCP viewport. No production code, deployment, `ORCHESTRATOR-LOG.md`, or `main` was modified by this re-audit.

## 2026-10-17 14:50 — Re-verification and new Settings / General audit
- theme/viewport checked: production Analytics, Team & access, Appearance, Knowledge, and General; preview Appearance, Knowledge, and General; light + dark for the newly audited General/Appearance/Knowledge surfaces; natural desktop BrowserMCP viewport only
- STATUS: STILL OPEN for Analytics, Team & access, Appearance, Knowledge; NEW / OPEN for Settings / General
- Re-verification: Analytics direct light still showed `Loading analytics…`; toggling production theme to dark rendered the analytics data shell, but the structure remained materially different from preview. Team & access direct light showed a transient `Loading team…`; after theme toggle the production member/invitation surface rendered, but remained structurally different from preview. No prior gap is marked FIXED.
- Appearance: production and preview were inspected in both light and dark. Both expose the same broad theme mode and named accent-palette choices, but production retains the expanded settings shell/live workspace framing while preview uses the collapsed rail and compact `PERSONAL PREFERENCES` composition with its preview-only bookmark/share note. STATUS remains OPEN.
- Knowledge: production and preview were inspected in both light and dark. Production remains the live single-source operational management/retrieval surface; preview remains the multi-state source-review/retrieval composition. STATUS remains OPEN.
- New Settings / General gap: production `/settings/general` and preview `...?preview=precision-operations&screen=settings&theme=light|dark&settingsSection=General` both expose overlapping workspace/general-setting categories, but production presents `Workspace name`, `Time zone`, `Default lead owner`, and `Save general settings`, with copy that it cannot yet save because there is no update API. Preview additionally presents `Unassigned queue` and `Workspace owner`, uses the collapsed preview shell, and explicitly labels its values as illustrative/not written. The field set, shell geometry, and persistence semantics are therefore not rendered-equivalent. STATUS: NEW / OPEN.
- Tabs created for this pass were closed where BrowserMCP allowed; one preview Appearance tab close was blocked by the browser control, so successful closure of every created tab is not claimed. No production code, PR, deployment, `main`, or `ORCHESTRATOR-LOG.md` was touched.
