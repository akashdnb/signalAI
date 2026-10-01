import { describe, expect, it, vi } from "vitest";

import { SendMessageHandler } from "../handlers/sendMessageHandler.js";

describe("SendMessageHandler", () => {
  it("maps the journey action to MessageSender", async () => {
    const send = vi.fn().mockResolvedValue(undefined);

    const handler = new SendMessageHandler({ send });

    await handler.execute({
      action: {
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
      },
      execution: {
        executionId: "execution-123",
        tenantId: "tenant-123",
        campaignId: "campaign-123",
        subjectKey: "instagram-user-123",
      },
      idempotencyKey: "action-123",
    });

    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith({
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

  it("propagates provider errors", async () => {
    const send = vi
      .fn()
      .mockRejectedValue(new Error("provider unavailable"));

    const handler = new SendMessageHandler({ send });

    await expect(
      handler.execute({
        action: {
          id: "action-123",
          executionId: "execution-123",
          nodeExecutionId: "node-execution-123",
          actionType: "SEND_MESSAGE",
          payload: { text: "Hello" },
          status: "processing",
          attemptCount: 0,
          nextAttemptAt: null,
          lastError: null,
          createdAt: "2026-10-01T00:00:00.000Z",
          acknowledgedAt: null,
          claimedAt: "2026-10-01T00:00:00.000Z",
        },
        execution: {
          executionId: "execution-123",
          tenantId: "tenant-123",
          campaignId: "campaign-123",
          subjectKey: "instagram-user-123",
        },
        idempotencyKey: "action-123",
      }),
    ).rejects.toThrow("provider unavailable");
  });
});
