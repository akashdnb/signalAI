import type { Pool } from "pg";
import type { LLMProvider } from "../llm/provider.js";
import type { LeadEventJob } from "../queue/leadEventsQueue.js";
import { getEventForReply } from "../db/events.js";
import { getCampaign } from "../db/campaigns.js";
import { generateReply } from "./replyEngine.js";

/**
 * The B4 worker's handler for the main lead-events queue. Stops short of
 * actually sending anything to Instagram — that's B9 (messaging-window
 * check + rate limiting), not yet built. For now the prepared reply is
 * logged as the handoff point B9 will pick up.
 */
export function createLeadEventReplyHandler(pool: Pool, provider: LLMProvider) {
  return async function handleLeadEvent(job: LeadEventJob): Promise<void> {
    const event = await getEventForReply(pool, job.tenantId, job.leadEventId);
    if (!event) return; // shouldn't happen outside a test/race, but never crash the worker over it

    if (event.eventType !== "comment" || !event.matchedCampaignId || !event.matchedKeyword) {
      return; // recorded for analytics already; not a trigger
    }

    const campaign = await getCampaign(pool, job.tenantId, event.matchedCampaignId);
    if (!campaign || !campaign.enabled) return; // disabled between match-time and processing

    const reply = await generateReply(
      {
        campaign,
        matchedKeyword: event.matchedKeyword,
        sourceText: event.commentText ?? "",
        username: event.username ?? undefined,
        tier: "comment",
      },
      provider,
    );

    // eslint-disable-next-line no-console
    console.log(`[reply-ready] lead=${job.leadId} engine=${reply.engine} text=${JSON.stringify(reply.text)}`);
  };
}
