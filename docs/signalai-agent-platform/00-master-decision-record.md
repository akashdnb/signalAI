# 00 — Master Decision Record

## Status

Proposed architecture direction for the next stage of SignalAI.

## Core decision

SignalAI will be developed as a reusable capability platform. MCP and AG-UI are adapters over that platform, not independent business-logic systems.

## Why this direction

The planned product surface extends beyond the current automation/builder experience into:

- conversations and leads
- journeys and campaigns
- company/person research
- enrichment and technology detection
- prospect scoring
- outreach
- acquisition analytics
- multi-user workspaces
- multiple connected Instagram accounts
- future provider integrations

Building individual AI tools directly against UI endpoints would make these capabilities difficult to reuse and would create duplicated business logic.

## Workspace and account model

The workspace/team design is a foundational part of the platform:

```text
Workspace
  -> Members / roles
  -> Connected accounts
  -> Reusable journeys
  -> Conversations / leads / executions scoped to account
```

Journeys are workspace-level reusable assets and can be attached to one or more connected accounts. Runtime execution receives the selected account as context. Account credentials and account-specific data remain isolated.

This model should be compatible with future providers such as WhatsApp without making Instagram-specific assumptions part of the core capability contract.

## Existing product audit implications

The flagship product audit identified trust and operational clarity issues that should remain explicit acceptance criteria while the architecture evolves:

- metrics must use correct definitions and explain differences
- analytics and overview counts should reconcile or explain why they differ
- media failures need visible recovery states
- desktop tables must remain readable
- billing must expose real state rather than unfinished placeholders
- connected accounts should be human-readable and expose integration health
- UI vocabulary should match current product terminology

These are product-quality requirements, not merely visual polish.

## Architecture principles

1. Capability first.
2. One business implementation, many adapters.
3. Stable resource IDs and explicit tenant/account relationships.
4. Jobs for long-running work.
5. Connectors for external data/providers.
6. Strong authorization and tenant isolation.
7. Explicit approval for consequential actions.
8. Auditability and idempotency for writes.
9. Explainable research/scoring with evidence provenance.
10. UI changes reuse existing SignalAI components and follow anti-AI design guidance.

## Near-term vertical slices

### Slice A — Company

```text
Company resource
 -> capability
 -> MCP read tool
 -> AG-UI read workflow
```

### Slice B — Research

```text
Company
 -> connector
 -> research capability
 -> Job
 -> ResearchReport
 -> MCP + AG-UI
```

### Slice C — Automation

```text
Intent
 -> automation draft
 -> validation
 -> explicit user approval
 -> existing Save / Publish path
```

### Slice D — Prospecting

```text
Company discovery
 -> qualification
 -> enrichment
 -> decision maker
 -> signals
 -> scoring
 -> prospect list
 -> outreach draft
```

## Deployment decision

Initially keep these modules in the existing backend deployment. Extract services only after operational evidence shows a separate trust boundary, scaling profile, deployment cadence, or ownership model is needed.
