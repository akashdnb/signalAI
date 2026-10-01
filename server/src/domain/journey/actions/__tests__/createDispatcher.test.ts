import { describe, expect, it, vi } from "vitest";

import { createJourneyActionDispatcher } from "../createDispatcher.js";

describe("createJourneyActionDispatcher", () => {
  it("registers the SEND_MESSAGE handler", async () => {
    const messageSender = {
      send: vi.fn().mockResolvedValue(undefined),
    };

    const dispatcher = createJourneyActionDispatcher({
      messageSender,
      handoffHandler: {
        handoff: vi.fn().mockResolvedValue(undefined),
      },
      actionLinkHandler: {
        open: vi.fn().mockResolvedValue(undefined),
      },
    });

    await dispatcher.dispatch({
      id: "action-123",
      executionId: "execution-123",
      nodeExecutionId: "node-execution-123",
      actionType: "SEND_MESSAGE",
      payload: {
        text: "Hello",
      },
      status: "processing",
      attemptCount: 0,
      nextAttemptAt: null,
      lastError: null,
      createdAt: "2026-10-01T00:00:00.000Z",
      acknowledgedAt: null,
      claimedAt: "2026-10-01T00:00:00.000Z",
    }, {
      executionId: "execution-123",
      tenantId: "tenant-123",
      campaignId: "campaign-123",
      subjectKey: "instagram-user-123",
    });

    expect(messageSender.send).toHaveBeenCalledOnce();
    expect(messageSender.send).toHaveBeenCalledWith({
      idempotencyKey: "action-123",
      tenantId: "tenant-123",
      subjectKey: "instagram-user-123",
      executionId: "execution-123",
      actionId: "action-123",
      payload: {
        text: "Hello",
      },
    });
  });
});
