import { describe, expect, it, vi } from "vitest";

import { InstagramMessageSender } from "../instagramMessageSender.js";

function createSender(sendMessage: ReturnType<typeof vi.fn>) {
  return new InstagramMessageSender(
    { sendMessage },
    { accessToken: "token-123" },
  );
}

const baseRequest = {
  idempotencyKey: "action-123",
  tenantId: "tenant-1",
  subjectKey: "instagram-user-123",
  executionId: "execution-1",
  actionId: "action-123",
};

describe("InstagramMessageSender", () => {
  it("maps a journey message action to Instagram", async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const sender = createSender(sendMessage);

    await sender.send({
      ...baseRequest,
      payload: { text: "Hello from SignalAI" },
    });

    expect(sendMessage).toHaveBeenCalledWith({
      accessToken: "token-123",
      recipientId: "instagram-user-123",
      text: "Hello from SignalAI",
      idempotencyKey: "action-123",
    });
  });

  it("passes legacy rich-message metadata from the journey action", async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const sender = createSender(sendMessage);
    const richMessage = {
      ctaUrl: "https://example.com/collection",
      imageUrl: "https://cdn.example.com/collection.jpg",
      title: "Latest collection",
      subtitle: "Explore the newest options",
      buttonTitle: "View collection",
    };

    await sender.send({
      ...baseRequest,
      payload: {
        data: {
          text: "See our latest collection",
          richMessage,
        },
      },
    });

    expect(sendMessage).toHaveBeenCalledWith({
      accessToken: "token-123",
      recipientId: "instagram-user-123",
      text: "See our latest collection",
      idempotencyKey: "action-123",
      richMessage,
    });
  });

  it("passes explicit presentations through the real journey sender path", async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const sender = createSender(sendMessage);
    const presentation = {
      type: "buttons" as const,
      buttons: [
        { type: "web_url" as const, title: "Pricing", url: "https://example.com/pricing" },
        { type: "postback" as const, title: "Continue", payload: "signalai:node:next" },
      ],
    };

    await sender.send({
      ...baseRequest,
      payload: {
        data: {
          text: "What would you like to explore?",
          richMessage: { presentation },
        },
      },
    });

    expect(sendMessage).toHaveBeenCalledWith({
      accessToken: "token-123",
      recipientId: "instagram-user-123",
      text: "What would you like to explore?",
      idempotencyKey: "action-123",
      richMessage: { presentation },
    });
  });

  it("accepts a card-only message without an outer text body", async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const sender = createSender(sendMessage);
    const presentation = {
      type: "card" as const,
      card: {
        title: "Premium plan",
        imageUrl: "https://cdn.example.com/premium.jpg",
      },
    };

    await sender.send({
      ...baseRequest,
      payload: { data: { richMessage: { presentation } } },
    });

    expect(sendMessage).toHaveBeenCalledWith({
      accessToken: "token-123",
      recipientId: "instagram-user-123",
      text: "",
      idempotencyKey: "action-123",
      richMessage: { presentation },
    });
  });

  it("rejects an empty message without a card or gallery presentation", async () => {
    const sendMessage = vi.fn();
    const sender = createSender(sendMessage);

    await expect(
      sender.send({
        ...baseRequest,
        payload: { text: "" },
      }),
    ).rejects.toThrow(
      "SEND_MESSAGE action requires non-empty text or a valid card/gallery presentation",
    );

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("uses the journey subject as the Instagram recipient", async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const sender = createSender(sendMessage);

    await sender.send({
      ...baseRequest,
      subjectKey: "ig-user-999",
      payload: { text: "Test" },
    });

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: "ig-user-999",
        idempotencyKey: "action-123",
      }),
    );
  });
});
