# UI Phase 3 — Automation

Phase 3 turns Automation into the primary polished product workflow while preserving the existing journey data model and builder behavior.

## Included

### Automation landing
- Journey list with search, status/trigger filters, sorting, pagination, bulk activation and pause actions.
- Dedicated Templates tab with reusable starting patterns.
- Template creation reuses the existing campaign creation API and opens the newly created journey in Builder.
- Existing Journeys, Templates, Keywords, Quick Replies, Handoff Rules and Settings tabs remain intact.

### Journey Builder
- Existing React Flow builder is retained; Phase 3 does not replace the graph architecture.
- Trigger, message, goal, send-link and human-handoff nodes remain visually distinct.
- Four-sided handles and smooth-step connections make branching easier to understand.
- Add-node palette remains collapsible to keep the canvas focused.
- Node editing continues through the modal/dialog inspector rather than a permanent right-side panel.

### Inspector and rich Instagram messages
- Message editing supports plain text plus buttons, cards, galleries and quick replies.
- Rich-message validation covers HTTPS URLs, button/quick-reply limits, card requirements and connected journey destinations.
- Message presentation is stored as journey-node draft data and only persisted when the user saves the journey.
- The editor supports journey-to-journey navigation through postback buttons/quick replies.
- The resulting message structure is intended to map to professional Instagram-style media/CTA presentation rather than rendering every message as plain text.

### Draft/save/publish behavior
- Moving nodes, editing message presentation and editing goals mark the journey as unsaved locally.
- No builder save request is sent for ordinary canvas edits.
- Save persists the current graph and goals using optimistic version checking.
- Save failures keep the local draft intact.
- Leaving the builder while changes are pending opens an explicit save/discard/continue flow.
- Browser unload and browser back/forward are guarded when a draft is dirty.
- Publishing is separate from saving and requires an explicit publish confirmation.

## Product rules

1. Do not introduce autosave for builder graph edits.
2. Do not replace the Node Inspector dialog with a permanent right-side inspector.
3. Keep the current graph/API model compatible with existing journeys.
4. Prefer whitespace, dividers and semantic status treatments over nested decorative cards.
5. Rich-message UI should show users the actual Instagram-style structure they are configuring, including media, CTA buttons and quick replies where supported.

## Validation checklist

- Create a journey from Journeys and from Templates.
- Search/filter/sort the journey list.
- Open a journey and move a node; verify the version does not change until Save.
- Edit a message and switch between text/rich presentation types; verify changes stay local until Save.
- Configure a card/gallery with an invalid URL and verify validation blocks save.
- Navigate away with a dirty draft; verify the unsaved dialog appears.
- Save, reload, and verify the graph/version and message presentation persist.
- Publish only after an explicit confirmation.
- Verify the automation workflow remains usable on mobile widths.
