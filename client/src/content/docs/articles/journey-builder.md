---
title: Automation Flow
slug: journey-builder
group: Automation
description: Configure the trigger, reply, and goal sequence in the visual Flow builder.
order: 9
related: goals-and-fields, rich-media-messages, preview-test-publish, automations, beta-scope
---

## Open Flow

1. Open **Automation**.
2. Select the automation you want to work on.
3. Stay on the **Flow** tab to inspect or configure the visual path.

The Flow presents a canvas and opens node configuration in a dialog. The automation header also provides **Setup**, **Results**, and **Leads**.

## Understand the current node types

- **Trigger:** chooses the Instagram event type and keyword behavior.
- **AI Reply / Send Message:** configures a message step. The dialog's **Instagram layout** tab supports plain text, text with buttons, a single card, a gallery/carousel, and quick replies. See [Rich Media Messages](/docs/rich-media-messages).
- **Goal:** names a conversational qualification checkpoint and the fields it should capture.
- **Send Link:** uses the CTA link configured in Setup when the action is present.
- **Condition, Delay, and a separate Handoff flow node:** shown as coming soon in the current beta.

The node picker may show both AI Reply and Send Message, but both open the current message configuration. Use Reply Mode in Setup to choose AI-generated or fixed-template behavior. Rich-message presentation is set per message node in Flow.

## Edit a node

1. Select the node on the canvas.
2. Use its configuration dialog to review current values.
3. Make a focused change and save it using the dialog's Save action where provided.
4. Check the Flow's save indicator before moving on.

For goals, you can change the title, choose captured fields, create a field definition, and reorder goals. Avoid removing a goal that is still part of the qualification flow.

## Create an interactive Instagram message

1. Select the message node that should send the interactive content.
2. In its dialog, open **Instagram layout** and select **Text + buttons**, **Single card**, **Gallery / carousel**, or **Quick replies**.
3. Configure the copy and content. Cards support a title, optional subtitle, optional public HTTPS image URL, and optional actions.
4. For a **Continue automation** button or quick reply, connect the message node to its destination node on the canvas first. Select that destination in the interaction's Automation destination field.
5. Save in the message dialog. This stages the change in the Flow draft; it does not yet persist the automation.
6. Use the Flow's explicit **Save** action to persist the graph, then **Publish** when you are ready to make that version active.

For button/quick-reply configuration limits and examples, see [Rich Media Messages](/docs/rich-media-messages).

## Use Setup for automation-wide settings

Setup contains the automation name and description, active state, trigger type and keywords, reply mode and channel, default reply and variations, campaign-level CTA link, AI tone and language, knowledge-base toggle, post targeting, and goal configuration. Campaign-level CTA links and per-node rich layouts are separate settings.

## Save versus publish

Saving preserves configuration changes; publishing makes the selected Flow version active. Publishing the automation requires a saved Flow version. The existing published version remains active until the new version is published.

After publishing, verify whether the automation is **Live** or **Paused**. Publishing alone is not a substitute for activation.

If you make changes and navigate away, Flow asks whether to save or discard the unsaved draft. Choosing discard restores the last saved graph; choosing save persists the draft before navigation.

## Best practices

- Keep the flow linear and readable while condition branching is unavailable.
- Connect each postback button or quick reply to the intended outgoing node before configuring its destination.
- Use goal names that describe a specific outcome, not vague labels such as Step 1.
- Make a small configuration change, save it, and preview it before making the next change.
- Confirm the version and save indicator before publishing.
- Record major changes in your team's notes until a richer version-history and rollback experience is available.

## Current beta limitations

The Current Beta Scope guide lists node types and controls that are placeholders, so you can design around supported controls rather than assuming every visible item is ready.
