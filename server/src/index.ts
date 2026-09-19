import "./lib/sentryInit.js"; // must be the first import — see sentryInit.ts for why a statement here wasn't enough
import { Sentry } from "./lib/sentry.js";
import { createApp } from "./app.js";
import { config, assertRequiredConfig } from "./config.js";
import { getPool } from "./db/pool.js";
import { getBoss } from "./queue/boss.js";
import { ensureQueues, LEAD_EVENTS_DLQ } from "./queue/leadEventsQueue.js";
import { ensureTokenRefreshQueue, startTokenRefreshWorker } from "./queue/tokenRefreshQueue.js";
import { ensureDataDeletionQueue, startDataDeletionWorker } from "./queue/dataDeletionQueue.js";
import { startDeadLetterWatcher, startLeadEventsWorker, sweepWedgedLeadEventJobs } from "./queue/worker.js";
import { createLLMProviderFromEnv } from "./llm/factory.js";
import type { LLMProvider } from "./llm/provider.js";
import { createLeadEventReplyHandler } from "./services/leadEventReplyHandler.js";
import { pruneExpiredNonces } from "./db/oauthNonces.js";
import { pruneOldAiCallUsage } from "./db/aiCallUsage.js";
import { pruneExpiredMagicLinkTokens } from "./db/magicLinkTokens.js";
import { ensureMaintenanceQueue, startMaintenanceWorker } from "./queue/maintenanceQueue.js";
import { ensureAlertsQueue, startAlertsWorker } from "./queue/alertsQueue.js";
import { sendTelegramAlert } from "./lib/telegram.js";

/**
 * Every Phase 1 campaign defaults to rule_based, which never calls this —
 * so an unconfigured LLM provider must not crash startup. It degrades to
 * "every ai_generated campaign fails closed to its rule-based reply"
 * (replyEngine's own fallback path), not a boot failure.
 */
function loadLLMProviderOrFallback(): LLMProvider {
  try {
    return createLLMProviderFromEnv();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      name: "unconfigured",
      generateReply: async () => {
        throw new Error(`LLM provider unavailable: ${message}`);
      },
    };
  }
}

async function main() {
  // Every required setting is checked in one place (see config.ts for why,
  // and for what counts as required). Each of these previously failed far
  // from its cause — an empty keyring at the first token write, an empty
  // SESSION_SECRET as forgeable sessions, an unset WEB_APP_ORIGIN as a
  // wildcard CORS origin, unset Instagram credentials as a dead authorize
  // URL, an unset verify token as a webhook Meta refuses to validate. The
  // LLM provider is deliberately NOT here: it has a real degrade-gracefully
  // path, and so do Stripe, Telegram and Sentry.
  assertRequiredConfig();

  const pool = getPool();
  const boss = await getBoss();
  const llmProvider = loadLLMProviderOrFallback();

  await ensureQueues(boss);
  await ensureTokenRefreshQueue(boss);
  await ensureDataDeletionQueue(boss);
  await ensureMaintenanceQueue(boss);
  await startMaintenanceWorker(boss, pool);
  await ensureAlertsQueue(boss);
  await startAlertsWorker(boss);

  await startLeadEventsWorker(
    boss,
    pool,
    createLeadEventReplyHandler(pool, boss, llmProvider, config.tokenKeyring, config.aiDailyCallCap),
  );
  await startDataDeletionWorker(boss, pool);

  // R1-04 fix: this used to be console.error only — stdout in a Render
  // container nobody is watching, which didn't meet B4's own done-condition
  // ("fires an alert instead of wedging a lead forever"). B11 adds
  // Telegram as a second channel alongside Sentry.
  await startDeadLetterWatcher(boss, pool, async (job) => {
    const message = `Lead event permanently failed, wedged at ${LEAD_EVENTS_DLQ}`;
    // eslint-disable-next-line no-console
    console.error(message, job);
    Sentry.captureMessage(message, { level: "error", extra: { job } });
    await sendTelegramAlert(`🚨 ${message}\n${JSON.stringify(job)}`);
  });

  // R3-08: catches up on any wedged keys whose failure happened while no
  // DLQ worker was listening (e.g. a crash mid-outage) — otherwise those
  // leads stay silently stuck until the next unrelated DLQ event.
  const swept = await sweepWedgedLeadEventJobs(boss, pool);
  if (swept > 0) {
    // eslint-disable-next-line no-console
    console.warn(`Swept ${swept} wedged lead-event job(s) on boot`);
    Sentry.captureMessage(`Swept ${swept} wedged lead-event job(s) on boot`, { level: "warning" });
  }

  // R5-03/R8-01: spent_oauth_nonces has no other cleanup path — rows are
  // only ever useful for the state's own 10-minute lifetime. This boot-time
  // pass plus the recurring maintenance job above (which does the same
  // prune hourly) means it's bounded regardless of how long this process
  // stays up between deploys.
  const prunedNonces = await pruneExpiredNonces(pool);
  if (prunedNonces > 0) {
    // eslint-disable-next-line no-console
    console.log(`Pruned ${prunedNonces} expired OAuth nonce(s) on boot`);
  }

  // R7-04: ai_call_usage is read on every single AI reply, so unbounded
  // growth here is worse than its sibling tables, not just as bad.
  // (account_sends is deliberately not pruned — see accountSends.ts's
  // pruneOldSends docstring: it's now the durable source for the "DMs
  // sent" analytics number, so pruning it would make the dashboard wrong.)
  const prunedAiCalls = await pruneOldAiCallUsage(pool);
  if (prunedAiCalls > 0) {
    // eslint-disable-next-line no-console
    console.log(`Pruned ${prunedAiCalls} expired ai_call_usage row(s) on boot`);
  }

  // R14-04: magic_link_tokens is scanned on every /auth/email/request
  // (the per-email/per-IP rate-limit counts) — same reasoning as
  // ai_call_usage above, just for the sign-in path instead of the AI path.
  const prunedMagicLinkTokens = await pruneExpiredMagicLinkTokens(pool);
  if (prunedMagicLinkTokens > 0) {
    // eslint-disable-next-line no-console
    console.log(`Pruned ${prunedMagicLinkTokens} expired magic_link_token row(s) on boot`);
  }

  await startTokenRefreshWorker(boss, pool, config.tokenKeyring, async (results) => {
    const failures = results.filter((r) => !r.ok);
    if (failures.length > 0) {
      // eslint-disable-next-line no-console
      console.error("Token refresh failures (Account Health Monitoring):", failures);
      Sentry.captureMessage("Token refresh failures (Account Health Monitoring)", {
        level: "error",
        extra: { failures },
      });
      await sendTelegramAlert(`⚠️ Token refresh failure(s) — Account Health Monitoring:\n${JSON.stringify(failures)}`);
    }
  });

  const app = createApp({ llmProvider });
  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`signalAI server listening on :${config.port} (${config.nodeEnv})`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal startup error:", err);
  Sentry.captureException(err);
  process.exit(1);
});
