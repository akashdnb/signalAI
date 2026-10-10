---
title: Goals & Captured Fields
slug: goals-and-fields
group: Journey Builder
description: Break qualification into useful checkpoints and capture structured information without turning a conversation into a form.
order: 10
related: ai-automation, journey-builder, leads, preview-test-publish
---

## Design a goal

A goal is a conversational outcome SignalAI should work toward. Give it a short title that a teammate can understand later, such as Identify buying intent or Capture preferred location.

1. Open the journey Builder.
2. Select New Goal or add a goal from the canvas.
3. Open the goal dialog and enter a descriptive title.
4. Save the goal before leaving the dialog.

## Choose captured fields

The Capture Fields tab lets you attach existing field definitions to a goal. Only select fields that matter to the next sales action. Common examples include phone, email, location, budget, and buying intent when those definitions exist in the workspace.

1. Open the goal and choose Capture Fields.
2. Select a field from Add field, or choose Create field.
3. For a new field, enter a unique field key, a human-readable label, and a value type.
4. Add the field to the goal and save the goal.

Use stable keys such as phone_number or preferred_location rather than changing keys for cosmetic reasons. Avoid duplicate fields that represent the same concept.

## Keep the conversation short

Order goals from the easiest, most relevant question toward information that needs more commitment. If a prospect already gave an answer naturally, the journey should not ask the same question again unless clarification is genuinely needed.

## Validation and success-message tabs in beta

The goal dialog includes Validation and Success Message tabs, but in the current beta UI they display that no rules or message are configured and do not provide configuration controls. Do not assume you can enforce a validation rule or author a custom success message from these tabs yet.

## Review what was captured

1. Open Leads and select a prospect.
2. Review Captured Facts and the conversation timeline together.
3. Correct journey field selection or goal wording if the captured value is ambiguous.
4. Re-test with natural variations of the question.

A field appearing on a lead is not by itself proof that the value is correct. Spot-check extracted values against the conversation before relying on them.

## Best practices

- Capture information that supports a real follow-up action, not data you are merely curious about.
- Use specific field labels and stable keys; keep similar concepts from becoming duplicate fields.
- Prefer a small set of milestones with one clear outcome each.
- Ask for sensitive or high-friction information only when there is a clear need.
- Verify extracted values against the conversation and correct the flow when confidence is low.
- Be transparent with prospects about why you are asking for contact information.

## Related workflow

Use AI Replies to shape qualification behavior and Leads & Pipeline to see how captured facts appear to your team.
