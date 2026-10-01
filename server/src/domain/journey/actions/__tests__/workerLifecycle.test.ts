import { describe, expect, it, vi } from "vitest";

import {
  JourneyActionWorkerLoop,
} from "../workerLoop.js";

describe("JourneyActionWorkerLoop lifecycle", () => {
  it("waits for an in-flight action before stopping", async () => {
    let releaseAction!: () => void;

    const actionFinished = new Promise<void>((resolve) => {
      releaseAction = resolve;
    });

    let started = false;
    let finished = false;

    const worker = {
      processOne: vi.fn(async () => {
        if (!started) {
          started = true;

          await actionFinished;

          finished = true;
        }

        return {
          claimed: false,
          acknowledged: false,
        };
      }),
    };

    const loop = new JourneyActionWorkerLoop(
      worker,
      {
        concurrency: 1,
        pollIntervalMs: 0,
        maxPollIntervalMs: 1,
      },
    );

    const startPromise = loop.start();

    await vi.waitFor(() => {
      expect(started).toBe(true);
    });

    const stopPromise = loop.stop();

    /*
     * The loop must not finish while processOne() is still
     * executing.
     */
    await new Promise((resolve) =>
      setTimeout(resolve, 5),
    );

    expect(finished).toBe(false);

    releaseAction();

    await stopPromise;
    await startPromise;

    expect(finished).toBe(true);
    expect(loop.isRunning).toBe(false);
  });
});
