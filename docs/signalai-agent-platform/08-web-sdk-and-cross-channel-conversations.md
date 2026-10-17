# Web SDK and Cross-Channel Conversations

## Purpose

SignalAI will provide a client-side Web SDK that businesses can embed in their websites. The SDK provides a website conversation surface backed by the same SignalAI conversation, agent, knowledge, automation, and lead capabilities used by Instagram and WhatsApp.

The Web SDK is not a separate chatbot product. It is a channel adapter over the SignalAI capability platform.

## Core product promise

A customer should be able to start a conversation on Instagram or WhatsApp and continue it on the client's website, or start on the website and continue on another connected channel, without SignalAI creating disconnected AI contexts.

```text
Instagram ─┐
WhatsApp ──┼──> Identity Resolution ──> Unified Conversation
Web SDK ───┘                                  |
                                             AI / Automation
```

## Architectural position

The SDK sits alongside other external adapters:

```text
                    SignalAI Capability Layer
                              |
             +----------------+----------------+
             |                |                |
         Instagram        WhatsApp          Web SDK
         Adapter           Adapter           Adapter
             |                |                |
          Meta APIs        WhatsApp          Client website
                           provider
```

The SDK must not contain business logic that duplicates server-side conversation, journey, lead, or AI logic.

## Web SDK responsibilities

The SDK should own only browser/channel concerns:

- Render and manage the website chat experience.
- Establish a secure anonymous or authenticated visitor session.
- Maintain a conversation/session identifier.
- Send and receive messages through the SignalAI channel API.
- Support streaming responses where appropriate.
- Capture useful client-side context such as page URL and referrer subject to privacy settings.
- Support authentication/identity handoff when the website can identify the customer.
- Support deep links or channel handoff when a conversation needs to continue on Instagram/WhatsApp.
- Expose a small configuration API for branding, placement, behavior, and enabled capabilities.

The SDK should not decide who a customer is, merge identities, execute journeys, score leads, or directly access tenant data.

## Tenant model

Each installed SDK instance belongs to a SignalAI workspace/tenant and should use a public SDK identifier rather than a privileged server credential.

Example configuration concept:

```javascript
SignalAI.init({
  workspaceId: "workspace_public_id",
  assistantId: "assistant_public_id",
  visitorId: "optional_authenticated_customer_id",
});
```

The exact API is intentionally deferred until the identity/security design is finalized.

## Conversation continuity

Conversation continuity requires a stable internal conversation model independent of channel.

```text
Conversation
├── conversationId
├── tenantId
├── participantId
├── status
├── assignedAgent
├── context
└── channelThreads[]
      ├── Instagram
      ├── WhatsApp
      └── Web
```

A channel thread identifies where an individual message originated, while the unified conversation represents the customer relationship and AI context.

## Cross-channel handoff

There are two levels of continuity:

### 1. Same customer, same conversation

When SignalAI can confidently resolve the person across channels, messages can be attached to the same conversation.

### 2. Conversation handoff

When identity cannot be safely resolved automatically, SignalAI should create an explicit handoff mechanism rather than guessing.

Examples:

- Website asks the visitor to enter an email/phone number.
- Website generates a continuation link for Instagram/WhatsApp.
- User authenticates through the client's website.
- A channel-specific deep link carries a short-lived continuation token.

Never merge identities solely because names or weak browser signals match.

## Authentication and security

The SDK must never receive a workspace master token.

Use separate concepts for:

- Public SDK configuration.
- Anonymous visitor session.
- Authenticated customer identity.
- Server-to-server client credentials.
- SignalAI internal tenant credentials.

Sensitive operations remain server-side.

The server validates workspace, assistant, origin/domain, rate limits, session state, and permissions before processing messages.

## Website identity

Support both anonymous and authenticated visitors.

```text
Anonymous visitor
      |
      v
Web session
      |
      +----> conversation
      |
      v
Customer authenticates
      |
      v
Identity resolution
      |
      v
Known Person / Lead
```

An authenticated website user should be able to become a known SignalAI Person/Lead without forcing the website to expose internal SignalAI IDs.

## AI context

The AI should retrieve conversation context from the unified conversation model rather than maintaining separate channel-specific memories.

Channel-specific metadata remains available for routing and UX, but should not fragment the core context.

## Website events

The Web SDK can emit events such as:

- `session_started`
- `conversation_started`
- `message_sent`
- `message_received`
- `conversation_resolved`
- `lead_captured`
- `handoff_requested`
- `channel_handoff_requested`

These events should feed the same analytics/event model used by other SignalAI channels.

## SDK extensibility

The SDK should eventually support:

- Chat widget.
- Embedded chat.
- Custom launcher.
- Custom UI through headless APIs.
- Lead capture forms.
- Product/recommendation cards.
- Appointment or conversion actions.
- Human handoff.
- Channel continuation.
- Authentication handoff.

These should be capability-driven rather than hard-coded into a single widget implementation.

## Implementation sequence

1. Define unified conversation and participant models.
2. Define channel abstraction.
3. Define anonymous Web session model.
4. Define authenticated visitor identity handoff.
5. Implement server-side Web channel API.
6. Build minimal Web SDK with chat/session lifecycle.
7. Add streaming responses.
8. Add lead capture and event tracking.
9. Add cross-channel continuation links.
10. Add identity resolution with explicit confidence/safety rules.
11. Add richer SDK UI capabilities.

## Architectural acceptance criteria

- Web SDK uses the same conversation and AI capability layer as other channels.
- No business logic is duplicated inside the SDK.
- A visitor can start anonymously and later become a known customer.
- Cross-channel identity merging requires a safe identity signal.
- Website conversations are tenant-isolated.
- Client websites never receive privileged SignalAI credentials.
- SDK functionality can evolve without changing core conversation business logic.
