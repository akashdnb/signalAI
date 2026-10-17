# 05 — Implementation Roadmap

## Guiding sequence

Build the reusable foundation before building a large number of AI tools. Each phase should leave the system usable and should avoid creating adapters that later need to be rewritten.

The deployment strategy is **modular core first, independent workloads second, specialized services only when justified**.

## Runtime strategy

The existing `signalai-server` remains on its current TypeScript stack and owns product truth. New AI/execution services use Python 3.12+.

| Component | Runtime | Primary role |
|---|---|---|
| `signalai-server` | Existing TypeScript stack | Product/API, domain, capabilities, persistence, auth |
| `signalai-worker` | Python + FastAPI + ARQ/Redis | Async execution, retries, bulk and scheduled jobs |
| `signalai-connectors` | Python + FastAPI | External providers, research and enrichment |
| `signalai-mcp` | Python + MCP SDK + FastAPI | MCP transport and capability exposure |
| `signalai-agent` | Python + FastAPI | LLM planning, reasoning and orchestration |
| Web SDK | TypeScript | Browser/customer channel |

Cross-language boundaries use versioned JSON/OpenAPI/JSON Schema contracts. Python services must not directly mutate the core database or duplicate domain invariants.

## Phase 1 — Capability foundation

### Build

- stable resource IDs and tenant ownership
- Person / Identity / Conversation / ConversationThread resource model
- channel abstraction
- capability/application service boundaries
- authorization context
- domain validation boundaries
- connector interface
- Job abstraction
- audit/event model
- idempotency model for writes
- capability error model
- observability/request correlation
- clear module boundaries inside `signalai-server`

### Exit criteria

A capability can be invoked without knowing whether its caller is UI, AG-UI, MCP, a customer channel adapter, or a worker.

The core domain remains a modular monolith rather than being prematurely split into domain microservices.

## Phase 2 — Async worker extraction

Build `signalai-worker` as the first independently deployable workload. The worker is Python-based and consumes explicit, versioned job contracts from `signalai-server` through the queue.

### Move to the worker

- long-running Jobs
- bulk processing
- scheduled execution
- retries and delayed work
- high-volume outreach execution
- heavy connector synchronization
- expensive analytics/materialization work

### Initial worker stack

- Python 3.12+
- FastAPI for health/readiness and operational endpoints
- ARQ + Redis for asynchronous job execution
- Pydantic for job contracts
- pytest/ruff for quality gates

### Rules

- worker uses the same capability/application contracts
- worker does not become a second business-logic implementation
- worker does not bypass authorization/validation/audit/idempotency requirements
- worker does not directly mutate product persistence
- job state remains observable from the core product
- idempotency keys are mandatory for retryable work
- correlation IDs travel from the originating request through queue execution

### Exit criteria

API responsiveness and background throughput can be scaled independently, while the core domain remains owned by `signalai-server`.

At least one real asynchronous SignalAI workload runs successfully through the worker with retry, idempotency, status/progress and recovery behavior verified.

## Phase 3 — Read-only MCP

Expose a small, useful read-only surface:

- companies
- people
- leads
- conversations
- analytics
- automations

MCP is initially a capability adapter. When deployed separately, `signalai-mcp` uses **Python + the MCP SDK + FastAPI** and calls the same capability contracts rather than implementing business logic again.

### Exit criteria

An external MCP client can inspect SignalAI data while tenant boundaries and scopes are enforced.

## Phase 4 — Native AG-UI copilot

Start with read/explain workflows:

- explain automation
- inspect leads
- summarize conversations
- answer analytics questions

Then add research capabilities as the shared capability layer matures.

AG-UI remains an interaction/streaming adapter in `signalai-server` initially.

### Exit criteria

The copilot can perform useful multi-step reads without duplicating business logic in the agent.

## Phase 5 — Web channel foundation and SDK

Build the website customer channel on top of the same conversation/capability layer.

### Build

- Web channel adapter
- anonymous visitor sessions
- Web SDK initialization and lifecycle
- Web chat transport/API
- conversation resume
- authenticated website identity handoff
- unified Person / Identity linking
- streaming responses
- lead capture events
- channel handoff/continuation tokens

### Exit criteria

A client can install the Web SDK and a website visitor can start a conversation using the same SignalAI conversation and AI capabilities used by Instagram/WhatsApp.

A visitor can safely authenticate and have the website conversation associated with the correct SignalAI Person/Lead.

