import type { Pool } from "pg";
import type { PgBoss } from "pg-boss";
import type { LLMProvider } from "../llm/provider.js";
import type { LeadEventJob } from "../queue/leadEventsQueue.js";
import type { LeadEventHandlerResult } from "../queue/worker.js";
import { enqueueLeadEvent } from "../queue/leadEventsQueue.js";
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
import { getSoleConnectedAccount, getDecryptedToken } from "../db/tokens.js";
import { countRecentSends, recordSend } from "../db/accountSends.js";
import { sendInstagramMessage } from "../lib/instagramSend.js";
import { generateReply } from "./replyEngine.js";
import { runMilestoneCheck } from "./milestoneEngine.js";

// Meta's published ceiling for private-reply/DM sends per Instagram account.
const HOURLY_SEND_LIMIT = 750;
// Not derived from the limit window (that would mean a ~5s average
// spacing) — this is just how long a deferred job waits before the worker
// rechecks the counter, so a burst that fills the hourly cap early doesn't
// spin the queue in a tight retry loop.
const RATE_LIMIT_RETRY_DELAY_SECONDS = 60;

/**
 * The B4/B9 worker's handler for the main lead-events queue: decides what
 * (if anything) to reply, then actually sends it to Instagram.
 *
 * Ordering matters here in a way that isn't obvious from reading top to
 * bottom: the messaging-window and rate-limit checks run BEFORE any
 * milestone-engine side effects (captured-fact merges, milestone
 * advancement) or LLM call. A rate-limited send reports `advance: false`
 * and re-enqueues the same job with a delay so it runs again later — if
 * milestone state had already been mutated before that point, the retry
 * would redo the LLM/milestone work against state that had already moved
 * on, double-advancing the milestone. Checking the send preconditions
 * first means a deferred retry re-enters this function with everything
 * exactly as it was the first time.
 */
export function createLeadEventReplyHandler(
  pool: Pool,
  boss: PgBoss,
  provider: LLMProvider,
  keyring: Map<string, Buffer>,
) {
  return async function handleLeadEvent(job: LeadEventJob): Promise<LeadEventHandlerResult> {
    const event = await getEventForReply(pool, job.tenantId, job.leadEventId);
    if (!event) return { advance: true }; // shouldn't happen outside a test/race, but never crash the worker over it

    if (event.eventType !== "comment" || !event.matchedCampaignId || !event.matchedKeyword) {
      return { advance: true }; // recorded for analytics already; not a trigger
    }

    const campaign = await getCampaign(pool, job.tenantId, event.matchedCampaignId);
    if (!campaign || !campaign.enabled) return { advance: true }; // disabled between match-time and processing

    const lead = await getLead(pool, job.tenantId, job.leadId);
    if (!lead || !lead.instagramUserId) return { advance: true };

    if (!lead.windowOpenUntil || lead.windowOpenUntil.getTime() < Date.now()) {
      // Nothing more can happen for this event once the 24h messaging
      // window has closed — there's no "retry later", so this event is
      // simply done.
      return { advance: true };
    }

    const account = await getSoleConnectedAccount(pool, job.tenantId);
    if (!account) return { advance: true }; // token was revoked/disconnected since the event was matched

    if ((await countRecentSends(pool, account.instagramAccountId)) >= HOURLY_SEND_LIMIT) {
      await enqueueLeadEvent(boss, job, { delaySeconds: RATE_LIMIT_RETRY_DELAY_SECONDS });
      return { advance: false };
    }

    const milestones = await listMilestones(pool, job.tenantId, campaign.id);
    const sourceText = event.commentText ?? "";

    let replyText: string;

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
          ctaLink: campaign.ctaLink ?? undefined,
        },
        provider,
      );
      replyText = reply.text;
    } else {
      const activeMilestone = lead.activeMilestoneId
        ? await getMilestone(pool, job.tenantId, lead.activeMilestoneId)
        : await getFirstMilestone(pool, job.tenantId, campaign.id);

      if (!activeMilestone) return { advance: true }; // campaign has milestones but somehow none resolved

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
          ctaLink: campaign.ctaLink ?? undefined,
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

      replyText = result.reply;
    }

    const token = await getDecryptedToken(pool, keyring, job.tenantId, account.instagramAccountId);
    if (!token) return { advance: true }; // disconnected between the rate-limit check above and now

    await sendInstagramMessage(token, lead.instagramUserId, replyText);
    await recordSend(pool, job.tenantId, account.instagramAccountId);

    return { advance: true };
  };
}
