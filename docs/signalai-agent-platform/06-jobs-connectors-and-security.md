# 06 — Jobs, Connectors, Security & Audit

## Job abstraction

Long-running operations should be modeled explicitly.

A Job should include:

- job ID
- tenant/org ID
- type
- requested by / actor
- status
- progress
- current step
- created/started/completed timestamps
- cancellation state
- error information
- result reference

Example statuses:

`QUEUED -> RUNNING -> COMPLETED | FAILED | CANCELLED`

Jobs should be resumable where practical and should not depend on an open browser or MCP connection.

## Why Jobs are foundational

They are required for:

- researching many companies
- enrichment batches
- prospect list generation
- multi-provider research
- campaign operations
- future autonomous workflows

AG-UI can stream job progress. MCP clients can poll or retrieve job status/results. Scheduled automations can create jobs without a UI session.

## Connector contract

A connector should hide provider-specific transport and data models.

Conceptually:

```ts
interface CompanyResearchConnector {
  searchCompanies(input: SearchCompaniesInput): Promise<ConnectorResult<CompanyCandidate[]>>;
  getCompany(input: GetCompanyInput): Promise<ConnectorResult<CompanyEvidence>>;
}
```

The real interfaces should be adapted to the existing TypeScript conventions.

Connector results should preserve:

- provider/source
- provider record ID
- retrieved timestamp
- evidence
- confidence where applicable
- raw/reference metadata where permitted

Core domain objects should store normalized data plus source provenance, not provider-shaped blobs as their primary contract.

## Tenant security

Every capability invocation receives an authenticated context containing at minimum:

- tenant/org ID
- actor/client ID
- authentication method
- granted scopes/permissions
- request/correlation ID

The capability must never accept tenant identity solely from user-controlled tool arguments.

## Authorization

Authorization should be checked at the capability boundary, before domain mutation or external side effects.

Read scopes and action scopes should be separated.

High-impact operations such as publishing automations or sending outreach should have explicit action permissions and, where appropriate, a user approval requirement.

## Audit model

Audit events should make it possible to answer:

- who initiated the operation?
- through which interface?
- which capability/tool ran?
- what resource was affected?
- what external providers were contacted?
- what changed?
- was approval required and granted?
- what was the final outcome?

The audit model should support both successful and failed attempts.

## Idempotency

Use idempotency keys for operations where retries could duplicate side effects.

Examples:

- sending outreach
- creating campaigns
- publishing automations
- starting bulk jobs
- creating prospect lists

Idempotency should be enforced in the domain/application layer rather than only in the MCP transport.

## Observability

Every agent/capability execution should carry a correlation/request ID across:

```text
UI / MCP
  -> agent
  -> capability
  -> connector / job
  -> external API
```

Capture latency, provider failures, retries, authorization failures and domain validation errors without logging secrets or unnecessary personal data.

## External data and privacy

Research connectors may return personal and company information. The system should define retention, source attribution, access scope and deletion behavior before broad enrichment is enabled.

Do not make the architecture depend on unrestricted scraping. Connectors should be replaceable and operate within their permitted access model.

## Approval model

A capability can declare an execution class:

- `READ_ONLY`
- `RESEARCH`
- `DRAFT`
- `WRITE`
- `EXTERNAL_SIDE_EFFECT`

The agent/orchestrator can use this classification to determine whether an explicit user confirmation is required.

The classification is a policy input, not a substitute for normal authorization and domain validation.
