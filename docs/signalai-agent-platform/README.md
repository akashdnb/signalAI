# SignalAI Agent Platform

## Purpose

This folder is the planning source of truth for the next architectural direction of SignalAI: a capability platform that can be consumed by the existing UI, an AG-UI copilot, internal automation, and external AI clients through MCP.

The guiding principle is:

> Do not architect an MCP server. Architect the SignalAI capability platform and make MCP the first external adapter.

## Source material incorporated

- Existing SignalAI architecture and the AG-UI evaluation/adoption work.
- The prospecting/acquisition recommendation covering company discovery, research, enrichment, decision-maker identification, outreach, funnel tracking, and agency-led acquisition.
- Current SignalAI product direction around journeys/automations, conversations, leads, analytics, and builder workflows.

## Target architecture

```text
SignalAI UI (Builder / Inbox / CRM)
          |
       AG-UI
          |
     Agent / Copilot
          |
   Capability Layer <---------------- MCP Server
          |                              |
          |                         External AI clients
          |
   Domain Services
      |       |
   Connectors  Jobs / Workers
      |          |
      +----------+
          |
      DB / APIs

Capabilities span:
Company, Person, Lead, Conversation, Journey, Campaign,
Research, Enrichment, Outreach, Analytics, Integrations
```

## Architectural rules

1. Business logic lives in domain/application services, never in MCP tool handlers.
2. MCP, AG-UI, REST, workers, and UI actions reuse the same capability implementations.
3. Every capability is tenant-aware and permission-aware.
4. Long-running work uses a Job abstraction rather than holding a request open.
5. Mutating operations are auditable, idempotent where possible, and approval-aware.
6. External providers are isolated behind connector interfaces.
7. Stable resource IDs and relationships are introduced before building broad agent workflows.
8. New UI work must follow SignalAI's component-reuse and anti-AI design rules.
9. Never push or merge directly to `main`; work lands through feature branches and squash merges.

## Planned document set

| Document | Purpose |
|---|---|
| `01-capability-platform-architecture.md` | Core architecture and domain/capability boundaries |
| `02-mcp-architecture.md` | MCP server, tools, resources, auth, safety and extraction strategy |
| `03-ag-ui-adoption-plan.md` | Native copilot and AG-UI integration strategy |
| `04-prospecting-acquisition-system.md` | Prospecting/research/enrichment/outreach capability model |
| `05-implementation-roadmap.md` | Phased implementation sequence and acceptance criteria |
| `06-jobs-connectors-and-security.md` | Jobs, connector abstraction, tenant security, audit and idempotency |

## Definition of done for the architecture phase

SignalAI should be able to add a new AI-facing capability once and expose it through the appropriate adapters without duplicating business logic. A new research provider should be replaceable without rewriting the agent. A long-running workflow should be resumable and observable. An action should be traceable from user request through capability execution to the resulting domain event.
