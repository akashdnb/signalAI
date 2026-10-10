---
title: Preview, Test & Publish
slug: preview-test-publish
group: Journey Builder
description: Check replies and the qualification path before a journey handles real Instagram traffic.
order: 11
related: journey-builder, rich-media-messages, troubleshooting, quick-start
---

## Preview one message

1. Open a journey and select Preview.
2. Enter a representative comment or DM in the sample field.
3. Run the preview and compare rule-based and AI-generated results.
4. Look for fallback explanations or a human-handoff signal, then revise configuration if needed.

Preview simulates an Instagram DM with sample text. It helps inspect response behavior without sending that sample to an actual Instagram user. A preview or Test Journey walkthrough is not proof that Instagram will deliver a structured message to a recipient.

## Test a rich media message

Before publishing a message with buttons, cards, a gallery, or quick replies:

- Confirm the intended layout is selected in the message node's **Instagram layout** tab.
- Check all button labels, card titles/subtitles, image URLs, and destination selections.
- For journey interactions, confirm each **Continue journey** button or quick reply points to an outgoing node connected to the same message.
- Ensure website buttons and card images use public HTTPS URLs.
- Save the message dialog, save the Builder draft, and publish the intended version.
- Run a real end-to-end test with a connected professional Instagram account. Tap each button/quick reply and verify the expected journey step is reached.

See [Rich Media Messages](/docs/rich-media-messages) for supported types and limits.

## Test the journey sequence

1. Choose Test Journey in the Builder toolbar or More menu.
2. Start the walkthrough to inspect the trigger and initial reply.
3. Walk through each displayed goal using realistic answers.
4. Check that the sequence reflects the intended order and outcome.

Test Journey is a walkthrough/simulation. It does not create a real lead or prove that a message will be delivered by Instagram.

## Before publishing

- The trigger type and keywords match the intended audience.
- Post targeting includes the correct posts or Reels.
- The reply channel is correct: DM, public comment, or both.
- The default reply is current and works as a safe fallback.
- AI replies use current knowledge where needed.
- Goals capture only the data the team needs.
- Rich-message copy and interaction destinations are valid for the intended step.
- Preview output is accurate for common questions and edge cases.

## Publish the version

1. Confirm the Builder's version has loaded and the save indicator is not showing unsaved changes.
2. Select Publish and review the confirmation.
3. Confirm the version number to publish.
4. After publishing, check the journey header and ensure the journey is Active if it should receive traffic.
5. Run an end-to-end test with the connected Instagram account.

Publishing is separate from the journey's Active/Inactive status. If a journey is inactive, use the More menu to enable it. To stop an active journey temporarily, disable it instead of deleting it.

## Best practices

- Always test both the intended path and at least one non-matching or awkward message.
- Preview changes after saving, then use a real Instagram account to validate delivery.
- Publish when you understand which version is going live and how to disable it if needed.
- Avoid changing trigger, reply, and goals simultaneously; smaller changes are easier to diagnose.
- Keep a short release note for substantial journey changes until full version history is available.

## If publishing fails

Read the error shown in Builder and verify that the version finished loading. Refresh only after confirming whether the latest edits were saved. If the error persists, record the journey name, displayed version, approximate time, and error text for support.
