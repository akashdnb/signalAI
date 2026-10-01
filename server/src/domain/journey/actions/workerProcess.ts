import { getPool, closePool } from "../../../db/pool.js";
import { ActionDispatcher } from "./dispatcher.js";
import { JourneyActionWorker } from "./worker.js";
import { createJourneyActionWorkerLoop } from "./workerLoop.js";

/*
 * This is intentionally a composition root.
 *
 * Provider construction will be completed when the application's
 * tenant/provider registry is wired in. For now the process is
 * implemented as a reusable lifecycle entrypoint.
 */

export interface WorkerProcessDependencies {
  dispatcher: ActionDispatcher;
}

export function createWorkerProcess(
  dependencies: WorkerProcessDependencies,
) {
  const pool = getPool();

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
      await closePool();
    },
  };
}
