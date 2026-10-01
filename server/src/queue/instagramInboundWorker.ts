import type {
  Job,
  PgBoss,
} from "pg-boss";
import type { Pool } from "pg";

import {
  getPool,
} from "../db/pool.js";

import {
  JourneyRuntime,
} from "../domain/journey/runtime.js";

import {
  processPersistedInstagramInboundEvent,
} from "../domain/journey/webhooks/processInstagramMessage.js";

import {
  INSTAGRAM_INBOUND_QUEUE,
  type InstagramInboundJob,
} from "./instagramInboundQueue.js";

export function startInstagramInboundWorker(
  boss: PgBoss,
  pool: Pool = getPool(),
): Promise<string> {
  const runtime =
    new JourneyRuntime(pool);

  return boss.work<InstagramInboundJob>(
    INSTAGRAM_INBOUND_QUEUE,
    {
      batchSize: 1,
      localConcurrency: 1,
    },
    async (
      jobs: Job<InstagramInboundJob>[],
    ) => {
      await Promise.all(
        jobs.map(
          async (job) => {
            await processPersistedInstagramInboundEvent(
              {
                pool,
                runtime,
              },
              job.data.inboundEventId,
            );
          },
        ),
      );
    },
  );
}
