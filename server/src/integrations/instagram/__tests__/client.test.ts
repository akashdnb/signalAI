import { describe, expect, it, vi } from "vitest";

import {
  InstagramApiError,
  MetaInstagramApiClient,
  type InstagramHttpClient,
} from "../client.js";

function createHttpClient(
  response: {
    status: number;
    body?: unknown;
  },
): InstagramHttpClient {
  return {
    post: vi.fn(async () => ({
      status: response.status,
      json: async () => response.body,
    })),
  };
}

describe("MetaInstagramApiClient", () => {
  it("sends a message with the stable idempotency key", async () => {
    const http = createHttpClient({
      status: 200,
      body: {},
    });

    const client = new MetaInstagramApiClient(
      http,
      "https://graph.facebook.com/v24.0",
    );

    await client.sendMessage({
      accessToken: "token-123",
      recipientId: "instagram-user-1",
      text: "Hello",
      idempotencyKey: "action-123",
    });

    expect(http.post).toHaveBeenCalledWith(
      "https://graph.facebook.com/v24.0/me/messages",
      {
        headers: {
          Authorization: "Bearer token-123",
          "Content-Type": "application/json",
          "Idempotency-Key": "action-123",
        },
        body: {
          recipient: {
            id: "instagram-user-1",
          },
          message: {
            text: "Hello",
          },
        },
      },
    );
  });

  it("throws an InstagramApiError for HTTP failures", async () => {
    const http = createHttpClient({
      status: 500,
      body: {
        error: {
          message: "temporary failure",
        },
      },
    });

    const client = new MetaInstagramApiClient(
      http,
      "https://graph.facebook.com/v24.0",
    );

    await expect(
      client.sendMessage({
        accessToken: "token-123",
        recipientId: "instagram-user-1",
        text: "Hello",
        idempotencyKey: "action-123",
      }),
    ).rejects.toMatchObject({
      name: "InstagramApiError",
      status: 500,
      retryable: true,
    });
  });

  it("marks rate limiting as retryable", async () => {
    const http = createHttpClient({
      status: 429,
      body: {},
    });

    const client = new MetaInstagramApiClient(
      http,
      "https://graph.facebook.com/v24.0",
    );

    await expect(
      client.sendMessage({
        accessToken: "token",
        recipientId: "user",
        text: "Hello",
        idempotencyKey: "action",
      }),
    ).rejects.toMatchObject({
      status: 429,
      retryable: true,
    });
  });

  it("marks client errors as non-retryable", async () => {
    const http = createHttpClient({
      status: 400,
      body: {
        error: {
          message: "invalid recipient",
        },
      },
    });

    const client = new MetaInstagramApiClient(
      http,
      "https://graph.facebook.com/v24.0",
    );

    await expect(
      client.sendMessage({
        accessToken: "token",
        recipientId: "user",
        text: "Hello",
        idempotencyKey: "action",
      }),
    ).rejects.toMatchObject({
      status: 400,
      retryable: false,
    });
  });
});
