# AG-UI Evaluation and Adoption Plan for SignalAI

**Status:** Proposed — evaluate with a focused proof of concept before adopting in production  
**Last reviewed:** 2026-10-15  
**Repository:** [ag-ui-protocol/ag-ui](https://github.com/ag-ui-protocol/ag-ui)  
**Official docs:** [AG-UI documentation](https://docs.ag-ui.com/)

## Executive summary

AG-UI (Agent–User Interaction Protocol) is an open, event-based protocol for connecting AI agent backends to user-facing applications. It standardizes the flow of agent events to clients, including run lifecycle, streaming messages, tool calls, state updates, and human-in-the-loop interactions. It is not an LLM, an automation engine, or a UI component library by itself.

**Recommendation for SignalAI:** Evaluate AG-UI as the interaction layer for a future dashboard AI copilot. Start with a small, read-only analytics/lead-insights proof of concept. Do not replace the existing React Flow journey builder, journey schema/validation, persistence, publish flow, Instagram integration, or automation execution engine.

This recommendation is based on SignalAI's product direction and the protocol's capabilities. It is not a claim that AG-UI has already been integrated or validated against the current codebase.

## 1. What AG-UI is

AG-UI defines a common event-based contract between an agentic backend and a client that receives, displays, and responds to those events. It is transport-flexible; deployments can use transports such as Server-Sent Events (SSE) or WebSockets, depending on the implementation.

Typical capabilities include:

- **Streaming conversations:** show partial assistant output without waiting for the full response.
- **Run lifecycle:** represent when an agent starts, progresses, completes, pauses, or errors.
- **Tool-call visibility:** report tool-call progress and results to the frontend.
- **State synchronization:** communicate agent/application state where needed.
- **Human-in-the-loop workflows:** pause for input or confirmation and resume with the user's response.
- **Structured interactions:** support clients that render typed results or interactive components under application control.

AG-UI standardizes interaction. The application still owns business logic, authorization, persistence, component rendering, error handling, and action execution.

### Where it fits

| Technology | Responsibility | SignalAI example |
|---|---|---|
| AG-UI | Agent ↔ user-facing application | Stream copilot output, expose tool progress, collect approval |
| MCP | Agent ↔ tools and external data | Give an agent controlled access to SignalAI capabilities |
| A2A | Agent ↔ agent | Coordinate independent agents, if the architecture eventually requires them |

These protocols are complementary. SignalAI does not need MCP or A2A just to use AG-UI.

## 2. Potential SignalAI use cases

### Priority 1 — Ask SignalAI: lead and analytics copilot

A creator could ask:

> Why did my leads drop this week?

The copilot could:
1. Identify the relevant date range and workspace from authenticated server context.
2. Call a read-only analytics tool.
3. Stream status such as “Loading campaign metrics”.
4. Render a summary with approved, typed UI components (e.g. metric cards or a table).
5. Explain observed changes and distinguish measured facts from possible explanations.
6. Suggest a follow-up action without running it automatically.

This is the recommended first proof of concept because it exercises streaming, tool events, and structured results without risking message sends or journey changes.

### Priority 2 — Lead and conversation copilot

Example request:

> Find people who asked for pricing but have not purchased.

The backend searches only the current workspace's authorized data and returns matching lead summaries. The UI can show lead cards, conversation context, and a suggested follow-up message. Drafting is safe to start with; sending must remain a separate, authorized action with explicit confirmation where required.

### Priority 3 — Natural-language journey drafting

Example request:

> When someone comments COURSE, ask what they are interested in, capture their email, and tag the lead.

An agent could convert the request into a **proposed journey**, then:
1. Validate the result against the current journey schema and business rules.
2. Explain missing fields or invalid connections.
3. Open the existing React Flow editor with the proposal as unsaved client-side state.
4. Let the creator inspect and edit the graph.
5. Save only after an explicit Save action.
6. Require the established publish flow and any required confirmations.

AG-UI can carry the interaction, but it does not generate valid journeys by itself. Journey generation, validation, graph translation, and editor integration are separate application work.

## 3. Unified SignalAI MCP strategy

SignalAI should expose its product capabilities through a **single MCP capability layer** that can be consumed both by the native SignalAI chatbot and by external AI agents.

The important architectural decision is that the SignalAI chatbot should **not** have a separate set of chatbot-specific business functions. It should use the same MCP tools that SignalAI makes available externally. This creates one capability contract, one authorization model, one validation path, and one implementation for both experiences.

### Product model

A creator can interact with SignalAI in two ways:

1. **Inside SignalAI:** use the native SignalAI chatbot to manage automations, leads, analytics, conversations, content and other supported capabilities.
2. **Outside SignalAI:** connect SignalAI's MCP server to an external AI agent or MCP-compatible client and manage the same capabilities from that agent.

Conceptually:

```text
                         SignalAI MCP
                      Agent Capability Layer
                              │
                 ┌────────────┴────────────┐
                 │                         │
          SignalAI Chatbot           External AI Agents
          inside SignalAI             ChatGPT / Claude /
                 │                    custom agents / n8n
                 └────────────┬────────────┘
                              ▼
                    SignalAI Application
                         Services
                              │
             ┌──────────────┼──────────────┐
             ▼              ▼              ▼
        Automations       Leads         Analytics
             │              │              │
             ├──────────────┼──────────────┤
             ▼              ▼              ▼
       Conversations      Content       Campaigns
                              │
                              ▼
                     SignalAI Core Platform
```

AG-UI can be used on the native SignalAI chatbot side for streaming, tool progress, structured interactions and approval flows. MCP provides the reusable capability interface. External clients can consume MCP directly without needing AG-UI.

### Why use the same MCP internally and externally?

This avoids building and maintaining two capability systems. If SignalAI adds a tool such as `create_automation_draft`, the same capability can be used by:

- the SignalAI chatbot;
- an external MCP-compatible AI client;
- future agent integrations;
- custom creator workflows and automation platforms.

This also makes behavior consistent: authorization, validation, error handling, auditability and domain rules should be identical regardless of where the request originated.

### MCP should sit above SignalAI application services

MCP tools must **not** directly manipulate the database or bypass existing domain services.

The intended request path is:

```text
MCP tool
   ↓
Authentication / workspace resolution
   ↓
Authorization
   ↓
SignalAI application service
   ↓
Domain validation / business rules
   ↓
Database and external integrations
```

For example, `publish_automation` should use the same publication service and journey validation used by the SignalAI UI. The MCP layer is an interface for agents, not a second business-logic implementation.

### Recommended MCP capability groups

#### Automations

- `list_automations`
- `get_automation`
- `create_automation_draft`
- `update_automation`
- `validate_automation`
- `publish_automation`
- `pause_automation`
- `delete_automation`

#### Leads / CRM

- `search_leads`
- `get_lead`
- `update_lead`
- `add_lead_tag`
- `remove_lead_tag`

#### Conversations

- `search_conversations`
- `get_conversation`
- `summarize_conversation`
- `draft_reply`

#### Analytics

- `get_lead_metrics`
- `get_campaign_metrics`
- `get_automation_metrics`
- `get_conversion_metrics`

#### Content

- `list_content`
- `create_content_draft`
- `update_content`
- `get_content_performance`

The exact tool set should be driven by real creator workflows. Avoid exposing a giant generic `createEverything` or `deleteEverything` tool because narrow, typed tools are easier to authorize, validate, test and audit.

### Draft → validate → approve → execute

Agent access must distinguish between analysis/drafting and side effects.

For example, avoid:

```text
create_and_publish_automation
```

Prefer:

```text
create_automation_draft
        ↓
validate_automation
        ↓
show impact / proposed changes
        ↓
explicit creator approval
        ↓
publish_automation
```

This is particularly important for publishing journeys, sending messages, bulk lead changes, deleting resources, and changing live automation behavior.

### Permission tiers

A future MCP authorization model should separate capabilities into tiers:

| Tier | Examples |
|---|---|
| Read | Analytics, leads, conversations, list/get automations |
| Draft | Automation drafts, content drafts, reply drafts |
| Write | Modify leads, update automation configuration |
| Execute | Publish, send campaigns/DMs, delete/pause, bulk updates |

The MCP server should enforce permissions server-side. An agent must never be able to elevate its own permission by changing a tool argument.

## 4. AG-UI + MCP architecture

AG-UI and MCP should be treated as complementary rather than competing technologies.

```text
                         SignalAI
                            │
             ┌──────────────┴──────────────┐
             │                             │
      SignalAI Chatbot              External AI Agents
             │                             │
           AG-UI                           MCP
             │                             │
             └──────────────┬──────────────┘
                            ▼
                    SignalAI MCP / Agent
                    Capability Layer
                            │
                    Application Services
                            │
             ┌──────────────┼──────────────┐
             ▼              ▼              ▼
          Leads       Automations      Analytics
             │              │              │
             └──────────────┼──────────────┘
                            ▼
                     Core SignalAI
```

The native chatbot can use AG-UI for the **interaction experience**, while MCP provides the **tool/capability contract**. External agents can skip AG-UI and use MCP directly.

This keeps the native UI free to evolve independently while making SignalAI capabilities reusable outside the SignalAI application.

### Example end-to-end flow

Creator asks the SignalAI chatbot:

> Create an automation that replies to anyone who comments COURSE, asks what they are interested in, captures their email, and tags them as a course lead.

Possible flow:

```text
Creator
  ↓
SignalAI Chatbot
  ↓ AG-UI
Agent
  ↓ MCP
create_automation_draft
  ↓
SignalAI application service
  ↓
journey schema + semantic validation
  ↓
Draft returned to agent/UI
  ↓
Creator reviews proposed journey
  ↓
explicit approval
  ↓ MCP
publish_automation
  ↓
existing SignalAI publish/runtime path
```

The exact same flow can be initiated by an external MCP client. The only difference is the client through which the creator interacts with the agent.

### Agent-driven product flywheel

Once the MCP capability layer exists, SignalAI can support a powerful closed loop:

```text
Analyze performance
      ↓
Identify opportunity/problem
      ↓
Propose automation/content/follow-up
      ↓
Validate expected impact
      ↓
Creator approval
      ↓
Execute
      ↓
Measure results
      ↓
Analyze again
```

For example:

> My COURSE automation generated 120 leads but only 8 conversions. Find the likely drop-off and propose a follow-up automation for leads who asked about pricing but did not purchase.

The agent can use analytics, leads and conversations to investigate, create a draft, validate it and request approval before changing live behavior.

## 5. Security and reliability requirements

Before production, the implementation must meet these requirements:

1. **Authentication and authorization:** authenticate each run and verify the current user's workspace membership and permissions.
2. **Tenant isolation:** every lead, conversation, metric, and journey query must be scoped server-side to the authorized workspace.
3. **Tool allowlist:** expose only explicit, typed tools. Validate input schemas and outputs; treat model output as untrusted.
4. **Approval for side effects:** sending DMs, publishing journeys, changing live automation settings, or bulk-modifying leads must not happen merely because the model emitted an event. The backend must verify explicit approval and authorization.
5. **Idempotency:** side-effecting operations need stable idempotency keys and duplicate-request handling.
6. **Run/thread handling:** correlate events to the correct user, thread, and run. Avoid cross-user event delivery.
7. **Streaming lifecycle:** handle cancellation, timeouts, disconnects, errors, and incomplete streams. Do not leave UI loading states stuck.
8. **Persisted state boundaries:** an unsaved journey proposal must not change the persisted journey. Explicit Save and Publish actions must retain their existing semantics.
9. **Auditability:** record relevant action proposals, approvals, execution outcomes, and actor/workspace identifiers without logging secrets or unnecessarily sensitive message content.
10. **Rate and cost controls:** apply per-workspace limits, bounded tool execution, request timeouts, and model usage tracking.
11. **External MCP authorization:** external clients must receive scoped credentials or authorization grants that identify the SignalAI workspace and permitted capability tier. Do not expose long-lived master credentials to agents.
12. **Revocation:** creators must be able to revoke an external MCP connection independently of their SignalAI login session.

AG-UI and MCP do not automatically supply these application-specific controls.

## 6. Proof-of-concept scope

### In scope

- Add an isolated AI copilot panel to the existing dashboard.
- Use one supported AG-UI client/integration and a compatible backend adapter.
- Add one read-only MCP-backed domain tool, such as `getCampaignAnalytics` or `searchLeads`.
- Stream assistant text and lifecycle events.
- Display a loading/progress state, structured result, and actionable error state.
- Authenticate requests and scope the tool to the current workspace.
- Include unit tests for event handling, tool input validation, authorization, and failures.
- Confirm that the same MCP tool can be invoked by an external MCP client in a development environment.

### Out of scope

- Rebuilding or replacing the journey editor.
- Replacing existing SignalAI API endpoints or automation runtime.
- Automatically sending messages, publishing journeys, or mutating live configuration.
- Building a multi-agent architecture or introducing A2A without a concrete need.
- Adopting every AG-UI feature before a user-facing use case has been validated.
- Exposing unrestricted production write/execute capabilities to external MCP clients during the initial POC.

### Suggested acceptance criteria

- A user can ask an analytics question and receives a streamed response.
- The UI reliably handles completion and error events without remaining in a loading state.
- Tool data is restricted to the authenticated workspace, including attempts to request another workspace's IDs.
- The UI clearly distinguishes facts returned by tools from AI-generated interpretation.
- Tool and model failures produce a recoverable, understandable state.
- No existing journey or automation behavior changes as a side effect of enabling the copilot.
- The proof of concept can be disabled without affecting core SignalAI workflows.
- The native chatbot and an external MCP client receive equivalent results for the same authorized read operation.

## 7. Implementation phases

### Phase 0 — Validate compatibility and MCP boundary

- Inspect the current app routing, API conventions, authentication and workspace scoping.
- Determine where agent execution should live and which runtime/model provider to use.
- Review current AG-UI and MCP SDK versions and official documentation.
- Define the SignalAI MCP server boundary and authentication model.
- Identify application services that MCP tools should call instead of database repositories directly.
- Choose a minimal, maintainable AG-UI client integration for the native chatbot.
- Confirm event transport, deployment compatibility, logging, cancellation and timeouts.

**Deliverable:** a short design decision record and a runnable isolated example. No production write/execute behavior changes.

### Phase 1 — Read-only MCP + native copilot

- Implement the SignalAI MCP server with authenticated, read-only tools.
- Implement the native SignalAI chatbot using those same MCP capabilities.
- Return AG-UI-compatible events through the selected native-chat adapter.
- Add a small React panel and event-state handling.
- Add tests for authorization, tool schemas, workspace isolation, streaming lifecycle and recoverable failures.
- Validate one external MCP client against the same read-only tool.

**Exit decision:** continue only if the MCP boundary is reusable, the prototype is useful, and the adapter fits the stack without excessive complexity.

### Phase 2 — Draft and approval flows

- Add conversation summaries and follow-up drafts.
- Add automation/content draft tools.
- Add explicit review/approval UI for side-effecting actions in the native chatbot.
- Re-check authorization, current state and approval on the server at execution time.
- Add idempotency and audit events.
- Define external MCP permission scopes and connection/revocation UX.
- Do not change the current journey Save/Publish flow without a separate design decision.

### Phase 3 — Natural-language journey proposals

- Map an agent-produced journey proposal into the existing journey schema.
- Run schema and semantic validation.
- Show validation errors in the existing journey editor.
- Load proposals as unsaved state and preserve explicit Save/Publish behavior.
- Test invalid graphs, unsupported node types, stale versions and navigation with unsaved changes.
- Expose journey drafting through MCP so the same capability works in the native chatbot and externally.

### Phase 4 — Full agent-accessible SignalAI platform

Subject to security and product validation, expand the MCP surface to:

- Automations
- Leads / CRM
- Conversations
- Analytics
- Content
- Campaigns
- Reporting

Add fine-grained permissions, rate limits, usage metering, audit logs, connection management and developer documentation for external MCP clients.

## 8. Alternatives and trade-offs

| Approach | Advantages | Trade-offs | Best fit |
|---|---|---|---|
| Existing bespoke SSE/HTTP contract | Minimal new dependencies; direct control | SignalAI owns event conventions, lifecycle, tool-call and approval contracts | One simple streaming assistant |
| AG-UI + SignalAI MCP | Standardized agent/client interaction plus reusable capability layer | More integration work and protocol/version management | Native copilot plus external agent ecosystem |
| Higher-level client such as CopilotKit with AG-UI support + MCP | More ready-made copilot UI and integrations | Additional framework conventions and dependencies; more moving parts | Team wants a richer native copilot experience quickly |
| Separate native chatbot tools and external MCP tools | Potentially simple initial implementation | Duplicated business logic, inconsistent permissions and behavior, higher maintenance cost | Not recommended for SignalAI |

The preferred direction is **one SignalAI capability layer exposed through MCP**, with AG-UI used where the native SignalAI chatbot benefits from richer agent/user interaction. Do not select protocols solely because they are standards; validate their integration cost against the actual product workflows.

## 9. Decision

**Proposed decision:** build the SignalAI MCP capability layer alongside a focused AG-UI/native-chat proof of concept.

The MCP layer should become the reusable interface through which both the native SignalAI chatbot and external AI agents access SignalAI capabilities. Start read-only, then add draft and approval flows before enabling production side effects.

Adopt AG-UI more broadly only if:
- the existing agent runtime has a healthy integration path;
- the event abstraction meaningfully reduces custom frontend/backend glue;
- the native UX needs streaming, tool progress, structured results or interrupt/approval flows;
- security and state boundaries can be preserved;
- the benefits outweigh the cost of an additional abstraction and dependency.

Expand MCP more broadly only if:
- workspace isolation and scoped external authorization are proven;
- application services provide stable domain boundaries for tools;
- side-effecting operations have reliable approval, idempotency and audit behavior;
- external agent usage provides meaningful creator value.

The core SignalAI differentiator remains dependable lead capture, creator-friendly automation, CRM context and measurable conversion—not protocol adoption itself.

## 10. References

- [AG-UI repository](https://github.com/ag-ui-protocol/ag-ui)
- [AG-UI official documentation](https://docs.ag-ui.com/)
- [Application quickstart](https://docs.ag-ui.com/quickstart/applications)
- [Events reference in the repository](https://github.com/ag-ui-protocol/ag-ui/blob/main/docs/concepts/events.mdx)
- [Human-in-the-loop interrupts reference](https://github.com/ag-ui-protocol/ag-ui/blob/main/docs/concepts/interrupts.mdx)
- [Model Context Protocol](https://modelcontextprotocol.io/)

Verify the latest SDK, framework adapter and event schema documentation when implementing. This proposal records a recommended direction, not a guarantee that every listed feature is supported by every adapter.
