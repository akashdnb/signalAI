# 10 — Runtime Stack and Service Boundaries

## Decision

SignalAI uses a deliberately split runtime model:

> **TypeScript owns the product. Python owns AI and execution.**

This is a runtime/deployment boundary, not a business-domain microservice split.

## Service stack

| Component | Language | Framework/runtime | Primary responsibility |
|---|---|---|---|
| `signalai-server` | TypeScript | Existing SignalAI server stack | Product source of truth, auth, domain rules, persistence, capability layer, API |
| `signalai-worker` | Python 3.12 | ARQ + Redis; FastAPI for health/ops | Async jobs, retries, bulk work, research, enrichment, scheduled work |
| `signalai-connectors` | Python 3.12 | FastAPI + async HTTP | External provider integrations and normalized provider results |
| `signalai-mcp` | Python 3.12 | Official MCP Python SDK v2 + Streamable HTTP | External MCP protocol adapter over SignalAI capabilities |
| `signalai-agent` | Python 3.12 | FastAPI | Planning/orchestration, LLM execution and agent workflows |
| Web SDK | TypeScript | Framework-agnostic browser package | Website customer channel and client-side conversation transport |
| AG-UI | TypeScript | Initially inside `signalai-server` | Agent/UI interaction and streaming adapter |

## Why Python for execution, connectors, MCP and agents

These services are new runtime boundaries rather than extensions of the existing product server. Python gives them one common ecosystem for:

- AI and LLM integrations
- research and web processing
- enrichment/data processing
- async external API integrations
- agent orchestration
- MCP tooling
- experimentation and evaluation

Keeping these services in one Python ecosystem reduces runtime fragmentation across the AI/execution side while allowing the product core to evolve independently.

## Why the product server remains TypeScript

`signalai-server` is the existing product source of truth. It owns:

- tenant/workspace authorization
- domain invariants
- CRM resources
- conversations
- journeys/automations
- persistence
- capability/application services
- audit and idempotency policy

The new services must not reimplement these rules.

## Contract boundary

Cross-language communication uses explicit versioned contracts rather than shared internal classes.

```text
TypeScript product core
        |
        | JSON / OpenAPI / JSON Schema / Job Envelope
        v
Python execution platform
```

Important contracts include:

- `JobEnvelope`
- `JobResult`
- capability request/response schemas
- connector request/result schemas
- error contracts
- audit/event schemas

Stable IDs are carried in contracts (`tenantId`, `jobId`, `correlationId`, resource IDs). No service should infer tenant ownership from provider-specific data.

## Service boundary rules

### `signalai-server`

- owns business truth
- validates permissions
- enforces domain invariants
- persists product state
- creates jobs
- exposes capabilities
- remains the only authoritative owner of core resource state

### `signalai-worker`

- consumes explicit jobs
- is stateless between jobs except durable queue/idempotency state
- retries transient work
- reports job lifecycle/progress
- never directly mutates product persistence
- invokes capabilities/contracts rather than copying domain rules

### `signalai-connectors`

- owns provider-specific HTTP/OAuth/rate-limit/retry mechanics
- normalizes provider responses
- preserves evidence/provenance where applicable
- never exposes provider-specific models as core SignalAI resources
- does not decide SignalAI lead/customer/journey business rules

### `signalai-mcp`

- owns MCP transport and protocol concerns
- authenticates external MCP clients
- maps MCP tools to SignalAI capabilities
- never contains duplicate business logic
- propagates tenant, authorization and correlation context

### `signalai-agent`

- owns planning/reasoning/model execution
- produces capability calls/plans
- uses jobs for long-running workflows
- never accesses product databases directly
- never bypasses capability authorization or approved action policies

## Security

Every service-to-service request must carry enough context for the receiving boundary to enforce:

- tenant/workspace isolation
- service identity
- authorization scope
- correlation ID
- idempotency where the operation can mutate state

MCP uses OAuth 2.1 resource-server semantics for deployed Streamable HTTP. The official Python SDK's `TokenVerifier` boundary is used so SignalAI can replace the initial deployment verifier with OIDC/JWKS or RFC 7662 introspection without changing tool implementations.

## Deployment progression

```text
Stage 1
signalai-server + signalai-worker

Stage 2
signalai-server + worker + connectors

Stage 3
signalai-server + worker + connectors + MCP

Stage 4
signalai-server + worker + connectors + MCP + agent
```

Service extraction is justified by scaling, failure isolation, security/trust boundaries, deployment cadence, dependency/runtime differences, or independent ownership—not by domain naming alone.

## Production readiness gates

A service is not considered production-ready until it has:

- deterministic health/readiness behavior
- pinned major dependency boundaries
- non-root container execution
- CI lint/test gates
- structured configuration with validation
- bounded timeouts/concurrency
- explicit retry policy
- idempotency for retried operations where applicable
- correlation IDs
- tenant/auth context
- graceful startup/shutdown
- documented failure semantics
- no direct database ownership outside the core domain boundary
