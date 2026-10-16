# 02 — MCP Architecture

## Decision

MCP should be an adapter over the SignalAI capability layer, not the place where SignalAI business logic lives.

For the first implementation, keep MCP in the existing backend deployment. Do not create a separate Render service merely to introduce MCP.

Extract it later only when independent scaling, security isolation, external traffic, deployment cadence, or operational ownership justifies the split.

## MCP responsibilities

MCP owns:

- protocol transport
- tool/resource registration
- MCP-specific schemas
- MCP client authentication and authorization mapping
- request/response translation
- MCP error mapping
- protocol-level telemetry

MCP does not own:

- journey validation
- lead state transitions
- campaign rules
- research algorithms
- provider-specific business logic
- persistence rules
- approval policy implementation

## Initial tool groups

### Read-only

- `search_companies`
- `get_company`
- `search_people`
- `get_person`
- `search_leads`
- `get_lead`
- `get_conversation`
- `get_campaign_metrics`
- `get_automation_metrics`

### Research

- `research_company`
- `research_person`
- `find_buying_signals`
- `score_prospect`
- `analyze_social_presence`
- `analyze_technology_stack`

Research that can touch multiple external providers should return normalized SignalAI objects rather than provider-specific payloads.

### Actions

- `create_prospect_list`
- `create_lead`
- `create_campaign`
- `create_automation_draft`
- `publish_automation`
- `send_outreach`
- `pause_campaign`
- `send_message`

Action tools should be introduced only after the read/research model and approval boundaries are stable.

## Automation draft contract

The safest initial automation mutation is a draft operation:

```text
create_automation_draft
        -> draft resource
        -> validate_automation
        -> user review
        -> existing explicit Save / Publish path
```

Do not allow an MCP client to silently publish or mutate an automation by treating tool invocation as equivalent to user approval.

## Authentication

External MCP authentication must be distinct from native browser/session authentication.

Planned model:

- authenticated tenant/org context
- scoped client credentials or OAuth for external clients
- explicit tool scopes
- tenant isolation on every capability call
- no master database credentials exposed to MCP
- no reuse of browser session cookies as an external integration credential

Example scopes:

- `companies:read`
- `people:read`
- `research:read`
- `leads:read`
- `campaigns:read`
- `automation:draft`
- `automation:publish`
- `outreach:send`

High-impact scopes should require stronger approval and auditing.

## Resource and job strategy

MCP clients need stable resources and asynchronous jobs, not only one-shot functions.

Example:

```text
start_company_research
      -> job_id
      -> get_job_status(job_id)
      -> get_job_results(job_id)
```

This becomes important when researching 100 companies, enriching people, checking multiple providers, or running a campaign operation.

## Idempotency and safety

All meaningful write tools should support an idempotency key or an equivalent domain-level deduplication mechanism.

Every write should record:

- actor/client
- tenant/org
- capability/tool
- target resource
- request ID
- idempotency key where applicable
- before/after state when practical
- approval information
- outcome/error
- timestamps

## MCP and AG-UI relationship

They solve different problems:

- MCP = external capability/tool contract.
- AG-UI = native interactive agent UI/event protocol.

They should share capability implementations but should not be coupled as one transport.

```text
                    Capability Layer
                    /      |       \
                 AG-UI    MCP     Internal API
                   |       |          |
                SignalAI UI       External AI
```

## Future extraction trigger

Create a separate `signalai-mcp` service only when at least one of these becomes true:

1. MCP traffic needs independent scaling.
2. External-client security isolation warrants a separate trust boundary.
3. MCP deployments need a release cadence independent from the main API.
4. MCP protocol concerns materially increase main backend complexity.
5. Operational ownership requires a dedicated service.

Even after extraction, both services must call the same capability/domain contracts rather than duplicating business logic.
