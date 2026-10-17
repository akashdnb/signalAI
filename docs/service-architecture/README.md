# SignalAI Service Architecture

This directory documents the long-term service boundaries for SignalAI.

## Target platform

SignalAI is intentionally designed as a **modular core plus independently scalable execution and integration services**. We do not split every domain into a microservice.

```text
                         SignalAI Platform
                                |
              +-----------------+-----------------+
              |                                   |
       signalai-server                    External runtimes
       TypeScript/core              +---------+---------+---------+
              |                     |         |         |         |
              |                  worker    agent      mcp   connectors
              |                  Python    Python    Python    Python
              |                     |         |         |         |
              +---------------------+---------+---------+---------+
                                contracts
```

## Repositories

| Repository | Responsibility | Runtime |
|---|---|---|
| `signalAI` | Core product, source of truth, domain/capabilities | Existing TypeScript stack |
| `signalai-worker` | Async/background execution | Python |
| `signalai-connectors` | External provider integrations | Python |
| `signalai-mcp` | MCP capability boundary for AI clients | Python |
| `signalai-agent` | Agent orchestration/reasoning | Python |
| Web SDK | Browser client library | TypeScript |

## Non-negotiable architecture rules

1. `signalai-server` owns business truth and transactional state.
2. Other services must not invent competing business rules.
3. Services communicate through explicit API, job, event, and schema contracts.
4. Workers must be idempotent and safe to retry.
5. MCP is an adapter over capabilities, never a database API.
6. Agent code must not directly access production databases.
7. Connector code owns provider-specific protocol handling, not SignalAI domain decisions.
8. Side effects use draft -> validate -> approve -> execute where appropriate.
9. Workspace/tenant authorization is enforced server-side on every resource operation.
10. New domain microservices are not created merely because a domain has a class/module.

## Core dependency direction

```text
UI / Web SDK / MCP / Agent / Worker
                |
                v
        SignalAI capability contracts
                |
                v
       signalai-server application
                |
                v
       domain rules + persistence
```

The capability layer is the reusable business interface. REST, AG-UI, MCP, workers, and future integrations consume capabilities rather than duplicating domain logic.

## Service extraction rule

Extract a service only when it has an independent scaling profile, failure domain, security boundary, deployment lifecycle, runtime requirement, or external integration surface. Keep normal CRM, workspace, conversation, journey, lead, and analytics domains modular inside `signalai-server` unless this rule is met.

## Delivery sequence

1. Stabilize the existing core and workspace/account model.
2. Establish capability contracts.
3. Introduce `signalai-worker` for asynchronous execution.
4. Extract provider integrations into `signalai-connectors` where useful.
5. Introduce read-only MCP over stable capabilities.
6. Introduce the agent runtime.
7. Add controlled write/execute capabilities with approval and audit.
8. Scale services independently only when operational evidence requires it.

See `ARCHITECTURE.md` for the detailed server boundary and cross-service contracts.