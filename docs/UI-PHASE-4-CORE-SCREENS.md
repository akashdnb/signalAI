# UI Phase 4 — Core Screens

Phase 4 extends the SignalAI UI foundation into the four core product surfaces: Inbox, Leads, Knowledge Base, and Analytics.

## Scope

### Inbox
- Preserve the existing three-column conversation workflow.
- Improve hierarchy around conversation list, thread, composer, and lead context.
- Preserve AI/human handoff, 24-hour messaging-window enforcement, polling, optimistic replies, tags, ownership and pipeline actions.
- Keep mobile behavior intact: conversation list and thread remain navigable without changing API contracts.

### Leads
- Preserve existing search, pipeline-stage filtering, handoff filtering and lead detail navigation.
- Improve table hierarchy, density, hover states, status readability and responsive horizontal scrolling.

### Knowledge Base
- Preserve tenant-scoped document upload, processing/ready/failed status, versioning and deletion.
- Improve explanatory hierarchy, upload affordance, document table readability and empty/loading/error states.

### Analytics
- Preserve existing funnel, revenue, top-post and trigger-keyword data sources.
- Improve KPI cards, table hierarchy and responsive presentation without changing analytics semantics.
- Funnel remains accessible through the existing table representation as well as the SVG visualization.

## Design rules

- Reuse Phase 1 tokens and Phase 2 shell; no competing theme system.
- Prefer one strong surface over nested card stacks.
- Use semantic status styling and accessible controls.
- Preserve existing API/data contracts and business behavior.
- Keep mobile layouts usable before adding visual density.

## Validation checklist

- Inbox list/search/tabs still load and poll.
- Selecting a conversation, handoff, reply, owner, stage and tags still work.
- Leads filters/search and lead profile links still work.
- Knowledge Base upload/delete/status flows still work.
- Analytics funnel/revenue/posts/keywords still render and retain accessible tabular data.
- Verify responsive layouts at desktop, tablet and mobile widths.
- Run CI/browser smoke checks before merging.
