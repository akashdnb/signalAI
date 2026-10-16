# 00 — Master Decision Record

## Status

Proposed architecture direction for the next stage of SignalAI.

## Core decision

SignalAI will be developed as a reusable capability platform. MCP and AG-UI are adapters over that platform, not independent business-logic systems.

The backend will use a **modular-core + independently scalable workloads** model rather than immediately splitting every domain into microservices.

The default starting point is:

```text
signalai-server
  - core product/API
  - capabilities
  - domain rules
  - persistence
  - auth/authorization
  - synchronous request handling

signalai-worker
  - asynchronous jobs
  - bulk processing
  - scheduled work
  - retries
  - long-running execution
```

Additional services are introduced only when their operational characteristics justify a separate deployment:

```text
signalai-server
signalai-worker
signalai-agent        # Python agent runtime/orchestration
signalai-mcp          # Python MCP adapter
signalai-connectors   # Python external-provider runtime
```

The Web SDK is a client package, not a backend service. AG-UI is initially an endpoint/adapter in `signalai-server` and should not become a separate service prematurely.

## Language and runtime decision

The existing `signalai-server` remains on its current TypeScript stack because it is the product source of truth and already owns the core domain/API.

New execution and AI-oriented services will use **Python 3.12+**:

| Service | Language | Framework/runtime | Responsibility |
|---|---|---|---|
| `signalai-server` | TypeScript | Existing SignalAI backend stack | Core product, capabilities, domain rules, persistence, auth |
| `signalai-worker` | Python | Python async runtime + FastAPI control/health API + ARQ/Redis job execution | Async jobs, retries, bulk work, scheduled work, long-running execution |
| `signalai-connectors` | Python | FastAPI | External providers, research, enrichment and normalized connector APIs |
| `signalai-mcp` | Python | MCP SDK + FastAPI transport/runtime | External capability adapter and MCP tool exposure |
| `signalai-agent` | Python | FastAPI | LLM planning, tool orchestration, reasoning and agent workflows |
| Web SDK | TypeScript | Browser/package runtime | Customer-facing web channel client |

The guiding boundary is:

> **TypeScript owns the product. Python owns AI and execution.**

Python services must not become a second source of business truth. They consume explicit capability, job and event contracts exposed by the server. They must not directly mutate the product database or duplicate domain invariants.

Contracts between TypeScript and Python services should be language-neutral and versioned, using JSON/OpenAPI/JSON Schema and explicit event/job envelopes.

### Why Python for the new services

The new services are expected to perform research, enrichment, web/data processing, AI-assisted classification, provider integration and agent execution. Keeping these workloads in Python provides one execution/AI ecosystem and gives the platform direct access to the Python ecosystem for LLMs, research, extraction and data processing.

The cost is a second language ecosystem. That cost is accepted deliberately because the service boundaries are already network/process boundaries; shared business code is not the goal. Shared **contracts** are the goal.

## Service-boundary decision

Do **not** create separate services for individual business domains such as:

- `lead-service`
- `conversation-service`
- `journey-service`
- `campaign-service`
- `company-service`

These domains should remain modular boundaries inside `signalai-server` while they share transactions, invariants, authorization context, and the same capability layer.

Extract a service when there is concrete evidence of one or more of the following:

1. materially different scaling requirements
2. independent deployment cadence
3. a strong security/trust boundary
4. failure isolation requirements
5. a distinct runtime requirement
6. independent ownership/team boundary
7. significant infrastructure or dependency isolation needs

Extraction should preserve the capability contract. A service boundary must not become a reason to duplicate domain logic.

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
3. One modular core before many domain microservices.
4. Stable resource IDs and explicit tenant/account relationships.
5. Jobs for long-running work.
6. Workers for independently scalable asynchronous workloads.
7. Connectors for external data/providers.
8. Strong authorization and tenant isolation.
9. Explicit approval for consequential actions.
10. Auditability and idempotency for writes.
11. Explainable research/scoring with evidence provenance.
12. UI changes reuse existing SignalAI components and follow anti-AI design guidance.
13. Extract services based on operational evidence, not architectural fashion.
14. TypeScript owns product truth; Python owns AI/execution workloads.
15. Cross-language integration uses versioned contracts, not shared internal code.

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

Initially keep the capability/domain modules in `signalai-server`, with asynchronous execution moved into `signalai-worker` when workload characteristics justify it.

Potential later services are:

| Service | Initial boundary | Extract when |
|---|---|---|
| `signalai-server` | Core product, API, capabilities, domain, persistence | Remains the source of truth |
| `signalai-worker` | Async jobs, bulk processing, scheduled/retry work | First extraction when background load affects API capacity or needs independent scaling |
| `signalai-agent` | LLM planning/orchestration and agent runtime | Agent workloads require independent scaling, runtime dependencies, or stronger isolation |
| `signalai-mcp` | External MCP transport/auth/versioning boundary | External MCP usage becomes substantial or requires independent security/release lifecycle |
| `signalai-connectors` | External provider integration runtime | Connector workload/dependencies/security need independent deployment |

The extraction path should be:

```text
Modular monolith
      |
      v
server + worker
      |
      +----> agent (when justified)
      +----> MCP (when justified)
      +----> connectors (when justified)
```

Do not extract all services at once.
