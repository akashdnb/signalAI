# 2026-09-28 — DM Conversation Continuation + Timeline Shows Bot Replies

Two fixes surfaced by debugging a real live conversation together with the user, not from a
planned roadmap item.

## Bug 1: DM Conversation Continuation

**Symptom** (from the user's own production timeline): a customer DM'd "product" on the `test_ai`
campaign (keyword "product", DM-triggered, AI-generated) and got a reply. Later in the same
conversation they asked "What are the costs?" (got a reply — turned out the campaign also had
"cost"/"price" configured as keywords, coincidence, not continuation) and then replied
"TechPro UltraBool 15" (a bare product name, answering the bot's own numbered list) — which got
**no reply at all**, with no trace beyond a bare "DM" row in the dashboard timeline.

**Root cause**: `lib/keywordMatch.ts`'s `findMatchingCampaign` and `webhookIngestService.ts`'s
`ingestOneEvent` are entirely stateless per message — matching checks only the current message's
text against a campaign's keyword list, with zero concept of "this lead already has an ongoing
conversation." `leadEventReplyHandler.ts` gates absolutely on the result
(`if (!event.matchedCampaignId || !event.matchedKeyword) return { advance: true }`), so a message
that doesn't happen to repeat an exact keyword goes nowhere — even mid-conversation, even with an
active Milestone Engine flow.

**Fix, confirmed with the user first (two real design decisions, not assumed)**:
- **DMs only** — comments never get this fallback (a public comment thread isn't a private
  ongoing conversation the same way; avoids weird cross-comment continuation on an unrelated
  future comment from the same user).
- **Applies to every DM campaign**, not just Milestone Engine ones — required a new field on the
  lead (`activeMilestoneId` is null for a flat, non-milestone campaign).
- **Expires with the existing 24h DM messaging window** (`leads.window_open_until`, already
  tracked and re-extended on every inbound DM) — no new expiry mechanism.

New `leads.active_dm_campaign_id` (migration `1758240000040`), set every time a DM event's keyword
genuinely matches a campaign (`db/leads.ts`'s new `setActiveDmCampaignId`) — always overwritten to
the latest real match, so explicitly invoking a different campaign's keyword correctly switches
context. `webhookIngestService.ts`'s continuation fallback checks: the lead's **pre-update**
`windowOpenUntil` (the state as of the *prior* interaction, before this message's own window
extension) is still valid as of `event.occurredAt`, and the remembered campaign is still present
in the already-`enabled=true`-filtered campaign list with `triggerSource` `'message'`/`'both'` — a
since-disabled or comment-only-switched campaign naturally stops continuing, no extra check
needed.

On a continuation match, `matchedKeyword` is set to a new exported sentinel constant,
`CONTINUATION_KEYWORD = "(ongoing conversation)"` (`lib/keywordMatch.ts`) — a real, honest,
non-null value rather than leaving it null, so the dashboard timeline visibly distinguishes "this
replied because of an ongoing conversation" from a genuine silent non-match, which is exactly the
transparency the original bug report was missing.

## Bug 2: Timeline shows only the customer's messages, never the bot's replies

Raised by the user in the same debugging session, once it became clear the fastest way to verify
the continuation fix's real-world behavior was checking the dashboard timeline — and the timeline
couldn't show it, because **nothing anywhere persists what the bot actually sent back**.
`leadEventReplyHandler.ts` calls `sendInstagramMessage`/`sendInstagramCommentReply` directly
against Meta's API; the reply text was never written to our own DB. `db/leadTimeline.ts`'s
`getLeadTimeline` only ever merged `lead_events` (inbound) and `lead_activity` (CRM actions) — the
dashboard showed half of every conversation. The only way to see what the bot said was a
screenshot of the actual Instagram app.

**Fix**: new `sent_replies` table (migration `1758240000041`) — one row per **actual channel
send**, not per triggering event: a `'both'`-channel campaign makes two real Instagram API calls
and now produces two rows, matching what actually went out. Recorded in
`leadEventReplyHandler.ts` right after each successful send (inside the existing
`if (dmReady)`/`if (commentReady)` blocks), matching this file's established "only commit effects
after a confirmed send" discipline. `engine` (`rule_based` | `ai_generated`) comes straight from
the flat-reply path's `PreparedReply.engine`; the Milestone Engine path doesn't track this
explicitly, so it's inferred there (`fellBackReason` set → `rule_based` fail-closed fallback,
otherwise → `ai_generated` — the milestone branch only ever runs for `replyMode: 'ai_generated'`
campaigns in the first place). `db/leadTimeline.ts` merges `listSentRepliesForLead` in alongside
the existing two sources; `LeadDetailPage.tsx` renders the new `kind: "reply"` entry labeled "Bot
reply (DM/comment)" with an engine pill.

## Verified
- `npm run typecheck` and `npm test` (server) — 528/528 passing (25 new: 7 continuation-matching
  cases covering first-contact/window-expiry/comment-exclusion/disabled-campaign/
  trigger-source-switch/keyword-override, plus sent-replies CRUD, timeline-merge, and
  handler-level recording including the `'both'`-channel two-rows case).
- Both new migrations re-tested up and down against the local test DB.
- `npm run build` and `npm run lint` (client) clean — no new warnings.
- Confirmed a pre-existing, unrelated flakiness in this suite's real-timer pg-boss queue tests
  (`leadEventsQueue.test.ts` and neighbors) by re-running the full suite clean twice — not caused
  by anything in this change (those files are untouched, and pass reliably in isolation).
