import type { PgBoss } from "pg-boss";
import type { PoolClient } from "pg";
import { config } from "../config.js";
import { sendTelegramAlert } from "../lib/telegram.js";
import { asPgBossDb } from "./leadEventsQueue.js";

export const ALERTS_QUEUE = "alerts";

export interface NewLeadAlertJob {
  type: "new_lead";
  tenantId: string;
  leadId: string;
}

export async function ensureAlertsQueue(boss: PgBoss): Promise<void> {
  await boss.createQueue(ALERTS_QUEUE);
}

/**
 * R9-01 fix: `webhookIngestService.ts` used to await `sendTelegramAlert`
 * (an external HTTP call, 5s timeout) inline in the request path — every
 * new lead added that round-trip to Meta's ack latency, and it degraded
 * worst exactly when it mattered most: a viral Reel is mostly new leads,
 * so nearly every event in a burst paid it, right as Telegram's own
 * per-chat rate limit (~20 msg/min) started throttling the calls anyway.
 * `enqueueNewLeadAlert` is a fast local insert (no external call) — the
 * actual Telegram send happens in `startAlertsWorker`, off the ack path
 * entirely.
 *
 * `client`, when passed, rides the caller's own transaction (same
 * `Db`/`IDatabase` adapter as `enqueueLeadEvent`) — the alert job commits
 * or rolls back atomically with the rest of the ingest, so a lead that
 * never actually lands (a later failure in the same transaction) never
 * gets alerted on.
 */
export async function enqueueNewLeadAlert(
  boss: PgBoss,
  params: { tenantId: string; leadId: string },
  options?: { client?: PoolClient },
): Promise<void> {
  const job: NewLeadAlertJob = { type: "new_lead", ...params };
  await boss.send(ALERTS_QUEUE, job, {
    ...(options?.client ? { db: asPgBossDb(options.client) } : {}),
  });
}

/**
 * R9-02 fix: the alert carries only `leadId`/`tenantId` and a dashboard
 * link — never the lead's username. A Telegram chat is a third-party
 * store the Data Deletion Callback's `hardScrubLead` can never reach;
 * copying PII into it would mean a deletion request could no longer
 * satisfy erasure, since a scrubbed username would still sit in the
 * alert history (and, for the unconfigured path, in stdout).
 */
export function startAlertsWorker(boss: PgBoss): Promise<string> {
  return boss.work<NewLeadAlertJob>(ALERTS_QUEUE, async (jobs) => {
    for (const job of jobs) {
      if (job.data.type === "new_lead") {
        const link = `${config.appBaseUrl}/tenants/${job.data.tenantId}/leads/${job.data.leadId}`;
        await sendTelegramAlert(`👋 New lead: ${link}`);
      }
    }
  });
}
