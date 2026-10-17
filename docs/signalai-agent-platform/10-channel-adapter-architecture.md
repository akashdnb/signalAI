# Channel Adapter Architecture

## Purpose

SignalAI should support multiple customer communication surfaces without creating separate business logic for each channel.

The channel adapter architecture makes Instagram, WhatsApp, Web SDK, future channels, AG-UI, and external AI clients composable around the same capability platform.

## Core rule

> Channels deliver messages. The SignalAI capability layer owns the meaning and business behavior of those messages.

A channel adapter must not become a second application layer.

## Architecture

```text
                         SignalAI Core
                              |
                    Conversation / Agent
                              |
                       Capability Layer
                              |
              +---------------+---------------+
              |               |               |
        Instagram Adapter WhatsApp Adapter Web Adapter
              |               |               |
          Meta APIs        Provider APIs     Web SDK
```

Additional adapters can be added later:

```text
Email
SMS
Messenger
Telegram
Voice
Custom client UI
```

## Channel interface

Conceptually every channel should provide:

```text
ChannelAdapter
├── receiveMessage()
├── sendMessage()
├── updateMessage()
├── resolveExternalIdentity()
├── createContinuation()
├── handleDeliveryEvent()
└── capabilities()
```

The concrete interface and TypeScript contracts should be defined during implementation.

## Normalized inbound message

Providers should be normalized into a common internal envelope:

```text
InboundMessage
├── tenantId
├── channel
├── channelAccountId
├── externalMessageId
├── externalConversationId
├── externalIdentity
├── timestamp
├── content
├── attachments
├── metadata
└── correlationId
```

The capability layer then decides what to do with it.

## Normalized outbound message

The core system should produce a channel-neutral outbound message:

```text
OutboundMessage
├── conversationId
├── recipient
├── content
├── attachments
├── action metadata
└── delivery requirements
```

The channel adapter translates it into provider-specific API calls.

## Web SDK as a channel

The Web SDK follows the same contract but uses a SignalAI Web channel API instead of a third-party messaging provider.

```text
Browser
  |
Web SDK
  |
Web Channel API
  |
Conversation capability
  |
Agent / Automation
```

The browser should never directly invoke internal domain services.

## AG-UI is different

AG-UI is an agent interaction/streaming protocol and should not be modeled as a customer messaging channel in the same way as Instagram, WhatsApp, or Web.

Conceptually:

```text
Customer Channels
Instagram / WhatsApp / Web
          |
          v
Conversation + Agent Layer
          ^
          |
     AG-UI Adapter
          |
      SignalAI UI
```

AG-UI lets SignalAI's own product UI interact with the agent. The Web SDK lets a client's customer interact with the business.

## MCP is different

MCP is an external capability interface, not a customer messaging channel.

```text
External AI Client
       |
      MCP
       |
Capability Layer
```

Both MCP and channel adapters should reuse the same underlying application services.

## Web SDK API surface

Keep the first SDK intentionally small:

```text
init()
open()
close()
sendMessage()
identify()
on(event)
```

Later additions can include:

```text
setUser()
startConversation()
resumeConversation()
requestHumanHandoff()
continueOnChannel()
updateContext()
```

The public API should remain stable while the internal capability implementation evolves.

## Event-driven integration

Inbound provider events should follow a consistent flow:

```text
Provider / Browser
       |
       v
Channel Adapter
       |
       v
Normalized Event
       |
       v
Conversation Service
       |
       +----> Agent
       +----> Journey / Automation
       +----> Lead / CRM
       +----> Analytics
       +----> Audit
```

This prevents each channel from independently implementing automation and analytics behavior.

## Channel capabilities

Not every channel supports every feature.

For example:

```text
Instagram
  text: yes
  rich cards: provider-dependent
  continuation: yes

WhatsApp
  text: yes
  templates: yes
  rich messages: provider-dependent

Web
  text: yes
  rich UI: yes
  custom actions: yes
  authenticated identity: yes
```

Adapters should advertise capabilities instead of forcing the core system to assume all channels behave identically.

## Delivery and retry

The core system should create delivery intents/events while channel adapters own provider-specific delivery behavior.

Retries, idempotency keys, provider rate limits, and delivery receipts should be normalized into the common event model where possible.

## Human handoff

Human takeover is a core conversation state, not an Instagram-only feature.

```text
AI active
   |
   v
Human requested
   |
   v
Human active
   |
   v
AI resumed
```

Each channel adapter should support the handoff behavior available on that channel.

## Observability

Every channel event should carry:

- tenant/workspace ID
- channel
- channel account ID
- conversation ID
- thread ID
- message ID
- correlation ID
- provider event ID
- timestamps

This enables tracing a customer interaction from provider/browser through SignalAI and back to delivery.

## Future channel onboarding

Adding a new channel should require:

1. Implement adapter interface.
2. Map provider identity.
3. Map inbound events.
4. Map outbound messages.
5. Declare channel capabilities.
6. Implement provider authentication.
7. Implement delivery/retry behavior.
8. Add channel-specific integration tests.

It should not require rewriting conversation, agent, lead, journey, analytics, or MCP logic.

## Acceptance criteria

- All customer channels use the same conversation and capability layer.
- Channel-specific provider behavior is isolated behind adapters.
- Web SDK is a first-class channel rather than a separate product implementation.
- MCP and AG-UI remain distinct from customer channels.
- New channels can be added without duplicating business logic.
- Provider events are observable end-to-end.
