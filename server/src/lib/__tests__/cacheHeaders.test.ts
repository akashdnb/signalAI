import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { dashboardReadCacheHeaders } from "../cacheHeaders.js";

describe("dashboardReadCacheHeaders", () => {
  function createTestApp() {
    const app = express();
    app.use("/tenants/:tenantId", dashboardReadCacheHeaders);
    app.get("/tenants/:tenantId/leads", (_req, res) => {
      res.json({ leads: ["lead-1"] });
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

  it("partitions personalized responses by Authorization", async () => {
    const app = createTestApp();
    const first = await request(app)
      .get("/tenants/t1/leads")
      .set("Authorization", "Bearer token-a");

    const second = await request(app)
      .get("/tenants/t1/leads")
      .set("Authorization", "Bearer token-b")
      .set("If-None-Match", first.headers.etag);

    expect(second.status).toBe(200);
  });

  it("never stores account health responses", async () => {
    const res = await request(createTestApp()).get("/tenants/t1/account");

    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});