## Phase 6 — Research engine

Implement:

- company research
- person research
- technology detection
- social research
- signal detection
- explainable prospect scoring
- evidence/source provenance

Use `signalai-worker` for long-running research jobs once worker extraction is available.

### Exit criteria

A company can be transformed into a normalized research report and prospect score using multiple replaceable providers.

## Phase 7 — External connectors

Prioritize connectors based on the acquisition workflow:

1. Shopify ecosystem
2. Manychat ecosystem
3. Clutch / DesignRush / The Manifest
4. website inspection
5. Wappalyzer-like technology detection
6. Apollo / Hunter
7. LinkedIn / Instagram research
8. Additional messaging/customer channels

The connector runtime is planned as **Python + FastAPI** because connector workloads are expected to overlap with research, extraction, enrichment and data-processing workloads.

Initially connectors can be modules or worker-side implementations. Extract `signalai-connectors` only when provider runtime dependencies, scaling, security, rate limiting, or deployment cadence justify a separate service.

Connector availability must not leak provider-specific models into core resources. Providers return normalized contracts to the capability layer.

## Phase 8 — Agent workflows

Create multi-step workflows such as:

```text
Find 100 US Shopify agencies
 -> qualify
 -> enrich
 -> identify decision makers
 -> research signals
 -> score
 -> save prospect list
```

Use Jobs for long-running work and expose progress through AG-UI and job status through APIs/MCP.

`signalai-agent` is planned as **Python + FastAPI** because model execution, planning loops, AI SDKs and evaluation workloads require an AI-oriented runtime.

Initially agent orchestration may live with the core application. Extract `signalai-agent` when model execution, planning loops, dependency footprint, scaling, or security requirements justify an independent runtime.

The agent must call SignalAI capabilities and must not become a second business-logic layer.

## Phase 9 — Approved action layer

Introduce:

- prospect list creation
- campaign creation
- automation drafts
- automation publishing
- personalized outreach drafts
- sending outreach
- campaign pause/resume
- message actions
- cross-channel conversation actions

Require permission checks, validation, idempotency and audit logging.

## Phase 10 — Specialized service extraction

Extract services only when operational evidence supports the boundary.

Potential extractions:

- `signalai-agent` — Python
- `signalai-mcp` — Python
- `signalai-connectors` — Python
- additional high-volume channel workers — Python where execution/AI/data workloads benefit from it

### Do not extract prematurely

Do not create separate services for ordinary product domains such as:

- lead-service
- conversation-service
- journey-service
- campaign-service
- company-service
- person-service

Keep these as modules inside `signalai-server` while they share transactions, domain invariants and authorization context.

### Extraction criteria

A module/service should be extracted only when one or more of these are demonstrated:

1. materially different scaling requirements
2. independent deployment cadence
3. strong security/trust boundary
4. failure isolation requirement
5. distinct runtime/dependency requirements
6. independent ownership/team boundary
7. meaningful infrastructure isolation benefit

### Exit criteria

The architecture has independently scalable workloads where needed without introducing duplicated business logic or fragmented ownership of core state.

## Cross-phase acceptance rules

Every phase must preserve:

- tenant isolation
- existing domain invariants
- explicit save/publish semantics
- auditability of consequential actions
- test coverage for new capabilities
- no duplicated business logic across adapters/services
- safe identity resolution and cross-channel access control
- anti-AI UI guidelines and component reuse policy

## First implementation slice

The first coding slice should not attempt the entire platform. It should establish one vertical path end-to-end:

```text
Company resource
 -> company capability
 -> read-only MCP tool
 -> AG-UI/read copilot caller
 -> tenant/auth/audit/observability
```

Then validate asynchronous execution:

```text
Company/research request
 -> capability
 -> Job
 -> signalai-worker (Python)
 -> progress/status
 -> normalized result
```

Then validate the customer-channel architecture with a second vertical slice:

```text
Person / Identity
 -> Conversation / Thread
 -> Web channel adapter
 -> Web SDK
 -> conversation capability
 -> same AI/automation layer
 -> authenticated identity linking
```

Then add research as the third vertical slice:

```text
Company
 -> connector abstraction
 -> research capability
 -> Job / signalai-worker
 -> normalized ResearchReport
 -> MCP + AG-UI
```

This validates the architecture before the team invests in broad tool coverage or additional service extraction.
