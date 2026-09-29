import type { Pool } from "pg";
import type { PgBoss } from "pg-boss";
import type { LLMProvider, GenerateReplyUsage } from "../llm/provider.js";
import type { EmbeddingProvider } from "../llm/embeddingProvider.js";
import type { LeadEventJob } from "../queue/leadEventsQueue.js";
import type { LeadEventHandlerResult } from "../queue/worker.js";
import { enqueueLeadEvent } from "../queue/leadEventsQueue.js";
import { getEventForReply } from "../db/events.js";
import { config } from "../config.js";
import { getRecentConversationHistory } from "./conversationHistory.js";
import { getCampaign } from "../db/campaigns.js";
import { getLead, setActiveMilestone, updateHandoffStatus } from "../db/leads.js";
import { getTenant } from "../db/tenants.js";
import { getGuardrailsConfig } from "../db/guardrailsConfig.js";
import { recordSentReply, type SentReplyEngine } from "../db/sentReplies.js";
import type { RagDependencies } from "./replyEngine.js";
import {
  getFirstMilestone,
  getMilestone,
  getNextMilestone,
  listMilestones,
  recordMilestoneAdvancement,
} from "../db/milestones.js";
import { getCapturedFacts, mergeCapturedFacts } from "../db/capturedFacts.js";
import { getFieldDefinitionValueTypes } from "../db/fieldDefinitions.js";
import { getSoleConnectedAccount, getDecryptedToken } from "../db/tokens.js";
import { tryReserveSend } from "../db/accountSends.js";
import { getTokenUsageSince, recordTokenUsage } from "../db/tokenUsage.js";
import { getPlanTier } from "../lib/planTiers.js";
import { sendInstagramCommentReply, sendInstagramMessage } from "../lib/instagramSend.js";
import { Sentry } from "../lib/sentry.js";
import { generateReply } from "./replyEngine.js";
import { runMilestoneCheck } from "./milestoneEngine.js";
import { createAccountSpendGuard, type AiSpendGuard } from "./aiSpendGuard.js";

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
  // Phase 2C: null when embeddings aren't configured on this server —
  // generateReply/runMilestoneCheck already treat that exactly like "this
  // tenant has no knowledge base," so no special-casing is needed here.
  embeddingProvider: EmbeddingProvider | null = null,
) {
  return async function handleLeadEvent(job: LeadEventJob): Promise<LeadEventHandlerResult> {
    const event = await getEventForReply(pool, job.tenantId, job.leadEventId);
    if (!event) return { advance: true }; // shouldn't happen outside a test/race, but never crash the worker over it

    if (!event.matchedCampaignId || !event.matchedKeyword) {
      return { advance: true }; // recorded for analytics already; not a trigger
    }
    // A campaign's trigger_source decides whether a comment, a message, or
    // either could match in the first place (webhookIngestService.ts) —
    // matchedCampaignId being set at all is already proof this event type
    // was an eligible trigger, so eventType itself gates nothing further
    // here beyond choosing the right source text/tier below.
    const isCommentTrigger = event.eventType === "comment";

    const campaign = await getCampaign(pool, job.tenantId, event.matchedCampaignId);
    if (!campaign || !campaign.enabled) return { advance: true }; // disabled between match-time and processing

    const lead = await getLead(pool, job.tenantId, job.leadId);
    if (!lead || !lead.instagramUserId) return { advance: true };

    const tenant = await getTenant(pool, job.tenantId);
    if (!tenant) return { advance: true }; // shouldn't happen — the whole pipeline is tenant-scoped from ingestion

    // Phase 2C Client Guardrails + RAG: fetched once per event, alongside
    // the other per-event context above, and threaded into whichever
    // engine below actually runs. null (no row yet) is a valid, common
    // state — generateReply/runMilestoneCheck treat an absent config
    // identically to an empty one, never as "guardrails disabled."
    const tenantGuardrailsConfig = await getGuardrailsConfig(pool, job.tenantId);
    const rag: RagDependencies = { pool, embeddingProvider, tenantGuardrailsConfig };

    // Phase 2A Human Handoff: a human has claimed this conversation
    // (handoffStatus 'human') — the worker stops generating/sending
    // anything until it's released back to 'ai', so the bot and a person
    // never reply over each other. 'requested' (Agent Escalation) is only
    // a flag for attention and does NOT pause automation on its own — a
    // creator still needs the AI to keep responding while they notice and
    // pick it up.
    if (lead.handoffStatus === "human") return { advance: true };

    // Each delivery channel has its own readiness precondition, checked
    // independently: a DM needs the 24h messaging window open; a public
    // comment reply needs the comment id captured at ingestion (absent
    // only for events ingested before mediaId/commentId capture existed)
    // and has no window of its own. A campaign can want either, or both.
    const wantsDm = campaign.replyChannel === "dm" || campaign.replyChannel === "both";
    const wantsComment = campaign.replyChannel === "comment" || campaign.replyChannel === "both";
    const dmWindowOpen = !!lead.windowOpenUntil && lead.windowOpenUntil.getTime() >= Date.now();
    const dmReady = wantsDm && dmWindowOpen;
    const commentReady = wantsComment && !!event.commentId;

    if (!dmReady && !commentReady) {
      // Nothing deliverable for this event right now — DM's window is the
      // only one of the two preconditions that can ever become true later
      // (it doesn't, once closed), so there's no "retry later" here either.
      return { advance: true };
    }

    const account = await getSoleConnectedAccount(pool, job.tenantId);
    if (!account) return { advance: true }; // token was revoked/disconnected since the event was matched

    // The 750/hour ceiling this reserves against is Meta's DM/private-reply
    // limit specifically — it does not apply to a public comment reply, so
    // this gate only runs when a DM is actually going to be attempted.
    // R6-02/R6-03 fix: a single atomic reserve-and-record, replacing a
    // separate count-then-later-record pair. key_strict_fifo runs
    // different leads on the SAME account concurrently by design — the
    // exact viral-Reel burst this limiter exists to survive — so a
    // check-then-act count could let N concurrent workers each see a slot
    // free and each send. See accountSends.ts for the full reasoning.
    //
    // A 'both' campaign whose DM leg is rate-limited defers the WHOLE
    // event, including the comment leg that isn't itself capped — the
    // alternative (send the comment now, DM later) risks the comment being
    // sent twice on retry, since nothing here makes a resend idempotent.
    if (dmReady && !(await tryReserveSend(pool, job.tenantId, account.instagramAccountId, HOURLY_SEND_LIMIT))) {
      await enqueueLeadEvent(boss, job, { delaySeconds: RATE_LIMIT_RETRY_DELAY_SECONDS });
      return { advance: false };
    }

    const milestones = await listMilestones(pool, job.tenantId, campaign.id);
    const sourceText = (isCommentTrigger ? event.commentText : event.dmText) ?? "";
    // Conversation memory: prior turns for this lead, fed into the LLM
    // alongside sourceText so "what's my name?" right after "my name is
    // akash" can actually be answered — see conversationHistory.ts. Skipped
    // entirely for a rule_based campaign, which never calls the provider
    // and so never reads ctx.history.
    const history =
      campaign.replyMode === "rule_based"
        ? []
        : await getRecentConversationHistory(pool, job.tenantId, job.leadId, job.leadEventId, config.chatHistoryMaxTurns);
    // Governs prompt length/strictness (guardrails.ts), not delivery — a
    // message-triggered event is inherently private-origin, so it gets the
    // fuller "dm" prompt even if the campaign's reply_channel also tries a
    // public comment reply (which, for a DM-triggered event, never has a
    // comment id to attach to and so never actually fires — see
    // commentReady above).
    const tier = isCommentTrigger ? "comment" : "dm";
    // B10: one guard per event, shared by whichever path below actually
    // calls the provider — rule-based replies never reach it, so they
    // never count against the cap.
    const spendGuard = createAccountSpendGuard(pool, job.tenantId, account.instagramAccountId, aiDailyCallCap);

    // Phase 2B Trial Token Allowance: a cumulative cap for the WHOLE
    // trial, composed onto the existing per-account daily-call guard
    // rather than a second independent check — both share the same
    // reserve-before-call/release-on-failure shape, and generateReply/
    // runMilestoneCheck already only take one guard. Only trial tenants
    // pay the extra getTokenUsageSince query; every paid tier skips this
    // wrapper entirely.
    const effectiveSpendGuard: AiSpendGuard =
      tenant.planTier === "trial" && tenant.trialStartedAt
        ? {
            async tryConsume() {
              if (!(await spendGuard.tryConsume())) return false;
              const usage = await getTokenUsageSince(pool, job.tenantId, tenant.trialStartedAt!);
              if (usage.totalTokens >= getPlanTier("trial").tokenAllowance) {
                await spendGuard.release(); // undo the reservation just taken above
                return false;
              }
              return true;
            },
            release: () => spendGuard.release(),
          }
        : spendGuard;

    let replyText: string;
    let engine: SentReplyEngine;
    let capExceeded = false;
    let requiresHumanHandoff = false;
    let fellBackReason: string | undefined;
    let usage: GenerateReplyUsage | undefined;
    // R6-01: milestone progress (captured facts and/or advancement) is
    // computed here but only committed after a confirmed send, below.
    let commitMilestoneProgress: (() => Promise<void>) | null = null;

    if (milestones.length === 0 || campaign.replyMode === "rule_based") {
      // No Milestone Engine configured, or the campaign opted out of AI
      // entirely — plain B7 reply, no conversation-position tracking.
      const reply = await generateReply(
        {
          campaign,
          matchedKeyword: event.matchedKeyword,
          sourceText,
          username: event.username ?? undefined,
          tier,
          ctaLink: campaign.ctaLink ?? undefined,
          history,
        },
        provider,
        effectiveSpendGuard,
        rag,
      );
      replyText = reply.text;
      engine = reply.engine;
      capExceeded = reply.capExceeded ?? false;
      requiresHumanHandoff = reply.requiresHumanHandoff ?? false;
      fellBackReason = reply.fellBackReason;
      usage = reply.usage;
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
      const fieldDefinitions = await getFieldDefinitionValueTypes(pool, job.tenantId);

      const result = await runMilestoneCheck(
        {
          milestone: activeMilestone,
          capturedFactsSoFar,
          sourceText,
          username: event.username ?? undefined,
          tier,
          ctaLink: campaign.ctaLink ?? undefined,
          history,
          fieldDefinitions,
        },
        provider,
        effectiveSpendGuard,
        rag,
      );

      // Multi-field capture, partial-across-turns: a field answered this
      // turn must be persisted even when the milestone isn't fully
      // satisfied yet (some other requested field is still missing) — that
      // durable fact is what lets the NEXT turn's capturedFactsSoFar tell
      // the model to stop re-asking for it. Only advancing to the next
      // milestone (recordMilestoneAdvancement + setActiveMilestone) is
      // gated on full satisfaction.
      const hasNewCapturedValues = !!result.capturedValues && Object.keys(result.capturedValues).length > 0;
      if (hasNewCapturedValues || result.satisfied) {
        commitMilestoneProgress = async () => {
          if (hasNewCapturedValues) {
            await mergeCapturedFacts(pool, job.tenantId, job.leadId, result.capturedValues!);
          }
          if (result.satisfied) {
            await recordMilestoneAdvancement(pool, job.tenantId, job.leadId, campaign.id, activeMilestone.id);

            const next = await getNextMilestone(pool, job.tenantId, campaign.id, activeMilestone.ordinal);
            if (next) {
              await setActiveMilestone(pool, job.tenantId, job.leadId, next.id);
            }
          }
        };
      }

      replyText = result.reply;
      // The milestone branch only runs when campaign.replyMode is
      // 'ai_generated' (the outer if/else split above) — its only non-AI
      // output is the fail-closed generic fallback (fellBackReason set),
      // never a rule-based TEMPLATE the way the flat-reply branch has one.
      engine = result.fellBackReason ? "rule_based" : "ai_generated";
      capExceeded = result.capExceeded ?? false;
      requiresHumanHandoff = result.requiresHumanHandoff ?? false;
      fellBackReason = result.fellBackReason;
      usage = result.usage;
    }

    // Phase 2B Per-Tenant Usage Ledger: recorded as soon as usage is known
    // — a completed, billed provider call — not gated on the Instagram
    // send below succeeding. The tokens were spent regardless of whether
    // delivery later fails; that's a separate (DM failure) concern from
    // what the provider actually billed. Idempotent on lead_event_id, so
    // a job retry after a downstream failure can't double-record it.
    if (usage) {
      await recordTokenUsage(pool, {
        tenantId: job.tenantId,
        leadEventId: job.leadEventId,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
      });
    }

    if (capExceeded) {
      const message = "AI spend cap exceeded — degraded to rule-based reply";
      // eslint-disable-next-line no-console
      console.warn(message, { tenantId: job.tenantId, instagramAccountId: account.instagramAccountId });
      Sentry.captureMessage(message, {
        level: "warning",
        extra: { tenantId: job.tenantId, instagramAccountId: account.instagramAccountId },
      });

      // Phase 2A Agent Escalation: the one automatic trigger for this
      // phase — the AI ran out of budget for the day, a creator should
      // know. Guarded on the lead still being 'ai' so this only fires
      // once per lead (not on every subsequent capped event) and never
      // overwrites a human's own 'human'/'requested' choice.
      if (lead.handoffStatus === "ai") {
        await updateHandoffStatus(pool, { tenantId: job.tenantId, leadId: job.leadId, status: "requested" });
      }
    }

    // Phase 2C Escalation Triggers / Grounded-Answer-Only Fallback: unlike
    // capExceeded above, this actually PAUSES automation (status 'human',
    // not 'requested') — a tenant-configured escalation phrase or an
    // ungrounded question against a real knowledge base means a human
    // should take over this conversation, not just be flagged for
    // attention while the bot keeps replying. No "already human" guard
    // needed here — this function already returned early, above, for any
    // lead whose handoffStatus was already 'human'.
    if (requiresHumanHandoff) {
      await updateHandoffStatus(pool, { tenantId: job.tenantId, leadId: job.leadId, status: "human" });
    }

    // Every OTHER fallback reason (a classifyInput block, a provider
    // error/timeout, or an output-validation rejection) previously had NO
    // log line anywhere — capExceeded and requiresHumanHandoff each get
    // their own specific alert above; this is the catch-all for everything
    // else, so "the live reply fell back to rule-based" is diagnosable
    // from logs instead of only reproducible by re-triggering it live.
    if (fellBackReason && !capExceeded && !requiresHumanHandoff) {
      const message = "AI reply fell back to rule-based";
      // eslint-disable-next-line no-console
      console.warn(message, { tenantId: job.tenantId, campaignId: campaign.id, fellBackReason });
      Sentry.captureMessage(message, {
        level: "warning",
        extra: { tenantId: job.tenantId, campaignId: campaign.id, fellBackReason },
      });
    }

    const token = await getDecryptedToken(pool, keyring, job.tenantId, account.instagramAccountId);
    if (!token) return { advance: true }; // disconnected between the reservation above and now; the reserved slot goes unused

    let delivered = false;
    if (dmReady) {
      const sendResult = await sendInstagramMessage(token, lead.instagramUserId, replyText);
      delivered = true;
      // Recorded per actual channel send, not per event — a 'both'-channel
      // campaign makes two real Instagram API calls below and now produces
      // two rows, matching what actually went out. Previously nothing
      // anywhere persisted what the bot sent back at all; the dashboard
      // timeline (leadTimeline.ts) showed only the customer's half of the
      // conversation.
      //
      // metaMessageId (when Meta's response includes one) is what lets
      // webhookIngestService.ts's echo-ingestion recognize Meta's later
      // echo of THIS send as already-recorded, instead of mistaking it for
      // a human agent's own reply.
      await recordSentReply(pool, {
        tenantId: job.tenantId,
        leadId: job.leadId,
        leadEventId: job.leadEventId,
        channel: "dm",
        engine,
        text: replyText,
        metaMessageId: sendResult?.metaMessageId ?? null,
      });
    }
    if (commentReady) {
      await sendInstagramCommentReply(token, event.commentId!, replyText);
      delivered = true;
      await recordSentReply(pool, {
        tenantId: job.tenantId,
        leadId: job.leadId,
        leadEventId: job.leadEventId,
        channel: "comment",
        engine,
        text: replyText,
      });
    }

    // R6-01: only commit milestone advancement once at least one channel
    // actually delivered — a throw above propagates out of this handler
    // and the job retries with nothing committed yet, so the retry redoes
    // the LLM/milestone work cleanly instead of skipping ahead.
    if (commitMilestoneProgress && delivered) {
      await commitMilestoneProgress();
    }

    return { advance: true };
  };
}
