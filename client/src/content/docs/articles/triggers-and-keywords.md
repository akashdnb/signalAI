---
title: Triggers & Keywords
slug: triggers-and-keywords
group: Automations
description: Choose which Instagram activity starts a journey and avoid replies to unrelated messages.
order: 5
related: connect-instagram, rule-based-automation, troubleshooting
---

## Choose a trigger type

- **Comments only:** start from a keyword in a public comment on an eligible post or Reel.
- **Direct messages only:** start from a keyword in an incoming DM.
- **Both:** allow the journey to listen to comments and DMs.

Set the trigger in Details → Trigger Settings or select the Trigger node in Builder. The Builder's Basic trigger editor also exposes options for story replies, case-insensitive matching, and enabling DM matching alongside a comment trigger.

## Choose useful keywords

1. Start with words or short phrases your audience is likely to use.
2. Enter multiple keywords separated by commas.
3. Add variations only when they have the same intended outcome.
4. Test a message that should match and one that should not.

For a downloadable brochure, example keywords might be brochure, details, and price. Avoid broad terms that appear in unrelated conversations.

## Target posts and Reels

In Details → Post Targeting, choose all posts and Reels or selected posts. For selected posts, add a post or Reel URL if it is not already available, then select the media items that should participate in the journey.

- Use selected-post targeting for a campaign-specific offer or lead magnet.
- Use all-post targeting only when the reply makes sense across your content.
- After changing targeting, test against a post that should be included.

## Best practices

- Prefer specific, high-intent words over generic words such as hi or okay.
- Include common spelling or phrasing variants only when useful and tested.
- Make sure the public comment reply and any subsequent DM provide the expected next step.
- For a campaign-specific CTA, use selected-post targeting to avoid triggering on unrelated content.
- Revisit keyword lists when you notice irrelevant matches or people using language you did not anticipate.

## Diagnose a trigger that does not match

1. Confirm the journey is Active.
2. Confirm the event type is allowed by the trigger.
3. Check keyword spelling and whether case-insensitive matching is enabled.
4. Check that the post is included by post targeting.
5. Confirm a fresh event appears in Inbox.

If an event never appears in Inbox, investigate connection/event delivery first. If it appears but does not trigger a reply, focus on journey configuration.
