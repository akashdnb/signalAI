import { afterEach, describe, expect, it, vi } from "vitest";

import {
  JourneyActionWorkerLoop,
} from "../workerLoop.js";

describe("JourneyActionWorkerLoop", () => {
  const loops: JourneyActionWorkerLoop[] = [];

  afterEach(async () => {
    for (const loop of loops.splice(0)) {
      await loop.stop();
    }

    vi.useRealTimers();
  });

  it("processes work continuously", async () => {
    let calls = 0;

    const worker = {
      processOne: vi.fn(async () => {
        calls += 1;

        if (calls >= 3) {
          return {
            claimed: false,
            acknowledged: false,
          };
        }

        return {
          claimed: true,
          acknowledged: true,
          actionId: `action-${calls}`,
        };
      }),
    };

    const loop = new JourneyActionWorkerLoop(
      worker,
      {
        concurrency: 1,
        pollIntervalMs: 1,
        maxPollIntervalMs: 10,
      },
    );

    loops.push(loop);

    const startPromise = loop.start();

    await vi.waitFor(
      () => {
        expect(calls).toBeGreaterThanOrEqual(3);
      },
      {
        timeout: 1000,
      },
    );

    await loop.stop();
    await startPromise;

    expect(loop.isRunning).toBe(false);
    expect(loop.getStats().processed).toBe(2);
    expect(loop.getStats().emptyPolls).toBeGreaterThanOrEqual(1);
  });

  it("keeps running after a worker error", async () => {
    let calls = 0;

    const worker = {
      processOne: vi.fn(async () => {
        calls += 1;

        if (calls === 1) {
          throw new Error("temporary database failure");
        }

        if (calls >= 3) {
          return {
            claimed: false,
            acknowledged: false,
          };
        }

        return {
          claimed: true,
          acknowledged: true,
          actionId: "action-1",
        };
      }),
    };

    const loop = new JourneyActionWorkerLoop(
      worker,
      {
        concurrency: 1,
        pollIntervalMs: 1,
        maxPollIntervalMs: 10,
      },
    );

    loops.push(loop);

    const startPromise = loop.start();

    await vi.waitFor(
      () => {
        expect(calls).toBeGreaterThanOrEqual(3);
      },
      {
        timeout: 1000,
      },
    );

    await loop.stop();
    await startPromise;

    expect(loop.getStats().errors).toBe(1);
    expect(loop.getStats().processed).toBe(1);
  });

  it("runs the configured number of workers concurrently", async () => {
    let active = 0;
    let maxActive = 0;
    let calls = 0;

    const worker = {
      processOne: vi.fn(async () => {
        calls += 1;
        active += 1;
        maxActive = Math.max(maxActive, active);

        await new Promise((resolve) =>
          setTimeout(resolve, 10),
        );

        active -= 1;

        if (calls >= 4) {
          return {
            claimed: false,
            acknowledged: false,
          };
        }

        return {
          claimed: true,
          acknowledged: true,
          actionId: `action-${calls}`,
        };
      }),
    };

    const loop = new JourneyActionWorkerLoop(
      worker,
      {
        concurrency: 3,
        pollIntervalMs: 1,
        maxPollIntervalMs: 10,
      },
    );

    loops.push(loop);

    const startPromise = loop.start();

    await vi.waitFor(
      () => {
        expect(calls).toBeGreaterThanOrEqual(4);
      },
      {
        timeout: 1000,
      },
    );

    await loop.stop();
    await startPromise;

    expect(maxActive).toBeGreaterThan(1);
    expect(maxActive).toBeLessThanOrEqual(3);
  });

  it("can be started and stopped repeatedly", async () => {
    const worker = {
      processOne: vi.fn(async () => ({
        claimed: false,
        acknowledged: false,
      })),
    };

    const loop = new JourneyActionWorkerLoop(
      worker,
      {
        concurrency: 1,
        pollIntervalMs: 1,
        maxPollIntervalMs: 5,
      },
    );

    loops.push(loop);

    const firstStart = loop.start();

    await vi.waitFor(() => {
      expect(worker.processOne).toHaveBeenCalled();
    });

    await loop.stop();
    await firstStart;

    expect(loop.isRunning).toBe(false);

    const callsAfterFirstStop =
      worker.processOne.mock.calls.length;

    const secondStart = loop.start();

    await vi.waitFor(() => {
      expect(worker.processOne.mock.calls.length).toBeGreaterThan(
        callsAfterFirstStop,
      );
    });

    await loop.stop();
    await secondStart;

    expect(loop.isRunning).toBe(false);
  });

  it("does not start duplicate loops when start is called twice", async () => {
    let active = 0;
    let maxActive = 0;

    const worker = {
      processOne: vi.fn(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);

        await new Promise((resolve) =>
          setTimeout(resolve, 5),
        );

        active -= 1;

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
        pollIntervalMs: 1,
        maxPollIntervalMs: 5,
      },
    );

    loops.push(loop);

    const first = loop.start();
    const second = loop.start();

    await vi.waitFor(() => {
      expect(worker.processOne).toHaveBeenCalled();
    });

    await loop.stop();

    await Promise.all([first, second]);

    expect(maxActive).toBe(1);
  });

  it("rejects invalid configuration", () => {
    const worker = {
      processOne: vi.fn(),
    };

    expect(
      () =>
        new JourneyActionWorkerLoop(worker, {
          concurrency: 0,
        }),
    ).toThrow(
      "Worker concurrency must be >= 1",
    );

    expect(
      () =>
        new JourneyActionWorkerLoop(worker, {
          pollIntervalMs: -1,
        }),
    ).toThrow(
      "Worker pollIntervalMs must be >= 0",
    );

    expect(
      () =>
        new JourneyActionWorkerLoop(worker, {
          pollIntervalMs: 100,
          maxPollIntervalMs: 50,
        }),
    ).toThrow(
      "Worker maxPollIntervalMs must be >= pollIntervalMs",
    );
  });
});
