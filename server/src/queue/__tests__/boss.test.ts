import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = {
  QUEUE_USE_LISTEN_NOTIFY: process.env.QUEUE_USE_LISTEN_NOTIFY,
  QUEUE_INTERACTIVE_POLL_SECONDS: process.env.QUEUE_INTERACTIVE_POLL_SECONDS,
  QUEUE_INTERACTIVE_NOTIFY_POLL_SECONDS: process.env.QUEUE_INTERACTIVE_NOTIFY_POLL_SECONDS,
  QUEUE_FAST_POLL_SECONDS: process.env.QUEUE_FAST_POLL_SECONDS,
  QUEUE_FAST_NOTIFY_POLL_SECONDS: process.env.QUEUE_FAST_NOTIFY_POLL_SECONDS,
  QUEUE_BACKGROUND_POLL_SECONDS: process.env.QUEUE_BACKGROUND_POLL_SECONDS,
  QUEUE_BACKGROUND_NOTIFY_POLL_SECONDS: process.env.QUEUE_BACKGROUND_NOTIFY_POLL_SECONDS,
};

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
});

describe("queue configuration", () => {
  it("defaults LISTEN/NOTIFY off and keeps interactive work faster than background work", async () => {
    const { getQueueConfig } = await import("../boss.js");
    const config = getQueueConfig({});

    expect(config.useListenNotify).toBe(false);
    expect(config.interactivePoll.pollingIntervalSeconds).toBe(10);
    expect(config.interactivePoll.notifyPollingIntervalSeconds).toBe(10);
    expect(config.fastPoll.pollingIntervalSeconds).toBe(30);
    expect(config.fastPoll.notifyPollingIntervalSeconds).toBe(60);
    expect(config.backgroundPoll.pollingIntervalSeconds).toBe(300);
    expect(config.backgroundPoll.notifyPollingIntervalSeconds).toBe(600);
  });

  it("honors explicit queue environment overrides", async () => {
    const { getQueueConfig } = await import("../boss.js");
    const config = getQueueConfig({
      QUEUE_USE_LISTEN_NOTIFY: "true",
      QUEUE_INTERACTIVE_POLL_SECONDS: "7",
      QUEUE_INTERACTIVE_NOTIFY_POLL_SECONDS: "8",
      QUEUE_FAST_POLL_SECONDS: "20",
      QUEUE_FAST_NOTIFY_POLL_SECONDS: "40",
      QUEUE_BACKGROUND_POLL_SECONDS: "120",
      QUEUE_BACKGROUND_NOTIFY_POLL_SECONDS: "240",
    });

    expect(config.useListenNotify).toBe(true);
    expect(config.interactivePoll).toEqual({ pollingIntervalSeconds: 7, notifyPollingIntervalSeconds: 8 });
    expect(config.fastPoll).toEqual({ pollingIntervalSeconds: 20, notifyPollingIntervalSeconds: 40 });
    expect(config.backgroundPoll).toEqual({ pollingIntervalSeconds: 120, notifyPollingIntervalSeconds: 240 });
  });

  it("sets existing queues to notify=false by default", async () => {
    delete process.env.QUEUE_USE_LISTEN_NOTIFY;
    vi.resetModules();
    const { ensureNotifyQueue, QUEUE_USE_LISTEN_NOTIFY } = await import("../boss.js");
    const boss = {
      createQueue: vi.fn().mockResolvedValue(undefined),
      updateQueue: vi.fn().mockResolvedValue(undefined),
    };

    await ensureNotifyQueue(boss as never, "instagram-inbound");

    expect(QUEUE_USE_LISTEN_NOTIFY).toBe(false);
    expect(boss.createQueue).toHaveBeenCalledWith("instagram-inbound", { notify: false });
    expect(boss.updateQueue).toHaveBeenCalledWith("instagram-inbound", { notify: false });
  });

  it("sets existing queues to notify=true when LISTEN/NOTIFY is explicitly enabled", async () => {
    process.env.QUEUE_USE_LISTEN_NOTIFY = "true";
    vi.resetModules();
    const { ensureNotifyQueue, QUEUE_USE_LISTEN_NOTIFY } = await import("../boss.js");
    const boss = {
      createQueue: vi.fn().mockResolvedValue(undefined),
      updateQueue: vi.fn().mockResolvedValue(undefined),
    };

    await ensureNotifyQueue(boss as never, "instagram-inbound");

    expect(QUEUE_USE_LISTEN_NOTIFY).toBe(true);
    expect(boss.createQueue).toHaveBeenCalledWith("instagram-inbound", { notify: true });
    expect(boss.updateQueue).toHaveBeenCalledWith("instagram-inbound", { notify: true });
  });
});
