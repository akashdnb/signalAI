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
| MCP | Agent ↔ tools and external data | Give an agent controlled access to lead or analytics tools, if useful |
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

## 3. Recommended architecture

Keep AG-UI at the copilot boundary. Existing SignalAI services remain the source of truth.

```text
SignalAI dashboard (React / TypeScript)
  ├── Existing lead, inbox, analytics pages
  ├── Existing React Flow journey builder
  └── Optional AI copilot panel
             │
             │ AG-UI-compatible event stream
             ▼
      Authenticated copilot endpoint
             │
             ▼
      Agent / orchestration layer
        ├── Read-only lead search tool
        ├── Read-only analytics tool
        ├── Follow-up draft tool
        └── (Later) journey proposal tool
             │
             ▼
      Existing domain services and database

Existing automation runtime remains independent:
Instagram/webhooks → automation execution → lead/conversation persistence
                         └─ retry, scheduling, sending and publishing
```

The diagram is conceptual. Exact package placement, endpoint design, and agent framework must be decided after inspecting the active frontend/backend architecture and the selected AG-UI adapter.

### Boundary rules

- AG-UI is an interaction protocol, not a replacement for existing API/domain contracts.
- Do not make runtime automation execution depend on a browser session or an AG-UI stream.
- Keep journey drafts separate from persisted/published journeys.
- Keep tool implementations on the server; do not expose privileged credentials to the browser.
- Use the authenticated user's workspace/tenant context from the server, not from model-generated tool arguments alone.
- Use an adapter layer so agent framework choices can evolve without leaking framework-specific event models through the whole application.

## 4. Security and reliability requirements

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

AG-UI does not automatically supply these application-specific controls.

## 5. Proof-of-concept scope

### In scope

- Add an isolated AI copilot panel to the existing dashboard.
- Use one supported AG-UI client/integration and a compatible backend adapter.
- Add one read-only tool, such as `getCampaignAnalytics` or `searchLeads`.
- Stream assistant text and lifecycle events.
- Display a loading/progress state, structured result, and actionable error state.
- Authenticate requests and scope the tool to the current workspace.
- Include unit tests for event handling, tool input validation, authorization, and failures.

### Out of scope

- Rebuilding or replacing the journey editor.
- Replacing existing SignalAI API endpoints or automation runtime.
- Automatically sending messages, publishing journeys, or mutating live configuration.
- Building a multi-agent architecture or introducing MCP/A2A without a concrete need.
- Adopting every AG-UI feature before a user-facing use case has been validated.

### Suggested acceptance criteria

- A user can ask an analytics question and receives a streamed response.
- The UI reliably handles completion and error events without remaining in a loading state.
- Tool data is restricted to the authenticated workspace, including attempts to request another workspace's IDs.
- The UI clearly distinguishes facts returned by tools from AI-generated interpretation.
- Tool and model failures produce a recoverable, understandable state.
- No existing journey or automation behavior changes as a side effect of enabling the copilot.
- The proof of concept can be disabled without affecting core SignalAI workflows.

## 6. Implementation phases

### Phase 0 — Validate compatibility

- Inspect the current app routing, API conventions, authentication and workspace scoping.
- Determine where agent execution should live and which runtime/model provider to use.
- Review current AG-UI SDK versions, adapters and framework support directly from official docs.
- Choose a minimal, maintainable client integration; compare using AG-UI directly with adopting a higher-level client such as CopilotKit.
- Confirm event transport, deployment compatibility, logging, cancellation and timeouts.

**Deliverable:** a short design decision record and a runnable isolated example. No production behavior changes.

### Phase 1 — Read-only copilot

- Implement an authenticated endpoint and a single read-only domain tool.
- Return AG-UI-compatible events through the selected adapter.
- Add a small React panel and event-state handling.
- Add tests for authorization, tool schemas, streaming lifecycle and recoverable failures.
- Demo using representative data and evaluate user usefulness.

**Exit decision:** continue only if the prototype is useful and the adapter fits the stack without excessive complexity.

### Phase 2 — Draft and approval flows

- Add conversation summaries and follow-up drafts.
- Add explicit review/approval UI for side-effecting actions.
- Re-check authorization, current state and approval on the server at execution time.
- Add idempotency and audit events.
- Do not change the current journey Save/Publish flow without a separate design decision.

### Phase 3 — Natural-language journey proposals (optional)

- Map an agent-produced journey proposal into the existing journey schema.
- Run schema and semantic validation.
- Show validation errors in the existing journey editor.
- Load proposals as unsaved state and preserve explicit Save/Publish behavior.
- Test invalid graphs, unsupported node types, stale versions and navigation with unsaved changes.

## 7. Alternatives and trade-offs

| Approach | Advantages | Trade-offs | Best fit |
|---|---|---|---|
| Existing bespoke SSE/HTTP contract | Minimal new dependencies; direct control | SignalAI owns event conventions, lifecycle, tool-call and approval contracts | One simple streaming assistant |
| AG-UI protocol with a compatible client | Standardized agent/client event contract; clearer path to richer interactions | Adapter/version compatibility, event lifecycle and integration learning | Copilot expected to grow across several workflows |
| Higher-level client such as CopilotKit with AG-UI support | More ready-made copilot UI and integrations | Additional framework conventions and dependencies; not just the protocol | Team wants a richer copilot experience quickly |

Do not select AG-UI solely because it is a standard. Compare it with a small bespoke stream for the first use case and choose the option with the lowest long-term complexity.

## 8. Decision

**Proposed decision: run a Phase 0/Phase 1 proof of concept; do not commit to full adoption yet.**

Adopt AG-UI more broadly only if:
- the existing agent runtime has a healthy integration path;
- the event abstraction meaningfully reduces custom frontend/backend glue;
- the UX needs streaming, tool progress, structured results or interrupt/approval flows;
- security and state boundaries can be preserved;
- the benefits outweigh the cost of an additional abstraction and dependency.

The core SignalAI differentiator remains dependable lead capture, creator-friendly automation, CRM context and measurable conversion—not protocol adoption itself.

## 9. References

- [AG-UI repository](https://github.com/ag-ui-protocol/ag-ui)
- [AG-UI official documentation](https://docs.ag-ui.com/)
- [Application quickstart](https://docs.ag-ui.com/quickstart/applications)
- [Events reference in the repository](https://github.com/ag-ui-protocol/ag-ui/blob/main/docs/concepts/events.mdx)
- [Human-in-the-loop interrupts reference](https://github.com/ag-ui-protocol/ag-ui/blob/main/docs/concepts/interrupts.mdx)

Verify the latest SDK, framework adapter and event schema documentation when implementing. This proposal records a recommended direction, not a guarantee that every listed feature is supported by every adapter.
