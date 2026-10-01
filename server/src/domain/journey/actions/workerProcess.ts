import type { Pool } from "pg";

import { getPool, closePool } from "../../../db/pool.js";
import { ActionDispatcher } from "./dispatcher.js";
import { JourneyActionWorker } from "./worker.js";
import { createJourneyActionWorkerLoop } from "./workerLoop.js";

export interface WorkerProcessDependencies {
  dispatcher: ActionDispatcher;

  /*
   * Embedded mode:
   *   pass the API process' existing pool.
   *
   * Standalone mode:
   *   omit this and a dedicated pool will be created.
   */
  pool?: Pool;

  /*
   * Only relevant when the process owns the pool.
   *
   * Standalone worker:
   *   true
   *
   * Embedded worker:
   *   false
   */
  closePoolOnStop?: boolean;
}

export function createWorkerProcess(
  dependencies: WorkerProcessDependencies,
) {
  const pool = dependencies.pool ?? getPool();

  const ownsPool =
    dependencies.closePoolOnStop ??
    dependencies.pool == null;

  const worker = new JourneyActionWorker(
    pool,
    dependencies.dispatcher,
  );

  const loop = createJourneyActionWorkerLoop(
    worker,
    {
      concurrency: Number(
        process.env.JOURNEY_WORKER_CONCURRENCY ?? "2",
      ),
      pollIntervalMs: Number(
        process.env.JOURNEY_WORKER_POLL_INTERVAL_MS ?? "250",
      ),
      maxPollIntervalMs: Number(
        process.env.JOURNEY_WORKER_MAX_POLL_INTERVAL_MS ?? "5000",
      ),
    },
    {
      info(message, metadata) {
        console.info(message, metadata ?? {});
      },
      error(message, metadata) {
        console.error(message, metadata ?? {});
      },
    },
  );

  return {
    loop,

    async stop() {
      await loop.stop();

      if (ownsPool) {
        await closePool();
      }
    },
  };
}
