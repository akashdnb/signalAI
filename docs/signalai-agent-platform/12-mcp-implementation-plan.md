# 12 — MCP Implementation Plan

## Status

**Current decision: BUILD NOW**

MCP is part of the active implementation path. It should expose SignalAI capabilities to external AI clients without duplicating domain logic.

The MCP server is an adapter/security boundary, not the business-logic layer.

## Goal

Build `signalai-mcp` as a secure external interface over the SignalAI capability layer.

MCP tools must call capability APIs/contracts in `signalai-server`. They must not directly access the database, implement domain rules, or bypass authorization.

## Target architecture

```text
External AI Client
        |
        v
   signalai-mcp
        |
   authenticated
   tenant context
        |
        v
SignalAI Capability Layer
        |
   +----+-----+
   |          |
   v          v
 Domain     Connectors
 Services   / external APIs
```

The same capability should be reusable by:

- SignalAI UI
- AG-UI agent/copilot
- REST/internal callers
- MCP
- future workers

## Phase 0 — Foundation verification

Verify the existing MCP foundation before adding more tools:

- Python 3.12
- official MCP Python SDK v2
- Streamable HTTP transport
- authentication middleware
- tenant propagation
- host/origin validation
- capability API client boundary
- Render deployment configuration
- Docker and CI

Acceptance criteria:

- MCP server starts successfully
- protected endpoint rejects unauthenticated access
- authenticated request produces tenant context
- invalid host/origin is rejected according to deployment policy
- capability failures are mapped to safe MCP errors
- secrets are never returned to clients

## Phase 1 — Authentication and authorization

Production MCP authentication must use the SignalAI authentication model rather than a permanent shared token.

Required context:

- tenant/org ID
- actor/client ID
- authentication method
- granted scopes
- request/correlation ID

Required controls:

- token validation
- issuer/audience validation where applicable
- required scope enforcement
- tenant propagation
- capability-level authorization
- host/origin validation
- service-to-service authentication from MCP to server

The MCP server must never accept `tenant_id` as authoritative solely because it appears in tool arguments.

## Phase 2 — Capability tool surface

Start with a small, read-only surface.

Initial capabilities:

```text
company.search
company.get
lead.list
conversation.list
automation.list
```

For each tool define:

- stable tool name
- description
- input schema
- authenticated context requirements
- capability mapping
- output schema
- error semantics
- pagination behavior
- correlation ID behavior

Tool descriptions should explain what the operation does and its constraints without exposing implementation details.

## Phase 3 — Capability integration

Each MCP tool should follow this pattern:

```text
MCP tool
   |
   +-- validate tool input
   +-- obtain authenticated tenant context
   +-- attach correlation ID
   |
   v
Capability API
   |
   +-- authorization
   +-- domain validation
   +-- business logic
   +-- connector access where needed
   |
   v
Normalized SignalAI response
```

Never implement business logic in the MCP handler.

## Phase 4 — Output and error contracts

Responses should be stable and useful to AI clients.

Return normalized SignalAI resources rather than raw database documents or provider payloads.

Errors should distinguish at least:

- authentication failure
- authorization failure
- invalid input
- resource not found
- capability unavailable
- provider failure
- rate limit
- internal failure

Do not expose stack traces, secrets, SQL, internal credentials, or unnecessary infrastructure details.

## Phase 5 — Safety model

MCP should initially remain read-only.

Mutating operations are a separate phase and must use the existing capability safety model.

Capability execution classes:

- `READ_ONLY`
- `RESEARCH`
- `DRAFT`
- `WRITE`
- `EXTERNAL_SIDE_EFFECT`

For future write tools:

1. authenticate
2. authorize
3. validate
4. enforce idempotency where required
5. determine approval requirement
6. require explicit approval for high-impact side effects
7. execute through the capability layer
8. audit the action
9. return the normalized result

The MCP transport must never bypass the existing automation Save/Publish safety model.

## Phase 6 — First real connector-backed capability

Once `signalai-connectors` has one real provider, expose the corresponding capability through MCP.

Example:

```text
AI client
   |
   v
MCP company.research
   |
   v
SignalAI company research capability
   |
   v
signalai-connectors
   |
   v
Research provider
```

The MCP client should have no knowledge of which provider was used.

Provider selection, retries, normalization, provenance, and provider-specific errors remain below the capability boundary.

## Phase 7 — Observability and audit

Every MCP request should carry a correlation ID through:

```text
MCP client
  -> MCP server
  -> capability
  -> connector
  -> external provider
```

Capture:

- request/correlation ID
- tenant-safe actor/client identity
- tool/capability name
- latency
- success/failure category
- authorization failures
- provider failures
- rate limits/retries where available

Audit high-impact actions and sensitive access according to SignalAI's audit model.

Do not log:

- access tokens
- API keys
- client secrets
- complete sensitive payloads
- unnecessary personal data

## Phase 8 — MCP resources and broader surface

After the initial read-only tool surface is stable, evaluate MCP resources for read-heavy domain objects where they improve client usability.

Potential future resources:

- companies
- people
- leads
- conversations
- journeys/automations
- research reports

Do not expose every internal database table as an MCP resource. The external contract should follow product capabilities, not storage structure.

## Phase 9 — Write actions

Only after read-only MCP is proven:

- create/update lead
- create automation draft
- update automation draft
- publish automation
- create campaign
- send outreach

These require explicit capability-level authorization, idempotency, audit, and approval rules appropriate to their impact.

For automation specifically:

```text
AI request
   -> create_automation_draft
   -> validate_automation
   -> return draft/impact/errors
   -> explicit user approval
   -> existing Save/Publish flow
```

AI must not directly publish or bypass the builder's explicit save/publish controls.

## Worker deferral

MCP does not depend on the background worker.

Synchronous capabilities can be exposed now when their execution is bounded and safe.

For long-running work, the architecture should reserve a Job-based contract, but implementation of the worker is deferred until the deployment plan supports it.

Do not deploy the worker or make MCP dependent on a worker service at this stage.

When the worker is available, MCP can expose job creation/status/result capabilities without changing the underlying user-facing tool contract.

## Testing plan

### Unit tests

- authentication
- scope enforcement
- tenant propagation
- input validation
- capability mapping
- error mapping
- tool schemas

### Integration tests

- MCP -> capability API
- tenant isolation
- connector-backed research flow
- provider failure mapping
- correlation ID propagation

### Security tests

- missing token
- invalid token
- missing scope
- wrong tenant
- invalid host/origin
- forged tenant argument
- leaked secret/error detail

### Smoke test

```text
Authenticated MCP client
       |
       v
company.search
       |
       v
server capability
       |
       v
connector/provider
       |
       v
normalized company result
```

## Definition of done

MCP v1 is complete when:

- authentication is production-configured
- tenant isolation is verified
- initial read-only tools are exposed
- tools call the capability layer rather than implementing business logic
- one connector-backed capability works end-to-end
- normalized outputs and safe errors are stable
- correlation IDs are propagated
- CI and integration tests are green
- deployment is verified
- no background worker is required
