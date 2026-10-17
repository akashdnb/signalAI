# 11 — Connectors Implementation Plan

## Status

**Current decision: BUILD NOW**

The connector layer is part of the active implementation path. The Python background worker is **DEFERRED** because the current Render plan does not support the required background-worker deployment model.

Do not deploy, provision, or make the worker a prerequisite for connector work.

## Goal

Build `signalai-connectors` as the external-provider integration boundary while keeping SignalAI business logic in `signalai-server`'s capability/domain layer.

The connector service must hide provider-specific APIs, authentication, transport, retries, rate limits, response formats, and provider-specific identifiers from the rest of SignalAI.

## Target architecture

```text
SignalAI UI / Agent / MCP / REST
              |
              v
      signalai-server
      Capability Layer
              |
              v
       signalai-connectors
              |
      +-------+--------+
      |                |
      v                v
 Research Provider   Enrichment Provider
      |                |
      +-------+--------+
              |
        External APIs
```

The server capability layer remains the source of truth for:

- tenant authorization
- domain validation
- normalized domain models
- business rules
- audit semantics
- idempotency
- capability contracts

Connectors are provider adapters, not domain services.

## Phase 0 — Foundation verification

Before adding providers:

- Keep the existing Python 3.12/FastAPI foundation.
- Keep the provider registry abstraction.
- Keep the normalized connector contract.
- Keep bounded HTTP timeout and concurrency controls.
- Keep response-size protection.
- Keep retry handling for transient failures and rate limits.
- Keep CI, Docker, Render configuration, and tests.
- Verify package/module structure is production-ready.
- Add correlation/request IDs to connector calls.
- Ensure secrets never appear in logs or error responses.

Acceptance criteria:

- connector service starts successfully
- health/readiness works
- provider registration is deterministic
- transient HTTP failures retry within bounded limits
- non-retryable failures fail fast
- response size is bounded
- tests cover success, timeout, 429 and 5xx behavior

## Phase 1 — Provider-neutral contracts

Define explicit contracts for provider operations.

Each connector operation should specify:

- operation name
- input schema
- normalized output schema
- provider/source
- provider record ID
- retrieved timestamp
- evidence/reference metadata
- confidence where applicable
- provider error mapping
- correlation ID

Example conceptual contract:

```python
class CompanyResearchConnector(Protocol):
    async def search_companies(
        self, input: SearchCompaniesInput
    ) -> ConnectorResult[list[CompanyCandidate]]: ...

    async def get_company(
        self, input: GetCompanyInput
    ) -> ConnectorResult[CompanyEvidence]: ...
```

Do not expose provider-shaped payloads as the primary contract consumed by SignalAI.

## Phase 2 — First real provider

Implement one real research/enrichment provider end-to-end before adding multiple providers.

Provider selection criteria:

1. useful for SignalAI's prospecting/research use cases
2. stable API and documented authentication
3. predictable pricing/rate limits
4. useful company/person data
5. suitable for server-side integration
6. clear terms for the intended access pattern

Implementation steps:

1. provider configuration and credentials
2. provider client
3. request mapping
4. response mapping
5. normalized connector result
6. provider error mapping
7. retry/rate-limit handling
8. tests with mocked provider responses
9. integration smoke test
10. capability-layer integration

Do not couple the domain model to the provider's JSON shape.

## Phase 3 — Server capability integration

Expose the connector through a SignalAI capability rather than calling the connector directly from UI, MCP, or agent code.

Flow:

```text
MCP / Agent / UI
      |
      v
Capability boundary
      |
      +-- authentication
      +-- tenant authorization
      +-- validation
      +-- business rules
      +-- correlation ID
      |
      v
Connector adapter
      |
      v
External provider
```

The capability should normalize the provider response into SignalAI resources such as Company, Person, ResearchReport, or related provenance records.

## Phase 4 — Security

Required before production use:

- credentials stored as service secrets
- no provider credentials accepted from user-controlled payloads
- tenant context comes from authenticated request context
- service-to-service authentication between server and connector
- provider access scoped to the required operations
- outbound requests have bounded timeouts
- sensitive provider responses are not written verbatim to logs
- audit trail records provider usage where appropriate

The connector must never infer tenant authorization from a payload field.

## Phase 5 — Observability

Capture:

- correlation/request ID
- provider
- operation
- latency
- HTTP status/category
- retry count
- rate-limit events
- timeout count
- normalized success/failure
- tenant-safe usage metadata

Do not log API keys, access tokens, unnecessary personal data, or complete provider payloads by default.

## Phase 6 — Additional providers

Only after the first provider works end-to-end:

- add providers behind the same interface
- keep provider-specific code isolated
- compare normalized evidence/confidence
- define provider fallback rules where justified
- add provider selection/configuration policy
- add cost/rate-limit awareness

Adding a provider should not require changes to MCP tool semantics or the core domain model.

## Worker deferral

The Python background worker is intentionally out of the current execution path.

For now, connector operations that are safe and bounded may execute synchronously through the capability layer.

Do **not**:

- create a worker deployment as part of connector implementation
- make PostgreSQL execution jobs a connector prerequisite
- block connector/MCP delivery on worker availability
- move domain logic into a worker merely because the worker architecture exists

When background workers become available, long-running research/enrichment can be moved behind the existing capability boundary without changing MCP or UI contracts.

## Definition of done

Connector work is complete for the first provider when:

- provider adapter is implemented
- normalized contract is stable
- provider failures are bounded and mapped
- service-to-service authentication is configured
- one real capability consumes the connector
- tenant authorization is enforced by the server capability layer
- correlation IDs flow through the request
- tests and CI are green
- staging smoke test succeeds
- MCP can consume the capability without provider-specific knowledge
- no worker deployment is required
