# 01 — Capability Platform Architecture

## Objective

Evolve SignalAI from a product whose AI features are tied to individual UI surfaces into a reusable capability platform. The same capability must be callable from the Builder, Inbox/CRM, AG-UI copilot, scheduled jobs, internal APIs, and MCP clients.

## Capability-first model

Do not model the architecture around today's MCP tools. Model it around business capabilities.

### Core resource model

- Company
- Person
- Lead
- Contact
- Conversation
- Customer
- Agency
- Client
- Campaign
- Journey
- Message
- ResearchReport
- Signal
- Task
- Job

Relationships should support flows such as:

```text
Agency -> Company -> Website / Instagram / LinkedIn / Technologies
Company -> People
Company -> Clients
Company -> Research -> Signals -> Prospect
Prospect -> Outreach -> Conversation -> Lead -> Customer
Customer -> Campaigns / Journeys / Analytics
```

Every durable resource should have a stable ID, tenant/org ownership, timestamps, and an explicit lifecycle/status where relevant.

## Capability categories

### Resources

Read and query first-class SignalAI resources.

Examples:
- `search_companies`
- `get_company`
- `search_people`
- `get_person`
- `search_leads`
- `get_lead`
- `get_conversation`
- `get_journey`

### Intelligence

Turn raw resources and connector data into useful normalized information.

Examples:
- `research_company`
- `research_person`
- `find_buying_signals`
- `score_prospect`
- `analyze_social_presence`
- `analyze_technology_stack`

### Actions

Create or mutate SignalAI state.

Examples:
- `create_prospect_list`
- `create_lead`
- `create_campaign`
- `create_automation_draft`
- `publish_automation`
- `send_outreach`
- `pause_campaign`
- `send_message`

Actions need stronger authorization, validation, idempotency and audit requirements than reads.

## Layer boundaries

```text
Adapters
  - Web/UI
  - AG-UI
  - MCP
  - Internal API
       |
       v
Capability/Application layer
  - authorization
  - validation
  - orchestration
  - domain use cases
       |
       v
Domain services
  - journey rules
  - lead/conversation rules
  - campaign rules
  - research/scoring rules
       |
       +----> Connector layer
       |       - Shopify
       |       - Clutch
       |       - DesignRush
       |       - Manychat ecosystem
       |       - Apollo / Hunter
       |       - Wappalyzer
       |       - websites / social sources
       |
       +----> Jobs / workers
       |
       +----> Persistence / events
```

Adapters must be thin. They translate transport-specific requests into capability calls and map capability results back into the transport format.

## Deployment architecture

SignalAI should start as a **modular monolith with independently scalable execution workloads**, not as a collection of domain microservices.

### `signalai-server` — core product service

Owns:

- HTTP/API endpoints
- authentication and authorization
- capability/application layer
- domain rules and invariants
- synchronous request/response workflows
- persistence and transactions
- resource ownership and tenant isolation
- audit/event writes
- AG-UI endpoint initially
- MCP adapter initially, if operationally convenient

`signalai-server` remains the source of truth for business state.

### `signalai-worker` — asynchronous execution service

Extract background work from the API process when it becomes operationally significant.

Owns workloads such as:

- long-running Jobs
- bulk enrichment/research
- scheduled jobs
- retries and delayed execution
- high-volume outreach processing
- connector polling/synchronization
- heavy analytics/materialization jobs

Workers call the same capability/application contracts. They must not bypass capabilities and directly mutate core domain state without the required authorization, validation, audit and idempotency behavior.

### `signalai-agent` — agent runtime (later)

A separate service is justified when LLM planning/orchestration develops a materially different runtime profile from the core API.

Owns:

- agent orchestration
- model/provider routing
- planning loops
- tool selection
- context assembly
- agent-specific policies
- long-running agent execution coordination

It must call SignalAI capabilities rather than implement duplicate domain logic.

### `signalai-mcp` — external MCP boundary (later)

Initially MCP can remain an adapter inside `signalai-server`.

Extract it when external MCP usage creates a meaningful independent boundary for:

- external authentication/scopes
- protocol/version lifecycle
- rate limiting
- public exposure/security isolation
- independent deployment cadence

`signalai-mcp` should translate MCP requests into capability calls and should not become the owner of business logic.

### `signalai-connectors` — integration runtime (later)

Initially connectors may live as modules inside the server/worker architecture.

Extract them when external providers introduce materially different:

- scaling requirements
- network/runtime dependencies
- credential/security requirements
- rate-limit/retry behavior
- deployment cadence

The connector boundary must expose normalized SignalAI contracts rather than provider-specific models to the core domain.

### Web SDK

The Web SDK is a client package, not a backend service. It uses the Web channel adapter and shared conversation/capability layer.

### AG-UI

AG-UI is an interaction/streaming adapter, not a business service. Keep it in `signalai-server` initially. Extract only if its operational profile later requires independent scaling or isolation.

## Service extraction criteria

A module should become a separate service only when one or more of these are true:

1. materially different scaling requirements
2. independent deployment cadence
3. strong security/trust boundary
4. failure isolation requirement
5. distinct runtime/dependency requirements
6. independent ownership/team boundary
7. infrastructure isolation is materially beneficial

Do not split services simply because a domain has a clear name.

In particular, avoid premature services such as:

```text
lead-service
conversation-service
journey-service
campaign-service
company-service
person-service
```

These remain modules within `signalai-server` while they share business invariants, transactions and authorization context.

## Shared capability contract

Each capability should define:

- input schema
- authenticated tenant/org context
- authorization requirement
- validation rules
- synchronous/asynchronous execution mode
- output schema
- domain errors
- audit event(s)
- idempotency requirements for writes
- observability metadata

A capability should not know whether the caller was a browser, AG-UI, MCP client, worker, or another internal service.

## Internal service interaction rule

When services are extracted, the dependency direction should remain:

```text
UI / AG-UI / MCP / Worker / Agent / Connector
                    |
                    v
             Capability contracts
                    |
                    v
              Domain services
                    |
                    v
          Persistence / external APIs
```

A worker, agent, MCP service, or connector should not become a second source of truth by directly owning or bypassing core business state.

## Automation-specific rule

AI must not bypass the existing Builder's safety and persistence model.

Recommended flow:

```text
User asks for automation
        |
create_automation_draft
        |
validate_automation
        |
UI shows draft / impact / errors
        |
user explicitly approves
        |
existing Save / Publish path
```

The agent may prepare a draft, but backend validation and the existing explicit save/publish semantics remain authoritative.

## Recommended server structure

```text
server/src/
  agent/
    orchestrator/
    ag-ui/
    policies/
  mcp/
    server.ts
    transport.ts
    auth/
    tools/
    schemas/
  capabilities/
    company/
    person/
    lead/
    conversation/
    journey/
    campaign/
    research/
    enrichment/
    outreach/
    analytics/
  domain/
  connectors/
  jobs/
  audit/
  routes/
```

The exact folder names can follow the existing server conventions; the important boundary is that capability implementations are transport-independent.

## Evolution rule

Start inside the existing backend deployment. Keep the module boundaries strong enough that the MCP adapter, worker workloads, agent runtime, or connector family can later be extracted into their own service without moving business logic first.

Recommended evolution:

```text
Today
  signalai-server
      |
      +-- capabilities/domain
      +-- jobs
      +-- connectors
      +-- AG-UI/MCP adapters

Next
  signalai-server + signalai-worker

Later, only when justified
  signalai-server
  signalai-worker
  signalai-agent
  signalai-mcp
  signalai-connectors
```
