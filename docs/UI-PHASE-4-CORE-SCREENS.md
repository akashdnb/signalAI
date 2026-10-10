# UI Phase 4 — Core Screens

Phase 4 extends the SignalAI UI foundation into Inbox, Leads, Knowledge Base, and Analytics.

## Scope
- Inbox: preserve the three-column workflow, handoff, 24-hour messaging rules, polling, optimistic replies, tags, ownership, pipeline actions, and mobile navigation while improving visual hierarchy.
- Leads: preserve search, stage/handoff filters and lead navigation while improving table density, statuses, hover states and responsive scrolling.
- Knowledge Base: preserve tenant document upload, processing/ready/failed status, versioning and deletion while improving upload and document-list presentation.
- Analytics: preserve funnel, revenue, top-post and trigger-keyword data while improving KPI, chart and table presentation. The existing accessible table representation remains available.

## Design rules
- Reuse Phase 1 tokens and Phase 2 shell.
- Avoid competing theme systems and unnecessary nested cards.
- Preserve API/data contracts and business behavior.
- Keep mobile layouts usable.

## Validation
- Inbox search/tabs/polling and conversation actions.
- Leads filters/search/profile links.
- Knowledge upload/delete/status flows.
- Analytics funnel/revenue/posts/keywords and accessible table data.
- Desktop/tablet/mobile responsive review.
- CI and browser smoke checks before merge.
