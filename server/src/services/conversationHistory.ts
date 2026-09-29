import type { Pool } from "pg";
import { listRecentEventsForLead } from "../db/events.js";
import { listRecentSentRepliesForLead } from "../db/sentReplies.js";
import type { ConversationTurn } from "../llm/provider.js";

/**
 * Raw last-N turns, not a summary or embedding retrieval: the failure this
 * fixes ("what's my name?" right after "my name is akash") needs recency,
 * not semantic similarity — a vector search over the two would likely miss
 * the match entirely, and summarizing adds an extra model call and a place
 * to lose the one detail asked about. Each side query is independently
 * capped to `maxTurns` so the DB cost stays bounded regardless of how long
 * the lead's full history is; the merge-then-slice below is what actually
 * enforces the combined window sent to the LLM.
 */
export async function getRecentConversationHistory(
  pool: Pool,
  tenantId: string,
  leadId: string,
  currentEventId: string,
  maxTurns: number,
): Promise<ConversationTurn[]> {
  if (maxTurns <= 0) return [];

  const [events, replies] = await Promise.all([
    listRecentEventsForLead(pool, tenantId, leadId, maxTurns, currentEventId),
    listRecentSentRepliesForLead(pool, tenantId, leadId, maxTurns),
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
