---
title: Rich Media Messages
slug: rich-media-messages
group: Journey Builder
description: Add Instagram buttons, cards, carousels, and quick replies to a specific automation message step.
order: 10
related: journey-builder, preview-test-publish, rule-based-automation, troubleshooting
---

## What rich media does

A rich media message gives a recipient a tappable choice or a more visual response instead of plain text alone. Configure it on a specific message node in the visual Builder. It is different from the optional campaign-level CTA Link in Details, which is used by the campaign's default reply/Send Link behavior.

## Supported layouts

- **Plain text:** sends the message copy without structured buttons or cards.
- **Text + buttons:** sends message text with up to 3 buttons. Use website buttons to open a URL or **Continue journey** buttons to route a tap to a connected journey node. Button-template text supports up to 640 characters; button labels support up to 20 characters.
- **Single card:** sends one card with a required title, optional subtitle, optional image URL, and optional actions. Card titles and subtitles support up to 80 characters each. A card may have up to 3 buttons.
- **Gallery / carousel:** sends a horizontal set of 1–10 cards. Each card can have a title, optional subtitle, optional image URL, and up to 3 buttons. Gallery mode uses the card titles/subtitles as the card content rather than a separate message caption.
- **Quick replies:** sends message text with up to 13 suggested replies. Message text supports up to 640 characters and each quick-reply label supports up to 20 characters. Each quick reply must be mapped to a connected journey destination.

## Create a rich message

1. Open **Automation → Journeys** and select the journey.
2. In the **Builder** tab, select the message node that should send the rich content. If needed, add/connect the intended outgoing node on the canvas first.
3. In the node dialog, open **Instagram layout**.
4. Select **Text + buttons**, **Single card**, **Gallery / carousel**, or **Quick replies**.
5. Configure the fields for the selected layout. For a card or gallery, provide a title for every card. Add subtitles and images only when they improve the message.
6. For a button or quick reply that should continue the journey, choose **Continue journey** and select the intended node in **Journey destination**. Only nodes connected directly out of the message are offered. Website buttons open a URL and do not route the journey.
7. Save in the message dialog. This stages the message configuration in the Builder draft.
8. Click the Builder's explicit **Save** action to persist the graph. Then use **Publish** to make the saved version active.

If you close the editor without saving its changes, discard them when prompted. Do not navigate away with unsaved Builder changes unless you intend to discard them.

## Configure buttons and quick replies

For each button, select its action:

- **Open website:** enter a valid, publicly reachable HTTPS URL. This opens the destination outside the journey.
- **Continue journey:** select an outgoing destination node. When the recipient taps the button, SignalAI can route the interaction to that connected step.

For each quick reply, enter the label and select a connected destination. A message can offer several choices; each choice should point to the step that matches its intent, such as Pricing, Book a visit, or Talk to a person. The destination must be connected directly from the message node; choosing an unconnected or arbitrary node is not supported.

## Images and URLs

- Use a complete HTTPS URL for website buttons and image URLs.
- Card images must be hosted somewhere Instagram can fetch publicly; a private dashboard URL or local file path won't work.
- Check URLs in a private/incognito browser window to ensure they are accessible without your login.
- Keep images relevant to the card and make sure text remains understandable without relying on the image alone.

## Save, publish, and verify delivery

The message dialog's Save action stages the edit in the local Builder draft. It does not by itself persist the entire journey.

1. Save the message dialog.
2. Click **Save** in the Builder and confirm the unsaved indicator clears.
3. Click **Publish** and confirm the intended version.
4. Verify the journey is Active if it should respond to new activity.
5. Send a real test DM or comment through the connected professional account, then tap each button or quick reply and confirm the intended destination is reached.

Preview and Test Journey help inspect the configured response and flow, but they do not prove Instagram has delivered a real structured message. Use a real account for the delivery smoke test.

## Troubleshooting

- **Instagram layout is missing:** select a message node in the Builder, not the journey-level Details tab.
- **Journey destination isn't listed:** create a direct outgoing connection from the message node to the intended destination, then reopen or revisit the message editor.
- **Save succeeded in the dialog but the journey didn't change:** use the Builder's explicit Save action to persist the graph, then publish the saved version.
- **Website button is rejected or absent:** verify its URL is valid HTTPS, public, and accessible.
- **A card or gallery isn't shown as expected:** verify the card title, title/subtitle lengths, image accessibility, and each card's actions. Use the message preview if available, then test real delivery.
- **A button opens a website instead of continuing the journey:** confirm its action is **Continue journey**, not **Open website**, and select a connected destination.
- **A quick reply doesn't continue the flow:** verify it has a selected destination and that the message has an outgoing edge to that node.

## Related guides

Read [Journey Builder](/docs/journey-builder) for node setup and [Preview, Test & Publish](/docs/preview-test-publish) for pre-release verification.
