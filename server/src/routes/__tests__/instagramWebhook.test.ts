import { createHmac } from "node:crypto";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createInstagramWebhookRouter } from "../instagramWebhook.js";

function sign(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret)
    .update(body)
    .digest("hex")}`;
}

function createTestApp(options?: {
  verifyToken?: string;
  appSecret?: string;
  pool?: any;
  runtime?: any;
}) {
  const app = express();

  app.use(
    express.raw({
      type: "application/json",
      limit: "1mb",
    }),
    (req, _res, next) => {
      if (Buffer.isBuffer(req.body)) {
        req.rawBody = req.body;
      }
      next();
    },
  );

  app.use(
    createInstagramWebhookRouter({
      pool: options?.pool ?? {
        query: vi.fn(),
      },
      runtime: options?.runtime ?? {},
      verifyToken: options?.verifyToken ?? "verify-token",
      appSecret: options?.appSecret ?? "app-secret",
    }),
  );

  return app;
}

describe("Instagram webhook route", () => {
  it("returns the Meta verification challenge for valid verification", async () => {
    const app = createTestApp();

    const response = await request(app)
      .get("/instagram")
      .query({
        "hub.mode": "subscribe",
        "hub.verify_token": "verify-token",
        "hub.challenge": "challenge-123",
      });

    expect(response.status).toBe(200);
    expect(response.text).toBe("challenge-123");
  });

  it("rejects invalid Meta verification", async () => {
    const app = createTestApp();

    const response = await request(app)
      .get("/instagram")
      .query({
        "hub.mode": "subscribe",
        "hub.verify_token": "wrong-token",
        "hub.challenge": "challenge-123",
      });

    expect(response.status).toBe(403);
  });

  it("rejects a webhook with an invalid signature", async () => {
    const app = createTestApp();

    const body = JSON.stringify({
      object: "instagram",
      entry: [],
    });

    const response = await request(app)
      .post("/instagram")
      .set("content-type", "application/json")
      .set("x-hub-signature-256", "sha256=invalid")
      .send(body);

    expect(response.status).toBe(401);
  });

  it("rejects malformed JSON after signature verification", async () => {
    const app = createTestApp();

    const body = '{"object":"instagram","entry":[';
    const signature = sign(body, "app-secret");

    const response = await request(app)
      .post("/instagram")
      .set("content-type", "application/json")
      .set("x-hub-signature-256", signature)
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "invalid_json",
    });
  });

  it("acknowledges a valid webhook immediately when there are no events", async () => {
    const app = createTestApp();

    const body = JSON.stringify({
      object: "instagram",
      entry: [],
    });

    const signature = sign(body, "app-secret");

    const response = await request(app)
      .post("/instagram")
      .set("content-type", "application/json")
      .set("x-hub-signature-256", signature)
      .send(body);

    expect(response.status).toBe(200);
  });
});
