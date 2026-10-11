import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { dashboardReadCacheHeaders } from "../cacheHeaders.js";

describe("dashboardReadCacheHeaders", () => {
  function createTestApp() {
    const app = express();
    app.use("/tenants/:tenantId", dashboardReadCacheHeaders);
    app.get("/tenants/:tenantId/leads", (req, res) => {
      res.json({ leads: [req.get("Authorization") ?? "anonymous"] });
    });
    app.get("/tenants/:tenantId/account", (_req, res) => {
      res.json({ connected: true });
    });
    return app;
  }

  it("allows private revalidation and turns an unchanged conditional GET into 304", async () => {
    const app = createTestApp();
    const first = await request(app)
      .get("/tenants/t1/leads")
      .set("Authorization", "Bearer token-a");

    expect(first.status).toBe(200);
    expect(first.headers["cache-control"]).toBe("private, no-cache");
    expect(first.headers.vary).toContain("Authorization");
    expect(first.headers.etag).toBeTruthy();

    const second = await request(app)
      .get("/tenants/t1/leads")
      .set("Authorization", "Bearer token-a")
      .set("If-None-Match", first.headers.etag);

    expect(second.status).toBe(304);
    expect(second.text).toBe("");
  });

  it("does not reuse a personalized representation after the Authorization changes", async () => {
    const app = createTestApp();
    const first = await request(app)
      .get("/tenants/t1/leads")
      .set("Authorization", "Bearer token-a");

    const second = await request(app)
      .get("/tenants/t1/leads")
      .set("Authorization", "Bearer token-b")
      .set("If-None-Match", first.headers.etag);

    expect(second.status).toBe(200);
    expect(second.body).toEqual({ leads: ["Bearer token-b"] });
  });

  it("never stores account health responses", async () => {
    const res = await request(createTestApp()).get("/tenants/t1/account");

    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});
