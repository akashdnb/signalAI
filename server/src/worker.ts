import { config } from "./config.js";
import { getPool } from "./db/pool.js";
import {
  createProductionJourneyActionDispatcher,
} from "./domain/journey/actions/createProductionDispatcher.js";
import { createWorkerProcess } from "./domain/journey/actions/workerProcess.js";

function assertWorkerConfig(): void {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is required for the journey worker",
    );
  }

  if (config.tokenKeyring.size === 0) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEYS is required for the journey worker",
    );
  }
}

async function main(): Promise<void> {
  assertWorkerConfig();

  const pool = getPool();

  const dispatcher =
    createProductionJourneyActionDispatcher({
      pool,
    });

  const workerProcess =
    createWorkerProcess({
      dispatcher,
    });

  let shuttingDown = false;

  const shutdown = async (
    signal: string,
  ): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    console.info(
      `Received ${signal}; shutting down journey worker`,
    );

    await workerProcess.stop();
  };

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });

  await workerProcess.loop.start();
}

void main().catch((error) => {
  console.error(
    "Journey worker failed to start",
    error,
  );

  process.exit(1);
});
