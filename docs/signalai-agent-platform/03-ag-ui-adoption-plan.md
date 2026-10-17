# 03 — AG-UI Adoption Plan

## Goal

Introduce a native SignalAI copilot without creating a second business-logic stack. The copilot should use the same capability layer exposed to MCP and other internal callers.

## Interaction model

```text
User
  |
SignalAI UI
  |
AG-UI event stream
  |
Agent / Orchestrator
  |
Capability Layer
  |
Domain services / jobs / connectors
```

The copilot is responsible for interpreting intent, planning multi-step work, asking for missing information, presenting progress, and requesting confirmation when a write requires approval.

The capability layer remains responsible for validation and execution.

## First useful copilot capabilities

### Read and explain

- summarize leads
- explain automation status
- inspect journey configuration
- explain campaign/automation metrics
- find a conversation or lead

### Research

- research a company
- research a person
- identify signals
- summarize a prospect
- explain why a prospect was scored highly

### Draft

- draft an automation
- draft a prospect list
- draft outreach
- prepare a campaign

### Approved actions

Only after the draft/approval experience is stable:

- save/publish automation
- create campaign
- send outreach
- pause campaign
- send a message

## Event model

AG-UI should expose useful intermediate states rather than making the interface appear frozen during agent work.

Useful event categories include:

- run started
- planning started/completed
- capability started
- capability completed
- job started
- job progress
- clarification requested
- approval requested
- draft updated
- validation error
- final result
- run failed/cancelled

Long-running research should use the Job abstraction and stream job progress through AG-UI.

## Copilot safety UX

The user must be able to distinguish:

- information the system found
- inference or scoring
- a proposed change
- a change already executed

For consequential actions, the UI should show what will happen before asking for confirmation. The confirmation should map to an explicit capability/action, not merely a generic “continue” button.

## Automation example

```text
User: Create an automation that alerts me when deployment cost is abnormal.

Agent:
  1. understands intent
  2. asks for missing threshold/frequency if required
  3. creates draft
  4. validates draft
  5. presents trigger, condition, action and frequency
  6. user approves
  7. existing save/publish path persists it
```

This preserves the Builder's explicit-save model and prevents AI actions from bypassing product safeguards.

## Anti-AI UI requirement

The copilot should not introduce a generic “AI chat everywhere” visual treatment. It should use the established SignalAI design system, existing components, and task-specific interaction patterns. Before creating new UI components, search the SignalAI component registry and configured shadcn/community sources and reuse suitable patterns.

## Adoption sequence

1. Capability foundation.
2. Read-only copilot.
3. Research copilot.
4. Drafting workflows.
5. Approval-aware actions.
6. Multi-step autonomous workflows with visible progress and recoverability.

AG-UI should be treated as an interaction layer, not as the source of truth for state or business rules.
