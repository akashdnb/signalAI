import "./lib/sentryInit.js"; // must be the first import — see sentryInit.ts for why a statement here wasn't enough
import { Sentry } from "./lib/sentry.js";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { getPool } from "./db/pool.js";
import { getBoss } from "./queue/boss.js";
import { ensureQueues, LEAD_EVENTS_DLQ } from "./queue/leadEventsQueue.js";
import { ensureTokenRefreshQueue, startTokenRefreshWorker } from "./queue/tokenRefreshQueue.js";
import { ensureDataDeletionQueue, startDataDeletionWorker } from "./queue/dataDeletionQueue.js";
import { startDeadLetterWatcher, startLeadEventsWorker, sweepWedgedLeadEventJobs } from "./queue/worker.js";
import { createLLMProviderFromEnv } from "./llm/factory.js";
import type { LLMProvider } from "./llm/provider.js";
import { createLeadEventReplyHandler } from "./services/leadEventReplyHandler.js";
import { assertKeyringConfigured } from "./lib/tokenVault.js";
import { pruneExpiredNonces } from "./db/oauthNonces.js";

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
  // R1-10: fail at boot, not at the first token write in production —
  // this gates the whole account-connection flow, unlike the LLM provider
  // below, which has a real degrade-gracefully path.
  assertKeyringConfigured(config.tokenKeyring);

  const pool = getPool();
  const boss = await getBoss();
  const llmProvider = loadLLMProviderOrFallback();

  await ensureQueues(boss);
  await ensureTokenRefreshQueue(boss);
  await ensureDataDeletionQueue(boss);

  await startLeadEventsWorker(
    boss,
    pool,
    createLeadEventReplyHandler(pool, boss, llmProvider, config.tokenKeyring),
  );
  await startDataDeletionWorker(boss, pool);

  // R1-04 fix: this used to be console.error only — stdout in a Render
  // container nobody is watching, which didn't meet B4's own done-condition
  // ("fires an alert instead of wedging a lead forever"). Telegram alerting
  // (B11) will add a second channel here once it exists; Sentry alone
  // already closes the "nobody finds out" gap this finding was about.
  await startDeadLetterWatcher(boss, pool, async (job) => {
    const message = `Lead event permanently failed, wedged at ${LEAD_EVENTS_DLQ}`;
    // eslint-disable-next-line no-console
    console.error(message, job);
    Sentry.captureMessage(message, { level: "error", extra: { job } });
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

  // R5-03: spent_oauth_nonces has no other cleanup path — rows are only
  // ever useful for the state's own 10-minute lifetime.
  const prunedNonces = await pruneExpiredNonces(pool);
  if (prunedNonces > 0) {
    // eslint-disable-next-line no-console
    console.log(`Pruned ${prunedNonces} expired OAuth nonce(s) on boot`);
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
    }
  });

  const app = createApp();
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
