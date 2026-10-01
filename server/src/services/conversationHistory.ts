import type { Pool } from "pg";
import { listRecentEventsForLead } from "../db/events.js";
import { listRecentSentRepliesForLead } from "../db/sentReplies.js";
import type { ConversationTurn } from "../llm/provider.js";
import type { ReplyTier } from "./replyEngine.js";

/**
 * Raw last-N turns, not a summary or embedding retrieval: the failure this
 * fixes ("what's my name?" right after "my name is akash") needs recency,
 * not semantic similarity — a vector search over the two would likely miss
 * the match entirely, and summarizing adds an extra model call and a place
 * to lose the one detail asked about. Each side query is independently
 * capped to `maxTurns` so the DB cost stays bounded regardless of how long
 * the lead's full history is; the merge-then-slice below is what actually
 * enforces the combined window sent to the LLM.
 *
 * Comment Reply vs DM Reply privacy boundary: a `tier: "comment"` reply is
 * PUBLIC, so it must never be built from private DM content — not "told
 * not to repeat it," never given it at all. For that tier this function
 * restricts both underlying queries to same-channel (comment) rows at the
 * SQL level (db/events.ts, db/sentReplies.ts): a prior DM message or a
 * bot/human reply actually sent as a DM is never even fetched into this
 * process, let alone passed to the model. `tier: "dm"` is unchanged from
 * before this boundary existed — the existing mixed (comment + DM) history
 * behavior for private conversations is deliberately preserved as is.
 */
export async function getRecentConversationHistory(
  pool: Pool,
  tenantId: string,
  leadId: string,
  currentEventId: string,
  maxTurns: number,
  tier: ReplyTier,
): Promise<ConversationTurn[]> {
  if (maxTurns <= 0) return [];

  const commentOnly = tier === "comment";

  const [events, replies] = await Promise.all([
    listRecentEventsForLead(pool, tenantId, leadId, maxTurns, currentEventId, commentOnly ? "comment" : undefined),
    listRecentSentRepliesForLead(pool, tenantId, leadId, maxTurns, commentOnly ? "comment" : undefined),
  ]);

  const turns: Array<ConversationTurn & { occurredAt: Date }> = [];
  for (const e of events) {
    const content = e.commentText ?? e.dmText;
    if (content) turns.push({ role: "user", content, occurredAt: e.occurredAt });
  }
  for (const r of replies) {
    turns.push({ role: "assistant", content: r.text, occurredAt: r.sentAt });
  }

  turns.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  return turns.slice(-maxTurns).map(({ role, content }) => ({ role, content }));
}
