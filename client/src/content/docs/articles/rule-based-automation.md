---
title: Rule-Based Replies
slug: rule-based-automation
group: Automations
description: Send a fixed, predictable response when a comment or DM matches a journey trigger.
order: 6
related: triggers-and-keywords, ai-automation, rich-media-messages, preview-test-publish
---

## When to use a rule-based reply

Rule-based replies are useful when a response should be consistent, such as acknowledging a keyword, sending a standard next step, or sharing a known resource. Choose AI-generated replies when the conversation needs flexible language and qualification.

## Configure the reply

1. Open the journey and select Details.
2. Expand Reply Settings and choose Rule-based (fixed template).
3. Write the default reply and keep it short and accurate.
4. Choose the reply channel: direct message, public comment, or both.
5. Save changes and inspect the result with Preview.

The default reply is also configured as a fail-closed fallback for AI mode. Do not put temporary prices, guarantees, or offers into the default response unless they are kept up to date.

## Use reply variations

Optional reply variations let SignalAI select one variation at random instead of always using the default template.

1. Add one or more variations under Reply Settings.
2. Remove empty or outdated variants.
3. Choose Save variations.
4. Review several previews to check that every variation is appropriate.

## Use a campaign-level CTA link

If the journey includes a Send Link action, configure the optional CTA Link in Details. The Builder's Send Link action uses this campaign-level link. For a card, carousel, multiple buttons, or quick replies on a particular message step, configure the message node's **Instagram layout** in Builder instead. These are separate settings; see [Rich Media Messages](/docs/rich-media-messages).

## Example

Trigger: comment contains brochure. Reply: “Thanks for your interest! I'll send you the brochure.” Channel: direct message. CTA link: the current brochure URL. If you need several resources or a choice such as “Pricing” versus “Book a visit,” use a rich message with interaction destinations connected to the appropriate outgoing nodes.

## Best practices

- Keep fixed replies focused on one next action.
- Verify the message makes sense for every trigger keyword attached to the journey.
- Keep all variations equivalent in meaning, tone, offer, and compliance.
- Test the reply channel using a real account; a public comment and a private DM are not interchangeable.
- Review links and time-sensitive facts regularly, and update the fallback when the offer changes.

## Troubleshooting

If a reply is missing, check the journey's Active state, trigger match, post targeting, reply mode, and channel in that order. Use Preview to isolate reply configuration from real Instagram delivery.
