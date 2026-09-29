# 2026-09-29 — Conversation Memory, Human Reply Capture, Reel Display, Timeline Pagination

Four related fixes to the DM conversation pipeline, surfaced from a real production symptom
(bot couldn't recall "my name is akash" from two messages earlier) and follow-up questions in
the same debugging session.

## Bug 1: The bot has no conversation memory at all

**Symptom**: a customer says "my name is akash", then two messages later asks "what is my
name?" — the bot has no idea, every time.

**Root cause**: `replyEngine.ts`'s `generateReply` and `milestoneEngine.ts`'s `runMilestoneCheck`
call the LLM provider with only `systemPrompt` (static instructions + RAG chunks) and the
*current* `userMessage` — no prior turns, ever. `llm/provider.ts`'s `GenerateReplyInput` didn't
even have a field for history, and `openAICompatibleProvider.ts` hardcoded a 2-message array
(`[system, user]`). The data existed (`lead_events`, `sent_replies`) but nothing on the reply
path ever queried it.

**Fix**: raw last-N turns, not a summary or embedding retrieval — this failure needs recency
("what's my name?" right after "my name is akash" has near-zero embedding similarity), and
summarizing risks dropping the one fact asked about. New `services/conversationHistory.ts`
merges bounded, independently-capped queries (`db/events.ts`'s `listRecentEventsForLead`,
`db/sentReplies.ts`'s `listRecentSentRepliesForLead`) into oldest-first turns, capped by
`config.chatHistoryMaxTurns` (env `CHAT_HISTORY_MAX_TURNS`, default 10). Threaded through
`ReplyContext`/`MilestoneCheckContext` → `GenerateReplyInput.history` →
`openAICompatibleProvider.ts`'s messages array (inserted between system and the current user
message). Skipped entirely for `rule_based` campaigns, which never call the provider.

## Bug 2: A human agent's reply during handoff is invisible to the system

Raised as a follow-up: if a lead is handed off (`handoffStatus: 'human'`) and an agent replies
directly in the Instagram app, does the bot ever see that reply?

**Root cause**: `instagramWebhookParser.ts` unconditionally dropped every "echo" webhook (Meta's
report of a message sent *from* the connected account) to avoid a previously-fixed phantom-lead
bug — but that drop applied equally to the bot's own sends and to a human's. Nothing recorded a
human's manual reply anywhere (`lead_events`, `sent_replies`, `lead_activity` all silent), so a
handoff's human-authored turns left a gap in what the bot "remembered" once handoff reverted to
`ai`.

**Fix**: echoes are now parsed (`isEcho: true`, attributed to the RECIPIENT rather than the
sender — the recipient is the actual lead, which is also what avoided the original phantom-lead
bug) and routed by `webhookIngestService.ts`'s new `ingestOneEchoEvent` to a correlation check
against `sent_replies.meta_message_id` (migration `1758240000042`, plus dropping
`sent_replies.lead_event_id`'s NOT NULL and widening the `engine` check constraint to add
`'human'`). A match means Meta is just confirming a send this system already recorded
(`sendInstagramMessage` now returns the Send API's `message_id`, captured in
`leadEventReplyHandler.ts` and stored alongside the row); a miss means a human sent it directly,
recorded as `engine: 'human'` — which `listRecentSentRepliesForLead` (Bug 1's history query) and
`getLeadTimeline` already treat exactly like a bot reply, so no further wiring was needed on
either the memory or timeline side. `LeadDetailPage.tsx` labels these "Team reply".

## Bug 3: A shared Reel/post in DM shows a blank timeline row

**Symptom**: "whenever someone sends me a reel, it shows DM — [date]" with no text.

**Root cause**: `instagramWebhookParser.ts` only ever read `message.text`. A shared Reel/post,
photo, video, voice clip, or story mention arrives with `message.attachments` instead — `text`
stays undefined, `lead_pii.dm_text` is null, and `LeadDetailPage.tsx`'s `entry.text ?? "—"`
fallback renders nothing useful.

**Fix**: new `describeAttachments` helper renders a short label (+ the content's own URL when
Meta includes one) for the common attachment types (`share`/`media_share`/`reel`,
`story_mention`, `image`, `video`, `audio`), falling back to a generic "Shared content" for
anything unrecognized — beats a blank row either way. Same "VERIFY against a real payload"
caveat as the rest of this file (never exercised against live Instagram traffic yet).

## Bug 4: The timeline has no pagination — slow to load for a long conversation

Raised as a follow-up once the timeline started showing more (bot + human replies, described
attachments): `db/leadTimeline.ts`'s `getLeadTimeline` fetched a lead's **entire** history —
every event, activity row, and reply, unbounded — on every dashboard load and after every single
mutation (add a note, change stage, etc).

**Fix**: new `getLeadTimelinePage` (cursor-paginated by `before`, an ISO timestamp). Each of the
three sources gets a new bounded page query (`listEventsForLeadPage`, `listLeadActivityPage`,
`listSentRepliesForLeadPage`), each fetched `limit + 1` deep — by the standard k-way top-K merge
argument, fetching the top-(limit+1) of each source is what's needed to correctly compute the
*true* top-(limit+1) of their union, which is what makes `hasMore` (merged length > limit)
trustworthy rather than a guess based on any one source. `routes/leads.ts`'s timeline route now
takes `limit` (default 50, max 200) and `before` query params and returns
`{ entries, hasMore, nextCursor }` instead of a bare array. `LeadDetailPage.tsx` loads the most
recent page by default and prepends older pages behind a "Load older messages" button. The old
unbounded `getLeadTimeline` is left in place (still covered by its own tests) since nothing
outside tests calls it directly anymore, but removing it wasn't necessary for this fix.

## Verified
- `npx tsc --noEmit` clean on both `server` and `client`.
- `npm run build` (client) and `npx vitest run` (server) — 547/547 passing, including new
  coverage: conversation-history threading (`replyEngine.test.ts`,
  `leadEventReplyHandler.test.ts`), echo-ingestion correlation/dedup
  (`webhookIngestService.echo.test.ts`), attachment description
  (`instagramWebhookParser.test.ts`), and timeline pagination correctness across all three merged
  sources (`db/__tests__/leadTimeline.test.ts`, `routes/__tests__/leads.test.ts`).
- New migration `1758240000042` re-applied against the local test DB.
- `npm run lint` (client) — no new warnings (2 pre-existing, unrelated to this change).
