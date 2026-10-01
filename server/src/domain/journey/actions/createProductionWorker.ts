import type { Pool } from "pg";

import { getPool } from "../../../db/pool.js";
import {
  createProductionJourneyActionDispatcher,
} from "./createProductionDispatcher.js";
import { createWorkerProcess } from "./workerProcess.js";

export interface CreateProductionJourneyWorkerDependencies {
  /*
   * Pass the API pool in embedded mode.
   *
   * Omit it in standalone mode so the worker process owns
   * the pool lifecycle itself.
   */
  pool?: Pool;
}

export function createProductionJourneyWorker(
  dependencies: CreateProductionJourneyWorkerDependencies = {},
) {
  const pool =
    dependencies.pool ??
    getPool();

  const dispatcher =
    createProductionJourneyActionDispatcher({
      pool,
    });

  return createWorkerProcess({
    pool,
    dispatcher,

    /*
     * Embedded API worker must never close the API's shared pool.
     *
     * Standalone worker owns the pool and therefore closes it on stop.
     */
    closePoolOnStop:
      dependencies.pool == null,
  });
}
