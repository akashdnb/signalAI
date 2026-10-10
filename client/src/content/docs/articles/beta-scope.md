---
title: Current Beta Scope
slug: beta-scope
group: About the beta
description: Supported workflows and visible limitations in the current SignalAI beta.
order: 17
related: journey-builder, preview-test-publish, troubleshooting
---

> **Beta note:** This page describes the current UI and avoids promising controls that are visibly marked as coming soon or are still informational.

## Available workflows

- Connect an Instagram professional account through Meta authorization.
- Create, search, filter, sort, enable, and disable journeys.
- Trigger journeys from comments, DMs, or both using configured keywords.
- Configure AI-generated or rule-based replies, reply channel, default template, optional variations, CTA link, tone, language, knowledge-base context, and post targeting.
- Upload PDF, text, and Markdown knowledge documents and inspect processing status.
- Use the Builder's trigger, reply, goal, preview, Test Journey, and publish controls.
- Review Inbox conversations, take over for a human reply, and use the lead pipeline, captured facts, tags, notes, ownership, and available deal or lead-intelligence controls.

## Visible limitations

- The Automation-level Templates, Keywords, Quick Replies, Handoff Rules, and Settings tabs are placeholders marked as coming soon.
- Condition, Delay, and a separate Handoff node are disabled in the Builder's Add node menu.
- The goal dialog's Validation and Success Message tabs currently show that no configuration is present; they do not provide editable rules or message controls.
- The Versions tab is a placeholder for a fuller draft/published snapshot history experience; do not rely on it for rollback.
- Importing journeys is not available.

Human takeover is available in conversation and lead workflows even though a separate Handoff node is not yet available in the Builder canvas.

## Work around limitations safely

- Keep the first journey linear and focused while condition branching is unavailable.
- Use clear goal wording and a small number of captured fields instead of depending on custom validation.
- Use Inbox for human ownership and follow-up rather than expecting to add a separate handoff node to the graph.
- Keep notes on important published changes until the richer version-history experience is available.

## Best practices

- Design journeys around controls that are available today, not around placeholders in the UI.
- Confirm the current scope before promising a workflow to a customer.
- Prefer a small, observable pilot and collect feedback before designing a complex journey.
- Re-check this page when the product ships new nodes or configuration options; update the article in the same PR as the feature where possible.

## Distinguish simulation from production

Preview and Test Journey help inspect reply behavior and the goal sequence, but neither proves that a real Instagram event will be delivered. Always test with the connected Instagram account before relying on the workflow.
