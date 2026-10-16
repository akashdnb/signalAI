# Precision Operations Studio — Full Preview Guide

**Branch:** `feat/precision-operations-product-ui`  
**Separate preview deployment:** https://signalai-precision-operations-preview.onrender.com/?preview=precision-operations  
**Scope:** design exploration only; no live workspace is connected.

Every screen uses illustrative content. The preview does not read customer data, send Instagram messages, start OAuth, create invitations, write lead/automation records, consume AI tokens, or change production state. Buttons that represent a consequential live operation explain or simulate the outcome locally.

## Screen index

Use the direct URLs below to open a screen from a fresh page load.

| Screen | Preview |
|---|---|
| Overview | [Open overview](https://signalai-precision-operations-preview.onrender.com/?preview=precision-operations&screen=overview) |
| Automation list | [Open automations](https://signalai-precision-operations-preview.onrender.com/?preview=precision-operations&screen=automations) |
| Builder — Flow | [Open flow canvas](https://signalai-precision-operations-preview.onrender.com/?preview=precision-operations&screen=builder&builderTab=Flow) |
| Builder — Setup | [Open setup/readiness](https://signalai-precision-operations-preview.onrender.com/?preview=precision-operations&screen=builder&builderTab=Setup) |
| Builder — Results | [Open results](https://signalai-precision-operations-preview.onrender.com/?preview=precision-operations&screen=builder&builderTab=Results) |
| Builder — Leads | [Open journey leads](https://signalai-precision-operations-preview.onrender.com/?preview=precision-operations&screen=builder&builderTab=Leads) |
| Inbox | [Open inbox](https://signalai-precision-operations-preview.onrender.com/?preview=precision-operations&screen=inbox) |
| Leads list | [Open leads](https://signalai-precision-operations-preview.onrender.com/?preview=precision-operations&screen=leads) |
| Lead detail — Overview | [Open lead profile](https://signalai-precision-operations-preview.onrender.com/?preview=precision-operations&screen=lead-detail&leadTab=Overview) |
| Lead detail — Conversation | [Open lead conversation](https://signalai-precision-operations-preview.onrender.com/?preview=precision-operations&screen=lead-detail&leadTab=Conversation) |
| Lead detail — Activities | [Open activity history](https://signalai-precision-operations-preview.onrender.com/?preview=precision-operations&screen=lead-detail&leadTab=Activities) |
| Lead detail — Notes | [Open team notes](https://signalai-precision-operations-preview.onrender.com/?preview=precision-operations&screen=lead-detail&leadTab=Notes) |
| Knowledge Base | [Open knowledge](https://signalai-precision-operations-preview.onrender.com/?preview=precision-operations&screen=knowledge) |
| Content | [Open content](https://signalai-precision-operations-preview.onrender.com/?preview=precision-operations&screen=content) |
| Analytics — Activity | [Open activity analytics](https://signalai-precision-operations-preview.onrender.com/?preview=precision-operations&screen=analytics&analyticsTab=Activity) |
| Analytics — Conversion | [Open lead conversion](https://signalai-precision-operations-preview.onrender.com/?preview=precision-operations&screen=analytics&analyticsTab=Conversion) |
| Integrations | [Open integrations](https://signalai-precision-operations-preview.onrender.com/?preview=precision-operations&screen=integrations) |
| Team | [Open team](https://signalai-precision-operations-preview.onrender.com/?preview=precision-operations&screen=team) |
| Billing & usage | [Open billing](https://signalai-precision-operations-preview.onrender.com/?preview=precision-operations&screen=billing) |
| Settings — Fields | [Open fields](https://signalai-precision-operations-preview.onrender.com/?preview=precision-operations&screen=settings&settingsSection=Fields) |
| Settings — AI behavior | [Open AI behavior](https://signalai-precision-operations-preview.onrender.com/?preview=precision-operations&screen=settings&settingsSection=AI%20behavior) |
| Settings — Forbidden topics | [Open forbidden topics](https://signalai-precision-operations-preview.onrender.com/?preview=precision-operations&screen=settings&settingsSection=Forbidden%20topics) |
| Settings — Escalation | [Open escalation](https://signalai-precision-operations-preview.onrender.com/?preview=precision-operations&screen=settings&settingsSection=Escalation) |
| Settings — Scoring | [Open scoring](https://signalai-precision-operations-preview.onrender.com/?preview=precision-operations&screen=settings&settingsSection=Scoring) |
| Documentation | [Open documentation preview](https://signalai-precision-operations-preview.onrender.com/?preview=precision-operations&screen=docs) |
| Sign-in | [Open sign-in](https://signalai-precision-operations-preview.onrender.com/?preview=precision-operations&screen=login) |
| Instagram connection recovery | [Open connection states](https://signalai-precision-operations-preview.onrender.com/?preview=precision-operations&screen=connect-error&state=invalid_state) |
| Invitation recovery | [Open invitation states](https://signalai-precision-operations-preview.onrender.com/?preview=precision-operations&screen=invite&state=expired) |

For recovery screens, change the **Preview state** selector to inspect all available variants: missing parameters/token, expired or reused state/invitation, session mismatch, wrong email, revoked invitation, connection failure, and success.

## Coverage details

- **Overview:** four KPI roles; reporting-period selector; distinct inbound activity chart; reconciled 24-lead stage distribution; actionable work queue; recent conversations; metric definitions.
- **Automation list:** 11 illustrative rows; name/search, status, start-condition and sort controls; create-draft form; template selection; row actions with preview-only outcomes.
- **Builder:** Flow / Setup / Results / Leads tabs; trigger, AI reply, goal and message nodes; node settings; trigger Basic/Advanced/AI Settings; message text and presentation options (plain text, buttons, card, gallery, quick replies); destination settings; goal/captured-field, validation and success-message sections; local validation; visible unsaved state; save-and-leave decision; preview reply; sample walkthrough; publish, pause and activation confirmation states. Condition, Delay, and a dedicated Handoff node remain unavailable to add because the current product explicitly marks them as coming soon.
- **Inbox:** production-aligned All / Unread / AI Handling / Qualified / Needs Attention filters; username search; unread indicators; example conversation transcript; human takeover/return; lead stage, owner, messaging window, last-contact channel; local reply composer and empty-filter state.
- **Leads:** all seven production table concepts (Username, Stage, Handoff, Last contact, Via, Messaging window, First seen); search; stage/handoff filters; sort; sample pagination; links to a contextual profile.
- **Lead detail:** Overview / Conversation / Activities / Notes; stage and owner; handoff responsibility; captured facts, tags, intelligence explanation and deals.
- **Knowledge Base:** ready, needs-review, processing and failed sources; metadata/content preview; upload affordance; retrieval test state.
- **Content:** All media / Image / Carousel / Video filters; keyword search; designed thumbnail fallback art; metadata, sync status, post preview.
- **Analytics:** Activity volume and Lead conversion are separate; event counts are not presented as conversion rates; current-stage counts reconcile; reporting period, top posts and trigger keywords.
- **Integrations:** sample account identity, permission/webhook/token status, account assignment, technical detail disclosure, connection-check/disconnect warnings, unavailable provider states.
- **Team:** member and pending-invitation rows; invite form; role-permission matrix; preview-only resend/cancel/manage results.
- **Billing:** Trial state, token/DM usage, missing billing/reset/renewal information and quota-policy explanation.
- **Settings:** Fields, AI behavior, Forbidden topics, Escalation, and Scoring; business-facing copy, technical field keys, local-only edits.
- **Auth and recovery:** OTP entry, invalid/expired/rate-limited code examples, unavailable SSO messaging, OAuth state cases, invitation state cases, redacted technical details.

## Review checklist

- [ ] Review the screens at desktop width; note any hierarchy, density or terminology that does not match the intended product.
- [ ] Open Builder Setup, Results, and Leads from their direct links; check that Save, Preview, Sample walkthrough, Publish and lifecycle controls are distinct.
- [ ] Inspect the message editor's buttons, card/gallery, and quick-reply presentation settings.
- [ ] Search/filter Inbox, Leads, Automations, Knowledge, and Content; inspect empty states.
- [ ] Inspect lead handoff/owner mismatch and the messaging-window context.
- [ ] Review Activity vs Conversion analytics and the explanatory metric copy.
- [ ] Review light/dark theme using the global theme control.
- [ ] Review all recovery variants using their Preview state selectors.
- [ ] Check tablet/mobile widths in the browser before approving a direction for implementation.

## Important boundary

This is a high-fidelity, navigable design preview, not yet a 1:1 implementation of every API-backed production interaction. The internal app components have deliberately not been replaced. Preview-side save, sending, upload, invitation, integration, scoring, and publish actions are local simulations. The next phase must wait for design approval and a separate implementation plan; real API behavior and accessibility must be verified in real screens before production rollout.


## Regression QA — 13 October 2026

A hosted TinyFish browser run exercised the deployed preview with dummy values: [view the regression run](https://agent.tinyfish.ai/runs/2a71ea17-737a-4e76-a9db-ea6906f28ffb).

**Verified on desktop:** method → email → code sign-in states; code-entry validation; automation tabs and filters; 11 sample automations across two pages; select-all, bulk-action confirmation/cancel; row menu and rename; create-draft → Setup with trigger source and keyword preserved; unsaved Setup tab change prompt; Flow / Setup / Results / Leads navigation; sample message preview, walkthrough, and publish safeguards; inspector edit/discard flow; no production API calls or Instagram messages.

**Still to verify / known boundary:**
- The last pass did not directly resize the hosted browser to a mobile viewport. The preview now renders automation cards below 1024px, but that behavior still needs a visual mobile-width check.
- The Builder flow canvas has selectable sample nodes and an Add Message action; it does not yet reproduce production ReactFlow drag-and-connect behavior. Treat graph editing as a preview interaction, not a faithful simulation of every canvas gesture.
- The OTP, draft saves, rename/status changes, lead edits, publish and send actions are local demonstrations. No email, message, server record, token use, or production mutation occurs.
- The verification outcome controls are for inspecting invalid/expired/too-many/success states; only submitted, six-digit sample input shows a success state.

The latest change also adds an always-visible inline message on the code screen that explains that no email was sent. After that change is deployed, repeat the auth portion of the test before considering the sign-in preview reviewed.


### Builder inspector follow-up QA

A focused hosted run verified the node editor lifecycle and rich-message controls: [view the inspector regression run](https://agent.tinyfish.ai/runs/5facbe73-3179-4cc9-92d5-d202beb8ccf2).

- The inspector opens as a modal over the canvas.
- Editing a message and closing it opens the discard dialog above the inspector. **Keep editing** preserves the unsaved text; **Discard changes** closes and restores the original value.
- The Message / Instagram layout / AI Settings tabs and all five layout modes were found. Text + buttons reveals button label, action, and HTTPS URL fields; applying stages the change locally and shows the correct confirmation.
- The earlier run observed that adding nodes updated the canvas but the footer remained at 4. The counter was changed to explicit state and the latest hosted regression now confirms the count increments 4 → 5 → 6. See the [latest builder counter test](https://agent.tinyfish.ai/runs/7a55342d-b812-4a44-8bb9-f64d36116807).


### Builder count and per-node regression — latest live preview

Latest regression run: [Builder count / node configuration QA](https://agent.tinyfish.ai/runs/7a55342d-b812-4a44-8bb9-f64d36116807).

- Added one message node: visible nodes rose from 4 to 5; adding a palette AI reply raised them from 5 to 6. The current preview report confirms sequential numbering (01–06) and connector rendering.
- Per-node values were retained independently across two message nodes: “AI reply draft A” and “Follow-up draft B”.
- The Inspector open/close/discard guard remains verified by [the inspector flow run](https://agent.tinyfish.ai/runs/5facbe73-3179-4cc9-92d5-d202beb8ccf2).
- Save still shows that nothing is written to the server.
- **Drag-and-drop reorder is not fully browser-verified.** The nodes are draggable and reorder state is wired, but TinyFish could not execute a native HTML drag operation reliably. Do not treat this gesture as accepted until it is manually or otherwise reliably tested.
- **Mobile layout also remains not directly verified at a 390px viewport.** The responsive styles and mobile automation cards exist, but the browser run could not resize the viewport.

The preview remains an interactive design model, not a production-connected app. All sample data and operational actions are local.


### Recovery route compatibility

The broad desktop sweep used the intuitive query values `screen=connection-recovery` and `screen=invitation-recovery`. Those aliases originally fell through to Overview because the canonical screen values were `connect-error` and `invite`. Both route names are now accepted and map to the dedicated recovery screens. Verify both canonical and alias links after deployment.


Recovery alias check completed after deployment: [TinyFish route regression](https://agent.tinyfish.ai/runs/2e464dca-8872-4f97-88f6-2a2e5ce57366). Both `screen=connection-recovery` and `screen=invitation-recovery` now load the dedicated recovery UI; their state selectors, success variants, and canonical `connect-error` / `invite` links were confirmed. No connection or invitation was performed.


## Audit fixes (13 October 2026)

The preview is intentionally sample-only. Changes below were made on `feat/precision-operations-product-ui` and deployed to the separate Render preview service. Production routes, records, and messaging APIs are not used by this concept.

### Inbox selection and empty states
- Selection now stays inside the currently filtered conversation set. When the current contact no longer matches search/filter, the first matching conversation is selected; if none match, both the thread and lead context clear into an explicit empty state.
- The empty state offers `Clear filters`.
- The `Needs Attention` filter now stores escalation state per sample conversation rather than globally marking all conversations as needing attention.
- Demo replies remain local; copy explicitly says no Instagram message is sent.
- Non-functional Contacts and Broadcasts entries are hidden from primary navigation.

### Lead details and scoring
- Lead detail tabs now have clear tab/tabpanel relationships, selected-tab focusability, and arrow/Home/End keyboard navigation.
- The uncalculated Lead Intelligence card explains why a score may not exist, names prerequisites (applicable rules and enough supported conversation signals), and clarifies that the preview does not call scoring services.
- The sample plan CTA says `View plan & usage` rather than implying a purchase flow is available.
- The global meter uses the label `AI usage` and spells out that the displayed unit is tokens.

### Automation walkthrough
- The action is labelled `Run sample walkthrough`; the dialog guides users through a multi-step example and states that it does not execute a live Instagram test, send messages, or write lead records.
- Publish/lifecycle actions remain simulated and explicitly marked preview-only.

### Hosting and verification
- The Render service is linked to branch `feat/precision-operations-product-ui`, with auto-deploy still disabled. Preview changes are deployed manually after a build.
- Preview links use query-based routes, e.g. `/?preview=precision-operations&screen=inbox`, rather than nested React paths.
- The project build and `oxlint` completed successfully for the deployed commit. A browser test against a fresh isolated session returned `ERR_TUNNEL_CONNECTION_FAILED`, so live post-deploy interaction verification was inconclusive. The existing connected browser showed an older cached navigation; do a hard refresh before reviewing.
- The Preview service's route rewrite rule was not confirmed through the available service-management connector, so direct nested paths such as `/dashboard/:tenantId/inbox` may still return 404. Use the query-based preview links above until the Render Dashboard's Redirects/Rewrites rule `/* → /index.html` is verified.
