import { createHmac } from "node:crypto";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";

const APP_SECRET = "test-secret";

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sign(payload: object): string {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const sig = createHmac("sha256", APP_SECRET).update(encodedPayload).digest();
  return `${base64UrlEncode(sig)}.${encodedPayload}`;
}

describe("app", () => {
  beforeAll(() => {
    process.env.META_APP_SECRET = APP_SECRET;
  });

  it("GET /health returns ok", async () => {
    const res = await request(createApp()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("GET /privacy and /terms are reachable", async () => {
    const app = createApp();
    const privacy = await request(app).get("/privacy");
    const terms = await request(app).get("/terms");
    expect(privacy.status).toBe(200);
    expect(terms.status).toBe(200);
  });

  it("round-trips a real signed Data Deletion Callback request", async () => {
    const app = createApp();
    const signedRequest = sign({ user_id: "ig-user-42", algorithm: "HMAC-SHA256" });

    const post = await request(app)
      .post("/data-deletion")
      .type("form")
      .send({ signed_request: signedRequest });

    expect(post.status).toBe(200);
    expect(post.body.confirmation_code).toBeTruthy();
    expect(post.body.url).toContain(post.body.confirmation_code);

    const status = await request(app).get(
      `/data-deletion/status/${post.body.confirmation_code}`,
    );
    expect(status.status).toBe(200);
    expect(status.body.status).toBe("complete");
  });

  it("rejects a Data Deletion Callback with a forged signature", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/data-deletion")
      .type("form")
      .send({ signed_request: "forged.payload" });

    expect(res.status).toBe(403);
  });
});
