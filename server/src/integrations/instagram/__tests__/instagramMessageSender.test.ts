import { describe, expect, it, vi } from "vitest";

import {
  InstagramMessageSender,
} from "../instagramMessageSender.js";

describe("InstagramMessageSender", () => {
  it("maps a journey message action to Instagram", async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);

    const sender = new InstagramMessageSender(
      {
        sendMessage,
      },
      {
        accessToken: "token-123",
      },
    );

    await sender.send({
      idempotencyKey: "action-123",
      tenantId: "tenant-1",
      subjectKey: "instagram-user-123",
      executionId: "execution-1",
      actionId: "action-123",
      payload: {
        text: "Hello from SignalAI",
      },
    });

    expect(sendMessage).toHaveBeenCalledWith({
      accessToken: "token-123",
      recipientId: "instagram-user-123",
      text: "Hello from SignalAI",
      idempotencyKey: "action-123",
    });
  });

  it("rejects an empty message", async () => {
    const sendMessage = vi.fn();

    const sender = new InstagramMessageSender(
      {
        sendMessage,
      },
      {
        accessToken: "token-123",
      },
    );

    await expect(
      sender.send({
        idempotencyKey: "action-123",
        tenantId: "tenant-1",
        subjectKey: "instagram-user-123",
        executionId: "execution-1",
        actionId: "action-123",
        payload: {
          text: "",
        },
      }),
    ).rejects.toThrow(
      "SEND_MESSAGE action requires a non-empty text payload",
    );

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("uses the journey subject as the Instagram recipient", async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);

    const sender = new InstagramMessageSender(
      {
        sendMessage,
      },
      {
        accessToken: "token",
      },
    );

    await sender.send({
      idempotencyKey: "stable-action-id",
      tenantId: "tenant",
      subjectKey: "ig-user-999",
      executionId: "execution",
      actionId: "stable-action-id",
      payload: {
        text: "Test",
      },
    });

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: "ig-user-999",
        idempotencyKey: "stable-action-id",
      }),
    );
  });
});
