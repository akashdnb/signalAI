import type { Pool } from "pg";
import type { LLMProvider } from "../llm/provider.js";
import type { LeadEventJob } from "../queue/leadEventsQueue.js";
import { getEventForReply } from "../db/events.js";
import { getCampaign } from "../db/campaigns.js";
import { getLead, setActiveMilestone } from "../db/leads.js";
import {
  getFirstMilestone,
  getMilestone,
  getNextMilestone,
  listMilestones,
  recordMilestoneAdvancement,
} from "../db/milestones.js";
import { getCapturedFacts, mergeCapturedFacts } from "../db/capturedFacts.js";
import { generateReply } from "./replyEngine.js";
import { runMilestoneCheck } from "./milestoneEngine.js";

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

    const milestones = await listMilestones(pool, job.tenantId, campaign.id);
    const sourceText = event.commentText ?? "";

    if (milestones.length === 0 || campaign.replyMode === "rule_based") {
      // No Milestone Engine configured, or the campaign opted out of AI
      // entirely — plain B7 reply, no conversation-position tracking.
      const reply = await generateReply(
        {
          campaign,
          matchedKeyword: event.matchedKeyword,
          sourceText,
          username: event.username ?? undefined,
          tier: "comment",
        },
        provider,
      );
      logReplyReady(job.leadId, reply.engine, reply.text);
      return;
    }

    const lead = await getLead(pool, job.tenantId, job.leadId);
    if (!lead) return;

    const activeMilestone = lead.activeMilestoneId
      ? await getMilestone(pool, job.tenantId, lead.activeMilestoneId)
      : await getFirstMilestone(pool, job.tenantId, campaign.id);

    if (!activeMilestone) return; // campaign has milestones but somehow none resolved — nothing to steer toward

    if (!lead.activeMilestoneId) {
      await setActiveMilestone(pool, job.tenantId, job.leadId, activeMilestone.id);
    }

    const capturedFactsSoFar = await getCapturedFacts(pool, job.tenantId, job.leadId);

    const result = await runMilestoneCheck(
      {
        milestone: activeMilestone,
        capturedFactsSoFar,
        sourceText,
        username: event.username ?? undefined,
        tier: "comment",
      },
      provider,
    );

    if (result.satisfied) {
      if (activeMilestone.captureField && result.capturedValue) {
        await mergeCapturedFacts(pool, job.tenantId, job.leadId, {
          [activeMilestone.captureField]: result.capturedValue,
        });
      }
      await recordMilestoneAdvancement(pool, job.tenantId, job.leadId, campaign.id, activeMilestone.id);

      const next = await getNextMilestone(pool, job.tenantId, campaign.id, activeMilestone.ordinal);
      if (next) {
        await setActiveMilestone(pool, job.tenantId, job.leadId, next.id);
      }
    }

    logReplyReady(job.leadId, result.fellBackReason ? "rule_based" : "ai_generated", result.reply);
  };
}

function logReplyReady(leadId: string, engine: string, text: string): void {
  // eslint-disable-next-line no-console
  console.log(`[reply-ready] lead=${leadId} engine=${engine} text=${JSON.stringify(text)}`);
}
