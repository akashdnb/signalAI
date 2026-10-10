---
title: AI Replies
slug: ai-automation
group: AI
description: Use AI-generated responses for natural conversations while keeping goals, business context, and fallback clear.
order: 7
related: knowledge, goals-and-fields, inbox-and-handoff, preview-test-publish
---

## How AI replies work

When a journey uses AI-generated reply mode, SignalAI generates a response to the incoming message using the journey's configured behavior and available context. A default reply remains configured as the fail-closed fallback when AI generation cannot be used.

- Trigger settings decide which activity enters the journey.
- Reply configuration sets the default response, tone, language, and whether the knowledge base may be used.
- Goals describe the qualification outcome and structured information to capture.
- Inbox shows the conversation and whether a reply was AI-generated, rule-based, or sent by a teammate.

## Configure AI behavior

1. Open the journey's Details tab.
2. Under Reply Settings, select AI-generated.
3. Write a short, safe default fallback reply.
4. Under AI Behaviour, choose the tone and language appropriate for your audience.
5. Enable knowledge-base context only when the uploaded documents are current and relevant.
6. Save changes.

The Builder's message inspector also exposes reply text, AI behavior/tone, and knowledge-base context. Make a small change, save it, and preview the response before changing several settings together.

## Write useful qualification goals

AI should have an observable business goal, not just a vague instruction to chat. For example: identify whether the person wants to buy or rent, capture their location, and collect a contact number only when needed for follow-up.

- Ask for the minimum useful information.
- Use context already provided in the conversation.
- Avoid asking for the same field again after it has been captured.
- Use human handoff for sensitive, high-value, uncertain, or negotiation-heavy conversations.

## Review AI quality

1. Preview common questions and edge cases.
2. Check that factual answers agree with your business information.
3. Check that the fallback is understandable and safe.
4. Run a real test on the connected Instagram account.
5. Review the conversation timeline in Inbox and captured facts on the lead.

## Best practices

- Write instructions around the goal, audience, tone, boundaries, and what to do when information is unknown.
- Keep knowledge facts in the Knowledge Base and behavior requirements in AI instructions/settings.
- Never rely on AI to invent a price, policy, availability, or guarantee; keep source information accurate.
- Use short, conversational questions and let users answer naturally.
- Define when a human should take over, and inspect real conversations after launch.
- Measure qualified leads and extraction accuracy, not only message volume.

## If the answer is weak or a fallback appears

Check reply mode and default fallback, then verify whether knowledge context is enabled and source documents are Ready. Review the full thread before changing goals; the problem may be missing trigger context or a goal that asks for too much.
