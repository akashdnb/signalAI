import { describe, expect, it } from "vitest";
import { parseInstagramWebhook } from "../parser.js";

describe("parseInstagramWebhook", () => {
  it("parses an Instagram message event", () => {
    const payload = {
      object: "instagram",
      entry: [
        {
          id: "instagram-account-1",
          messaging: [
            {
              sender: {
                id: "customer-123",
              },
              recipient: {
                id: "instagram-account-1",
              },
              timestamp: 1759276800000,
              message: {
                mid: "mid.123",
                text: "Hello",
              },
            },
          ],
        },
      ],
    };

    expect(parseInstagramWebhook(payload)).toEqual([
      expect.objectContaining({
        providerEventId: "mid.123",
        instagramUserId: "customer-123",
        messageText: "Hello",
        eventType: "message",
        eventAt: new Date(1759276800000),
      }),
    ]);
  });

  it("uses the recipient account id when resolving the receiving account", () => {
    const payload = {
      object: "instagram",
      entry: [
        {
          id: "entry-account-1",
          messaging: [
            {
              sender: {
                id: "customer-123",
              },
              recipient: {
                id: "recipient-account-1",
              },
              timestamp: 1759276800000,
              message: {
                mid: "mid.456",
                text: "Hi",
              },
            },
          ],
        },
      ],
    };

    const [event] = parseInstagramWebhook(payload);

    expect(event).toEqual(
      expect.objectContaining({
        instagramAccountId: "recipient-account-1",
        instagramUserId: "customer-123",
      }),
    );
  });

  it("supports message_id when message.mid is unavailable", () => {
    const payload = {
      object: "instagram",
      entry: [
        {
          id: "instagram-account-1",
          messaging: [
            {
              sender: {
                id: "customer-123",
              },
              recipient: {
                id: "instagram-account-1",
              },
              timestamp: 1759276800000,
              message: {
                text: "Hello",
              },
              message_id: "message-id-123",
            },
          ],
        },
      ],
    };

    const [event] = parseInstagramWebhook(payload);

    expect(event.providerEventId).toBe("message-id-123");
  });

  it("returns no events for an unrelated webhook object", () => {
    expect(
      parseInstagramWebhook({
        object: "page",
        entry: [],
      }),
    ).toEqual([]);
  });

  it("ignores messaging events without a message payload", () => {
    expect(
      parseInstagramWebhook({
        object: "instagram",
        entry: [
          {
            id: "instagram-account-1",
            messaging: [
              {
                sender: {
                  id: "customer-123",
                },
                recipient: {
                  id: "instagram-account-1",
                },
                timestamp: 1759276800000,
              },
            ],
          },
        ],
      }),
    ).toEqual([]);
  });
});


describe("Instagram message interactions", () => {
  it("parses quick reply title and payload separately from normal message text", () => {
    const [event] = parseInstagramWebhook({
      object: "instagram",
      entry: [{
        id: "instagram-account-1",
        messaging: [{
          sender: { id: "customer-123" },
          recipient: { id: "instagram-account-1" },
          timestamp: 1759276800000,
          message: {
            mid: "mid.quick-reply",
            text: "Pricing",
            quick_reply: {
              title: "Pricing",
              payload: "signalai:node:pricing-node",
            },
          },
        }],
      }],
    });

    expect(event).toMatchObject({
      providerEventId: "mid.quick-reply",
      instagramAccountId: "instagram-account-1",
      instagramUserId: "customer-123",
      messageText: "Pricing",
      interaction: {
        type: "quick_reply",
        title: "Pricing",
        payload: "signalai:node:pricing-node",
      },
    });
  });

  it("parses top-level postback events that have no message object", () => {
    const [event] = parseInstagramWebhook({
      object: "instagram",
      entry: [{
        id: "instagram-account-1",
        messaging: [{
          sender: { id: "customer-123" },
          recipient: { id: "instagram-account-1" },
          timestamp: 1759276800000,
          postback: {
            title: "Pricing",
            payload: "signalai:node:pricing-node",
          },
        }],
      }],
    });

    expect(event).toMatchObject({
      instagramAccountId: "instagram-account-1",
      instagramUserId: "customer-123",
      messageText: "Pricing",
      interaction: {
        type: "postback",
        title: "Pricing",
        payload: "signalai:node:pricing-node",
      },
    });
    expect(event.providerEventId).toMatch(/^postback:[0-9a-f]{64}$/);
    expect(event.providerEventId.length).toBeLessThan(100);
  });
});
