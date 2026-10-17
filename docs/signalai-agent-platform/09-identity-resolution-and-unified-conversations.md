# Identity Resolution and Unified Conversations

## Purpose

Cross-channel continuity requires SignalAI to separate a person's identity from the channel through which messages arrive.

Instagram, WhatsApp, and the Web SDK are communication channels. They must not become separate customer records or separate AI memories by default.

## Core model

```text
Person
 |
 +-- Identity: Instagram
 +-- Identity: WhatsApp
 +-- Identity: Email
 +-- Identity: Website account
 |
 +-- Lead / Customer state
 |
 +-- Conversations
       |
       +-- Instagram thread
       +-- WhatsApp thread
       +-- Web thread
```

## Resource model

Introduce stable internal IDs for:

- `personId`
- `identityId`
- `conversationId`
- `conversationThreadId`
- `messageId`
- `leadId`
- `tenantId`
- `channelAccountId`

External provider IDs must be stored as channel-specific references and must not become the primary SignalAI identity.

## Identity types

A person's identity can include:

| Identity | Example | Confidence |
|---|---|---|
| Instagram | Meta user ID | High when provider identity is authoritative |
| WhatsApp | WhatsApp user/phone identity | High when provider identity is authoritative |
| Email | Verified email | High when verified |
| Phone | Verified phone | High when verified |
| Website account | Client user ID | High when authenticated by client |
| Anonymous web | Browser/session identifier | Low / session-scoped |

The actual identity providers and verification mechanisms can expand later.

## Identity resolution

Identity resolution should be an explicit service/capability:

```text
resolveIdentity(input)
       |
       +-- exact provider identity match
       +-- verified email match
       +-- verified phone match
       +-- authenticated client identity match
       +-- continuation-token match
       |
       v
Resolved Person OR unresolved visitor
```

Do not automatically merge based on:

- Display name alone.
- Username similarity.
- IP address.
- Browser fingerprint alone.
- Approximate location.
- Weak behavioral similarity.

## Confidence model

Identity resolution should return more than a Person ID. It should return confidence and evidence.

```text
IdentityResolutionResult
├── personId?
├── confidence
├── evidence[]
├── matchedIdentityId?
└── requiresVerification
```

This allows the product and agent to decide whether it is safe to continue a conversation or request verification.

## Conversation model

A conversation is channel-independent.

```text
Conversation
├── tenantId
├── personId?
├── state
├── AI context
├── lead context
├── assignment
├── timestamps
└── threads[]
```

A thread represents channel-specific delivery:

```text
Conversation
  |
  +-- Thread: Instagram
  |      +-- messages
  |
  +-- Thread: WhatsApp
  |      +-- messages
  |
  +-- Thread: Web
         +-- messages
```

This gives SignalAI a single conversation context while retaining the channel history required for delivery and analytics.

## Anonymous-to-known transition

Website visitors often begin without a known identity.

```text
Anonymous session
      |
      v
Conversation created
      |
      v
Visitor provides email / phone
      |
      v
Verification or trusted client identity
      |
      v
Person linked
```

The transition must preserve the conversation context without silently exposing another customer's history.

## Cross-channel continuation

A continuation flow can use a short-lived signed token:

```text
Website
  |
  | request continuation
  v
SignalAI
  |
  | create short-lived signed token
  v
Instagram / WhatsApp link
  |
  v
Provider callback/webhook
  |
  v
Resolve token -> conversationId
```

The token should not directly expose sensitive customer information and should expire quickly.

## Merge policy

Identity merging is a security-sensitive operation.

Before merging:

1. Verify tenant scope.
2. Verify identity evidence.
3. Check for conflicting customer records.
4. Record the evidence and resolution decision.
5. Create an audit event.
6. Preserve previous identity relationships for traceability.

When confidence is insufficient, ask the customer to authenticate or provide a verified identifier.

## Conversation context policy

Unified context should include:

- Recent messages.
- Relevant historical conversation summaries.
- Captured customer fields.
- Lead state.
- Active journey/automation state.
- Human handoff state.
- Channel metadata where relevant.

Channel-specific delivery details should remain separate from the semantic customer context.

## Multi-account and tenant isolation

A Person is always scoped through a tenant/workspace relationship.

A person may interact with multiple SignalAI-managed brands only if those relationships are explicitly modeled and authorized. Never use a global person record to leak information across tenants.

Channel accounts also need explicit ownership:

```text
Workspace
  |
  +-- Instagram Account
  +-- WhatsApp Account
  +-- Web SDK Applications
```

A conversation belongs to one workspace and one customer relationship within that workspace.

## Analytics implications

Unified conversations allow metrics such as:

- Conversations by customer.
- Cross-channel conversion.
- First-touch channel.
- Conversion channel.
- Channel handoff rate.
- Lead capture rate.
- Time to conversion.
- AI-to-human handoff rate.

These should be built on the common event model rather than separate dashboards for each channel.

## Implementation sequence

1. Define Person/Identity resources.
2. Define Conversation/Thread resources.
3. Define identity-resolution service.
4. Add audit events for identity changes.
5. Add anonymous web session support.
6. Add authenticated identity linking.
7. Add continuation-token flow.
8. Add cross-channel analytics.
9. Add confidence-based automated resolution.

## Acceptance criteria

- Channel identities are separate from the canonical person model.
- Conversations are channel-independent.
- Every identity merge has evidence and auditability.
- Tenant boundaries are enforced at every resolution step.
- Anonymous web sessions cannot access existing customer conversations without successful resolution.
- Cross-channel continuity works without duplicating AI business logic.
