# SignalAI Core Server Architecture

## Purpose

`signalAI` is the system of record for SignalAI. It owns authenticated product state, domain rules, transactional workflows, and the capability layer consumed by the UI and future services.

## Responsibilities

### Identity and access

- authentication/session integration
- workspace membership
- roles and permissions
- connected-account ownership
- tenant/workspace isolation
- service-to-service authentication

### Core product domains

Keep these as modules in the core application rather than separate microservices by default:

- workspace/team
- connected accounts
- people and identity
- conversations/messages
- leads/CRM
- journeys/automation definitions
- journey versions and publication state
- analytics/read models
- content
- billing/usage
- audit records

### Capability layer

Capabilities are application-level operations with explicit input/output contracts. They are the preferred boundary for new AI and service integrations.

Examples:

```text
search_leads
get_lead
search_conversations
get_conversation
list_automations
get_automation
create_automation_draft
validate_automation
publish_automation
get_lead_metrics
get_campaign_metrics
research_company
```

A capability must:

- receive an authenticated actor/workspace context;
- authorize access to the requested resource;
- validate input;
- execute domain rules;
- return a typed result or typed error;
- emit audit information for relevant actions;
- be safe to call from REST, MCP, AG-UI, or internal workers.

## Suggested internal layout

```text
src/
  modules/
    workspace/
    connected-accounts/
    identity/
    conversations/
    leads/
    journeys/
    analytics/
    content/
    billing/
    audit/
  capabilities/
    leads/
    conversations/
    journeys/
    analytics/
    research/
  infrastructure/
    database/
    queue/
    auth/
    telemetry/
  interfaces/
    http/
    ag-ui/
```

Names should follow the existing repository conventions; this document defines boundaries, not a forced rewrite.

## Multi-account model

The core platform must treat an Instagram/WhatsApp/Web integration as a `ConnectedAccount` rather than embedding one provider account directly into workspace logic.

```text
Workspace
  |
  +-- ConnectedAccount A (Instagram)
  +-- ConnectedAccount B (Instagram)
  +-- ConnectedAccount C (WhatsApp)
  +-- ConnectedAccount D (Web)
```

Journeys may be associated with multiple connected accounts where supported. Runtime execution must always carry the concrete connected-account identity so events and sends cannot cross accounts.

## Unified identity and conversation

The long-term model is:

```text
Person
  |
  +-- Identity: Instagram
  +-- Identity: WhatsApp
  +-- Identity: Web
  +-- Identity: Email
        |
        v
Conversation
  |
  +-- Channel thread
  +-- Messages
```

This is what enables a customer to start on Instagram and continue on a website without creating unrelated CRM records.

## Journey safety

A journey has a draft/editing representation and immutable published versions. Execution pins a specific version. Editing a draft must not mutate an already-running version.

Publishing remains an explicit operation:

```text
edit -> validate -> save draft -> review -> publish -> execute version
```

Agent-generated journeys follow the same path. AI is never allowed to bypass journey validation or publication semantics.

## Cross-service contracts

The following contracts are stable architectural boundaries even if their transport changes:

### Service identity

```json
{
  "service": "signalai-worker",
  "environment": "production",
  "requestId": "req_..."
}
```

### Workspace context

```json
{
  "workspaceId": "ws_123",
  "actorId": "usr_123",
  "role": "member",
  "permissions": ["lead.read"]
}
```

### Job envelope

```json
{
  "jobId": "job_123",
  "type": "company.research",
  "version": 1,
  "workspaceId": "ws_123",
  "requestedBy": "usr_123",
  "idempotencyKey": "research:company_123:v1",
  "payload": {}
}
```

### Error envelope

```json
{
  "code": "FORBIDDEN",
  "message": "The actor cannot access this resource",
  "requestId": "req_123",
  "retryable": false
}
```

The exact schema implementation can evolve, but compatibility/versioning must be explicit.

## Service interaction rules

### Worker

The server creates/authorizes jobs. The worker executes them. The worker may call approved capabilities or service APIs; it must not bypass authorization by writing arbitrary domain records.

### Connectors

Connectors translate provider-specific APIs into normalized SignalAI results. Provider credentials remain isolated from domain models. Connector failures must be typed and observable.

### MCP

MCP authenticates an external agent, resolves workspace scope, checks permissions, and calls capabilities. MCP must never directly access the database.

### Agent

The agent plans and reasons. It can call approved tools/capabilities. It must not invent authorization, publish live journeys, send messages, or mutate data without the required capability and approval.

## Events

Prefer domain events for asynchronous fan-out rather than synchronous service-to-service chains where practical.

Examples:

```text
conversation.message.received
lead.created
lead.updated
journey.published
journey.execution.requested
research.job.completed
connector.account.health_changed
```

Events must be versioned and contain workspace/tenant context where relevant.

## Reliability requirements

- request IDs and correlation IDs across all service calls
- bounded timeouts
- retries only for retryable failures
- idempotency for side effects
- dead-letter handling for exhausted jobs
- audit logs for privileged actions
- secret redaction
- workspace isolation tests
- contract tests for cross-service schemas
- health/readiness endpoints for deployed services

## What not to do

Do not create separate `lead-service`, `journey-service`, `conversation-service`, or `analytics-service` just to make the repository look microservice-oriented. The goal is independent operational boundaries, not maximum deployment count.

Do not let MCP, agent, worker, or connector implementations create their own competing versions of SignalAI business rules.

## Future service topology

```text
                 +-----------------------+
                 |    signalai-server    |
                 | Core + capabilities   |
                 +-----------+-----------+
                             |
              +--------------+--------------+
              |              |              |
              v              v              v
       +-------------+ +-------------+ +-------------+
       |   worker    | | connectors  | |     mcp     |
       |   Python    | |   Python    | |   Python    |
       +------+------+ +------+------+ +------+------+ 
              |              |              |
              +--------------+--------------+
                             |
                             v
                      +-------------+
                      |    agent    |
                      |   Python    |
                      +-------------+
```

The topology is a target. Each boundary should be introduced incrementally and backed by operational evidence.