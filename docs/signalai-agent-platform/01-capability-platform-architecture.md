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

Start inside the existing backend deployment. Keep the module boundaries strong enough that the MCP adapter or another capability family can later be extracted into its own service without moving business logic first.
