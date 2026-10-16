# Analytics Actionability Audit

## Scope and evidence

The existing analytics implementation remains the source of truth. This work adds operational paths without redefining total leads, stage counts, unmapped lead count, funnel semantics, or Top Posts aggregation.

| Signal | What current data proves | Operational destination/action | Limits communicated |
|---|---|---|---|
| Current pipeline progression | Current leads grouped cumulatively at or beyond each stage | View Leads | Cumulative stages are not linked to exact-stage filters, which would return a different population |
| Unmapped lead count | Leads outside the recognized stage vocabulary | Review Leads | Unrecognized records remain in the count; no intended stage is inferred |
| Top post comment events | Events with a recorded media ID and lead ID | View Leads filtered by exact post media ID and `comment` event | An event association is not proof the post caused a lead or conversion |
| Campaign milestone drop-off | Existing campaign's milestone advancement counts | Review that campaign in the existing automation editor | Campaign ID comes from the current resource, not an inferred relationship |
| Campaign attention findings | Actual lead records in the existing active-goal lookup | Open the specific lead detail or review the Leads list | Sample is limited by the existing 100-lead fetch, and at most five records are shown per finding; aggregate buttons use the existing Leads destination rather than pretending to identify a single conversation |
| Instagram account health | Explicit status from the existing connected-account flow | Existing Integrations page provides the reconnect action when an account reports an error | This analytics surface does not infer health or add a duplicate remediation flow; healthy accounts have no unnecessary action |
| Activity totals and trigger keywords | Aggregate event counts | Explanation only | Do not identify one unique conversation or imply unsupported attribution |

## Authorization and pagination

Top Posts' lead drill-down uses the established tenant-protected paginated Leads endpoint. The `sourceMediaId` query parameter only filters records; server queries still constrain results to the authorized tenant and require an exact `comment` event association. The same predicate applies to total count and page query. The UI keeps the source filter synchronized with the URL so direct links, browser navigation, and clearing the filter all update the authoritative request state.

## Component reuse

Changes reuse existing Analytics, Leads, and campaign Analytics surfaces, route structure, Links, and button styling. No new reusable component was needed. `DESIGN.md` and `client/src/components/ui/README.md` were inspected before UI work. The repository's internal component registry and any configured shadcn/community registry were searched; no suitable separate registry entry or configured community-registry workflow was found for this functionality.

## Verification checklist

- [ ] Backend: exact media association, duplicate events produce one lead, non-comment events excluded, empty result, pagination total consistency, tenant isolation and authorization.
- [ ] Frontend: Top Posts action opens the correct media-filtered Leads route; URL filter state stays synchronized; clearing the filter removes it from the URL and reloads the unfiltered list; campaign actions resolve to existing resources.
- [ ] Regression: existing funnel, stage count, unmapped lead and Top Posts aggregate tests remain unchanged.
- [ ] CI: backend/frontend test, typecheck, lint, build, and integration workflows must be green before merge.
