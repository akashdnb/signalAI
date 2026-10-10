---
title: Journey Analytics
slug: analytics
group: Analytics
description: Understand matched activity, lead progress, and where qualification loses momentum.
order: 14
related: automations, leads, goals-and-fields
---

## Open journey analytics

1. Open Automation → Journeys.
2. Select the journey.
3. Choose Analytics.
4. Review the summary metrics, activity chart, funnel, and milestone drop-off sections.

Analytics is scoped to a journey. Use it to understand that workflow before comparing it with another journey or looking at the workspace-wide Leads view.

## Understand the metrics

- **Comments matched:** comment events matched by the journey.
- **Messages matched:** direct-message events matched by the journey.
- **Leads in journey:** leads associated with a currently configured milestone in the journey.
- **Qualified, Meeting Scheduled, and Won:** counts derived from pipeline stages.
- **Milestone drop-off:** breakdown by configured milestone where available.

The activity time series covers the recent 30-day window. An empty chart can mean there has been no matched activity during that period; it is not automatically a tracking failure.

## Use analytics to improve a journey

1. Check whether the trigger is matching the intended volume.
2. Compare matched activity with leads and qualified leads.
3. Inspect milestone drop-off for a possible point of friction.
4. Review conversations around the apparent drop-off in Inbox.
5. Change one trigger, reply, or goal at a time, then test and observe the next period.

Counts are directional diagnostics, not proof that every matched event represents a unique person. Check underlying conversation and lead records before making business decisions.

## Best practices

- Review analytics over a consistent time window and account for campaigns that had very different traffic.
- Treat a sudden drop as a prompt to investigate, not as a diagnosis by itself.
- Follow the funnel in order: matching activity, replies, captured information, qualification, and sales outcome.
- Pair the chart with actual conversations to understand why prospects stop responding.
- Change one part of a journey at a time so you can learn which adjustment helped.

## Related workflow

Use Leads & Pipeline to keep outcome stages consistent and Goals & Captured Fields to reduce unnecessary questions at drop-off points.
