---
title: Journey Builder
slug: journey-builder
group: Journey Builder
description: Configure the trigger, reply, and goal sequence in the visual Builder.
order: 9
related: goals-and-fields, rich-media-messages, preview-test-publish, automations, beta-scope
---

## Open the Builder

1. Open Automation → Journeys.
2. Select the journey you want to work on.
3. Stay on the Builder tab to inspect or configure the visual flow.

The Builder presents a canvas and opens node configuration in a dialog. On the journey header, the other tabs are Details, Analytics, Leads, and Versions.

## Understand the current node types

- **Trigger:** chooses the Instagram event type and keyword behavior.
- **AI Reply / Send Message:** configures a message step. The dialog's **Instagram layout** tab supports plain text, text with buttons, a single card, a gallery/carousel, and quick replies. See [Rich Media Messages](/docs/rich-media-messages).
- **Goal:** names a conversational qualification checkpoint and the fields it should capture.
- **Send Link:** uses the CTA link configured in Details when the action is present.
- **Condition, Delay, and a separate Handoff flow node:** shown as coming soon in the current beta.

The node picker may show both AI Reply and Send Message, but both open the current message configuration. Use Reply Mode in Details to choose AI-generated or fixed-template behavior. Rich-message presentation is set per message node in the Builder.

## Edit a node

1. Select the node on the canvas.
2. Use its configuration dialog to review current values.
3. Make a focused change and save it using the dialog's Save action where provided.
4. Check the Builder's save indicator before moving on.

For goals, you can change the title, choose captured fields, create a field definition, and reorder goals. Avoid removing a goal that is still part of the qualification flow.

## Create an interactive Instagram message

1. Select the message node that should send the interactive content.
2. In its dialog, open **Instagram layout** and select **Text + buttons**, **Single card**, **Gallery / carousel**, or **Quick replies**.
3. Configure the copy and content. Cards support a title, optional subtitle, optional public HTTPS image URL, and optional actions.
4. For a **Continue journey** button or quick reply, connect the message node to its destination node on the canvas first. Select that destination in the interaction's Journey destination field.
5. Save in the message dialog. This stages the change in the Builder draft; it does not yet persist the journey.
6. Use the Builder's explicit **Save** action to persist the graph, then **Publish** when you are ready to make that version active.

For button/quick-reply configuration limits and examples, see [Rich Media Messages](/docs/rich-media-messages).

## Use Details for journey-wide settings

Details contains the journey name and description, active state, trigger type and keywords, reply mode and channel, default reply and variations, campaign-level CTA link, AI tone and language, knowledge-base toggle, post targeting, and milestone configuration. Campaign-level CTA links and per-node rich layouts are separate settings.

## Save versus publish

Saving preserves configuration changes; publishing makes the selected Builder version active. Publishing the journey requires a saved Builder version. The existing published journey remains active until the new version is published.

After publishing, verify whether the journey is Active or Inactive. Publishing alone is not a substitute for enabling a journey.

## Best practices

- Keep the flow linear and readable while condition branching is unavailable.
- Connect each postback button or quick reply to the intended outgoing node before configuring its destination.
- Use goal names that describe a specific outcome, not vague labels such as Step 1.
- Make a small configuration change, save it, and preview it before making the next change.
- Confirm the version and save indicator before publishing.
- Record major changes in your team's notes until a richer version-history and rollback experience is available.

## Current beta limitations

The Current Beta Scope guide lists node types and tabs that are placeholders, so you can design around supported controls rather than assuming every visible item is ready.
