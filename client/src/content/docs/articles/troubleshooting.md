---
title: Troubleshooting
slug: troubleshooting
group: Troubleshooting
description: Diagnose the most common problems by checking each stage of the conversation flow in order.
order: 16
related: connect-instagram, triggers-and-keywords, knowledge, preview-test-publish
---

## Instagram activity is missing from Inbox

1. Check that the correct professional account is connected.
2. Send a fresh DM or comment test.
3. Confirm the journey's trigger type allows that event.
4. Check keywords, case matching, story-reply setting, and post targeting.
5. Confirm the journey is Active.

Change one variable at a time. An event that never appears in Inbox points to the connection or event path; an event that appears but does not trigger a reply points further downstream.

## The journey does not reply

- Confirm the journey is Active and the intended version has been published.
- Confirm trigger type and keyword match the actual comment or DM.
- Check the reply channel: a public comment response is different from a private DM.
- Check the connected Instagram account and Meta permissions.
- Try Preview to isolate reply configuration from real Instagram delivery.

## AI uses a fallback or gives a weak answer

1. Check the fallback/default reply and AI reply mode.
2. Check whether Use knowledge base for context is enabled for the journey.
3. Confirm relevant documents show Ready in Knowledge Base.
4. Replace contradictory or outdated content and test again.
5. Review the full conversation in Inbox before changing the goal.

## A lead or captured field is missing

1. Open the conversation and determine whether the trigger matched and a reply was sent.
2. Review the configured goal and fields.
3. Check whether the conversation actually provided the required information.
4. Inspect the lead's Captured Facts and conversation timeline.
5. Revise the goal wording or selected fields, then test with natural variations.

## The account reconnects or authorization fails

Start a new connection from the dashboard rather than reusing an old authorization URL. If the account is already connected to another workspace, check ownership before trying again. Use the exact error shown on the connection page to narrow the next step.

## Publish is unavailable or fails

Read the error shown in Builder and verify that the version finished loading. Confirm that the latest edits were saved before refreshing. If the error persists, record the journey name, displayed version, approximate time, and error text for support.

## Best practices

- Diagnose one stage at a time: account → event → trigger → reply → qualification → lead.
- Use a fresh, reproducible test and record which account, post, keyword, and time were used.
- Compare Preview with a real Instagram test to separate AI behavior from platform delivery.
- Avoid repeatedly reconnecting accounts or changing several trigger settings without identifying the failure.
- Share error text and redacted screenshots, never access tokens or unnecessary prospect data.

## What to include when asking for help

- The journey name and its Active/Inactive state.
- Whether the event was a comment, DM, or story reply.
- The keyword tested and whether the event appears in Inbox.
- The exact error or a screenshot with private prospect details redacted.
- Approximate time of the test and whether Preview behaved differently from the real Instagram test.
