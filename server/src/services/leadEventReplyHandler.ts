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
import { tryReserveSend } from "../db/accountSends.js";
import { sendInstagramMessage } from "../lib/instagramSend.js";
import { Sentry } from "../lib/sentry.js";
import { generateReply } from "./replyEngine.js";
import { runMilestoneCheck } from "./milestoneEngine.js";
import { createAccountSpendGuard } from "./aiSpendGuard.js";

// Meta's published ceiling for private-reply/DM sends per Instagram account.
const HOURLY_SEND_LIMIT = 750;
// Not derived from the limit window (that would mean a ~5s average
// spacing) — this is just how long a deferred job waits before the worker
// rechecks the counter, so a burst that fills the hourly cap early doesn't
// spin the queue in a tight retry loop.
const RATE_LIMIT_RETRY_DELAY_SECONDS = 60;

/**
 * The B4/B9/B10 worker's handler for the main lead-events queue: decides
 * what (if anything) to reply, then actually sends it to Instagram.
 *
 * Two ordering decisions here aren't obvious from reading top to bottom:
 *
 * 1. The messaging-window check and the rate-limit reservation both run
 *    BEFORE any milestone-engine side effects or LLM call. A rate-limited
 *    send reports `advance: false` and re-enqueues the same job with a
 *    delay so it runs again later — if milestone state had already been
 *    mutated before that point, the retry would redo the LLM/milestone
 *    work against state that had already moved on, double-advancing the
 *    milestone. Checking send preconditions first means a deferred retry
 *    re-enters this function with everything exactly as it was the first
 *    time.
 *
 * 2. Milestone advancement (captured-fact merges, `recordMilestoneAdvancement`,
 *    moving `active_milestone_id` to the next milestone) is computed but
 *    NOT committed until AFTER `sendInstagramMessage` resolves (R6-01
 *    fix). Committing it earlier — as an earlier version of this handler
 *    did — meant a failed send (Meta 5xx, timeout, a token revoked in the
 *    last few milliseconds) still advanced the conversation: the retry
 *    would re-enter with `active_milestone_id` already pointing at
 *    milestone N+1, and the lead would receive milestone 2's reply having
 *    never received milestone 1's.
 */
export function createLeadEventReplyHandler(
  pool: Pool,
  boss: PgBoss,
  provider: LLMProvider,
  keyring: Map<string, Buffer>,
  aiDailyCallCap: number,
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

    // R6-02/R6-03 fix: a single atomic reserve-and-record, replacing a
    // separate count-then-later-record pair. key_strict_fifo runs
    // different leads on the SAME account concurrently by design — the
    // exact viral-Reel burst this limiter exists to survive — so a
    // check-then-act count could let N concurrent workers each see a slot
    // free and each send. See accountSends.ts for the full reasoning.
    if (!(await tryReserveSend(pool, job.tenantId, account.instagramAccountId, HOURLY_SEND_LIMIT))) {
      await enqueueLeadEvent(boss, job, { delaySeconds: RATE_LIMIT_RETRY_DELAY_SECONDS });
      return { advance: false };
    }

    const milestones = await listMilestones(pool, job.tenantId, campaign.id);
    const sourceText = event.commentText ?? "";
    // B10: one guard per event, shared by whichever path below actually
    // calls the provider — rule-based replies never reach it, so they
    // never count against the cap.
    const spendGuard = createAccountSpendGuard(pool, job.tenantId, account.instagramAccountId, aiDailyCallCap);

    let replyText: string;
    let capExceeded = false;
    // R6-01: milestone advancement is computed here but only committed
    // after a confirmed send, below.
    let commitMilestoneAdvancement: (() => Promise<void>) | null = null;

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
        spendGuard,
      );
      replyText = reply.text;
      capExceeded = reply.capExceeded ?? false;
    } else {
      const activeMilestone = lead.activeMilestoneId
        ? await getMilestone(pool, job.tenantId, lead.activeMilestoneId)
        : await getFirstMilestone(pool, job.tenantId, campaign.id);

      if (!activeMilestone) return { advance: true }; // campaign has milestones but somehow none resolved

      if (!lead.activeMilestoneId) {
        // Idempotent regardless of send outcome — always resolves to the
        // same first milestone id on a retry, so this is safe to commit
        // immediately rather than deferring it too.
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
        spendGuard,
      );

      if (result.satisfied) {
        commitMilestoneAdvancement = async () => {
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
        };
      }

      replyText = result.reply;
      capExceeded = result.capExceeded ?? false;
    }

    if (capExceeded) {
      const message = "AI spend cap exceeded — degraded to rule-based reply";
      // eslint-disable-next-line no-console
      console.warn(message, { tenantId: job.tenantId, instagramAccountId: account.instagramAccountId });
      Sentry.captureMessage(message, {
        level: "warning",
        extra: { tenantId: job.tenantId, instagramAccountId: account.instagramAccountId },
      });
    }

    const token = await getDecryptedToken(pool, keyring, job.tenantId, account.instagramAccountId);
    if (!token) return { advance: true }; // disconnected between the reservation above and now; the reserved slot goes unused

    await sendInstagramMessage(token, lead.instagramUserId, replyText);

    // R6-01: only commit milestone advancement once the send actually
    // succeeded — a throw above propagates out of this handler and the
    // job retries with nothing committed yet, so the retry redoes the
    // LLM/milestone work cleanly instead of skipping ahead.
    if (commitMilestoneAdvancement) {
      await commitMilestoneAdvancement();
    }

    return { advance: true };
  };
}
