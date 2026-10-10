---
title: Recipe: Comment → DM → Lead
slug: comment-to-lead
group: Recipes
description: Turn a post comment into a conversation and a qualified prospect.
order: 15
related: triggers-and-keywords, rule-based-automation, ai-automation, preview-test-publish, analytics
---

## The intended flow

A person comments with a campaign keyword. SignalAI matches the comment, replies through the selected channel, and the conversation can continue through AI qualification. The lead becomes useful when configured goals produce meaningful information.

## Configure the journey

1. Create a journey with a clear name, such as Spring Brochure Leads.
2. In Details, choose Comments only or Both and add focused keywords such as brochure or details.
3. Use Post Targeting to select the campaign post, or choose all posts and Reels only when this flow suits your content generally.
4. Set Reply Mode to AI-generated or Rule-based, write the default reply, and choose Direct message only, Public comment only, or Both.
5. If a link is part of the offer, configure the CTA link used by the available Send Link action.
6. Add a goal such as Identify interest and choose the fields needed for follow-up.
7. Enable knowledge-base context if AI must answer questions using uploaded business material.

## Keep the first message short

A first reply should acknowledge the comment and make the next action clear. Avoid asking for several personal details in the opening message. Let the qualification conversation collect only what is needed.

## Test before launch

1. Use Preview with likely questions and an irrelevant message.
2. Use Test Journey to review the goal sequence.
3. Publish the intended version and check that the journey is Active.
4. From a separate Instagram account, comment on a targeted post using a matching keyword.
5. Open Inbox to verify the activity and reply, then inspect Leads and Captured Facts if qualification completes.

## Measure and iterate

Review comments matched, messages matched, lead counts, pipeline progression, and milestone drop-off in Analytics. If comments match but leads do not appear, inspect the conversation before changing the trigger: the person may not have completed the qualification goal.

## Best practices

- Make the public comment response and private follow-up consistent with the promise made in the post.
- Avoid sending unsolicited or unrelated promotional content in the follow-up.
- Keep the CTA link current and make sure the first DM explains why the person is receiving it.
- Use selected-post targeting when an offer applies only to a particular campaign.
- Track the full path from matched comment to meaningful lead, not just comments matched.
- Test multiple keyword variations and at least one non-matching comment before launch.

## Common failure points

- **Comment is not visible:** check connection and event delivery.
- **Comment is visible but no reply appears:** check trigger, keyword, post targeting, Active state, and reply channel.
- **Reply arrives but no lead appears:** check goals, captured fields, and whether the prospect supplied enough information.
