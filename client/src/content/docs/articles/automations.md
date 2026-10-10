---
title: Automations
slug: automations
group: Automations
description: Manage keyword-triggered journeys and control how SignalAI responds to Instagram activity.
order: 4
related: triggers-and-keywords, rule-based-automation, journey-builder, rich-media-messages, beta-scope
---

## Journey lifecycle

A journey combines trigger settings, reply behavior, and optional qualification goals. In Automation, the journey list shows its name, trigger, status, and last-updated time. Open a row to edit or inspect its configuration.

- **Active:** the journey is enabled to respond when its configured conditions match.
- **Inactive:** the journey is disabled and should not be treated as an active workflow.
- **Publish:** makes a saved Builder version active. Publishing and enabling are different controls; check both the version and Active/Inactive state.

## Find a journey

1. Open Automation → Journeys.
2. Search by journey name or filter by status and trigger type.
3. Use the sort menu to order journeys by update time or name.
4. Open the journey to edit or inspect it.

Use names that make trigger and intent easy to identify. For example, Course Brochure — Comment is clearer than Journey 4.

## Understand the journey tabs

- **Builder:** configure the visual sequence, message nodes, and goal blocks. Open a message node's editor and choose **Instagram layout** to create text with buttons, a card, a gallery/carousel, or quick replies. See [Rich Media Messages](/docs/rich-media-messages).
- **Details:** configure name, description, enabled state, trigger, reply mode, reply channel, templates, campaign-level CTA link, AI behavior, post targeting, and milestones.
- **Analytics:** inspect matched activity, leads, funnel indicators, and milestone drop-off.
- **Leads:** view leads associated with the journey.
- **Versions:** in the current beta, this is informational and does not provide a full version-history or rollback experience.

## Campaign CTA versus a message-node layout

The optional **CTA Link** under Details configures the campaign-level call to action. It is not the editor for a rich layout on an individual step. To add several buttons, a card, a gallery, or quick replies to a particular step, edit that message node in **Builder → Instagram layout**. Read [Rich Media Messages](/docs/rich-media-messages) for the full workflow.

## Best practices

- Give each journey one primary job and a name that states that job.
- Keep keywords, post targeting, reply channel, and audience intent aligned.
- Test changes before publishing, then verify the real Instagram loop.
- Disable a journey to stop it from responding temporarily; do not assume publishing alone makes an inactive journey live.
- Review Inbox and lead outcomes regularly so you can improve the flow based on real conversations.

## Current beta limitations

Some Automation tabs and Builder node types are marked as coming soon. The Current Beta Scope guide lists these limitations so you don't plan a critical workflow around a control that is not yet usable.
