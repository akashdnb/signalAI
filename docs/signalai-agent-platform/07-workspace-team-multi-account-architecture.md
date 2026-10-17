# 07 — Workspace, Team & Multi-Account Architecture

## Purpose

Carry the existing workspace/team and multi-Instagram-account direction into the capability-platform architecture so future AI, MCP, automation and provider work does not have to be redesigned around a single user or account.

## Target hierarchy

```text
Workspace
├── Members
│   ├── Owner
│   └── Teammates / roles
├── Connected Accounts
│   ├── Instagram account A
│   ├── Instagram account B
│   └── future providers
├── Reusable Journeys
├── Campaigns
├── Leads / Conversations
└── Analytics
```

## Journey reuse

Journeys should be workspace-level reusable assets.

A journey may be attached to one or many connected accounts. Runtime execution must resolve the account-specific context at execution time.

```text
Workspace Journey
      |
      +---- Account A execution context
      |
      +---- Account B execution context
```

Do not copy journey definitions per account merely to make reuse possible.

## Isolation rules

Connected accounts must remain isolated for:

- credentials/tokens
- conversations
- leads
- message history
- journey executions
- account-level analytics
- external provider identifiers

The workspace is the sharing boundary for reusable configuration, while the connected account is the execution/data boundary where provider-specific state matters.

## Authorization

Start with workspace membership and role-based permissions. Keep the authorization model extensible to account-level permissions later.

Every capability context should be able to identify:

- workspace/org
- actor/member
- selected connected account when relevant
- role/permissions
- request ID

The selected account must never be accepted as an unrestricted way to cross workspace boundaries.

## Provider abstraction

The connected-account model should not hard-code Instagram into the core resource hierarchy.

Conceptually:

```text
ConnectedAccount
  provider = instagram | whatsapp | ...
  providerAccountId
  credentialsRef
  status
  metadata
```

Provider-specific capabilities can sit behind connector/provider interfaces.

## AI implications

The agent must be explicit about account context when an action could affect multiple accounts.

For example:

- “Show leads” may default to the workspace scope if the UI supports it.
- “Create this journey for Acme Instagram” must resolve a specific account.
- “Publish this journey to all connected accounts” is a multi-account action and should show the affected accounts before approval.

## MCP implications

MCP resources and tools must carry workspace/account authorization context. External clients should not receive a global workspace credential that can bypass member permissions.

Potential resource patterns:

- `workspace`
- `connected_account`
- `journey`
- `journey_execution`
- `conversation`
- `lead`

A reusable journey can be read at workspace scope, while execution and account-specific state are returned only when the caller has access to the relevant connected account.

## Product-quality implications

The connected account UI should use human-readable account identity where possible and surface connection/permission health. Raw provider identifiers should remain implementation details unless needed for diagnostics.
