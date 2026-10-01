import { createWorkerProcess } from "./domain/journey/actions/workerProcess.js";

/*
 * 4F worker process composition root.
 *
 * Provider construction is intentionally not hard-coded here.
 * The Instagram tenant/provider registry is wired in the application
 * composition layer in the next provider integration milestone.
 */

function createNotConfiguredDispatcher(): never {
  throw new Error(
    "Journey worker provider registry is not configured. " +
      "Wire the tenant-aware Instagram MessageSender before starting the worker.",
  );
}

async function main(): Promise<void> {
  const dependencies = {
    dispatcher: createNotConfiguredDispatcher(),
  };

  const workerProcess = createWorkerProcess(dependencies);

  const shutdown = async (signal: string) => {
    console.info(`Received ${signal}; shutting down journey worker`);

    await workerProcess.stop();

    globalThis.process.exit(0);
  };

  await workerProcess.loop.start();
}

void main().catch((error) => {
  console.error("Journey worker failed to start", error);
  process.exit(1);
});
