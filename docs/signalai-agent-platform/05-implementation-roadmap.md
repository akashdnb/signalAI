# 05 — Implementation Roadmap

## Guiding sequence

Build the reusable foundation before building a large number of AI tools. Each phase should leave the system usable and should avoid creating adapters that later need to be rewritten.

## Phase 1 — Capability foundation

### Build

- stable resource IDs and tenant ownership
- capability/application service boundaries
- authorization context
- domain validation boundaries
- connector interface
- Job abstraction
- audit/event model
- idempotency model for writes
- capability error model
- observability/request correlation

### Exit criteria

A capability can be invoked without knowing whether its caller is UI, AG-UI, MCP or a worker.

## Phase 2 — Read-only MCP

Expose a small, useful read-only surface:

- companies
- people
- leads
- conversations
- analytics
- automations

### Exit criteria

An external MCP client can inspect SignalAI data while tenant boundaries and scopes are enforced.

## Phase 3 — Native AG-UI copilot

Start with read/explain workflows:

- explain automation
- inspect leads
- summarize conversations
- answer analytics questions

Then add research capabilities as the shared capability layer matures.

### Exit criteria

The copilot can perform useful multi-step reads without duplicating business logic in the agent.

## Phase 4 — Research engine

Implement:

- company research
- person research
- technology detection
- social research
- signal detection
- explainable prospect scoring
- evidence/source provenance

### Exit criteria

A company can be transformed into a normalized research report and prospect score using multiple replaceable providers.

## Phase 5 — External connectors

Prioritize connectors based on the acquisition workflow:

1. Shopify ecosystem
2. Manychat ecosystem
3. Clutch / DesignRush / The Manifest
4. website inspection
5. Wappalyzer-like technology detection
6. Apollo / Hunter
7. LinkedIn / Instagram research

Connector availability must not leak provider-specific models into core resources.

## Phase 6 — Agent workflows

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

## Phase 7 — Approved action layer

Introduce:

- prospect list creation
- campaign creation
- automation drafts
- automation publishing
- personalized outreach drafts
- sending outreach
- campaign pause/resume
- message actions

Require permission checks, validation, idempotency and audit logging.

## Phase 8 — Extract services only when justified

Potential extractions:

- `signalai-mcp`
- research workers
- connector workers

Do not extract prematurely. Extraction should follow operational evidence rather than architectural preference.

## Cross-phase acceptance rules

Every phase must preserve:

- tenant isolation
- existing domain invariants
- explicit save/publish semantics
- auditability of consequential actions
- test coverage for new capabilities
- no duplicated business logic across adapters
- anti-AI UI guidelines and component reuse policy

## Priority rule

When choosing between a quick feature-specific AI implementation and a reusable capability, prefer the reusable capability when the same operation is likely to be needed by the copilot, MCP, automation engine, or future integrations.

## First implementation slice

The first coding slice should not attempt the entire platform. It should establish one vertical path end-to-end:

```text
Company resource
 -> company capability
 -> read-only MCP tool
 -> AG-UI/read copilot caller
 -> tenant/auth/audit/observability
```

Then add research as the second vertical slice:

```text
Company
 -> connector abstraction
 -> research capability
 -> Job
 -> normalized ResearchReport
 -> MCP + AG-UI
```

This validates the architecture before the team invests in broad tool coverage.
