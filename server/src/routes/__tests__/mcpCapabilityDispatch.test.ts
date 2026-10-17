import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import request from "supertest";

const { poolQuery } = vi.hoisted(() => ({
  poolQuery: vi.fn(async (sql: string) => {
    if (sql.includes("from tenants")) {
      return { rows: [{}], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }),
  poolConnect: vi.fn(),
}));

vi.mock("../../db/pool.js", () => ({
  getPool: () => ({ query: poolQuery }),
  closePool: vi.fn(),
}));

import { createApp } from "../../app.js";

describe("MCP capability dispatch", () => {
  const originalToken = process.env.SIGNALAI_SERVICE_TOKEN;
  const tenantId = "00000000-0000-4000-8000-000000000001";

  beforeAll(() => {
    process.env.SIGNALAI_SERVICE_TOKEN = "test-service-token";
  });

  afterAll(() => {
    if (originalToken === undefined) delete process.env.SIGNALAI_SERVICE_TOKEN;
    else process.env.SIGNALAI_SERVICE_TOKEN = originalToken;
  });

  it("passes a supported read capability through the lifecycle router to the read dispatcher", async () => {
    poolQuery.mockClear();
    const response = await request(createApp())
      .post("/v1/capabilities/lead.list:invoke")
      .set("X-SignalAI-Service-Token", "test-service-token")
      .set("X-SignalAI-Tenant-ID", tenantId)
      .set("X-Correlation-ID", "dispatch-regression")
      .send({ limit: 10 });

    expect(response.status).toBe(200);
    expect(response.body.capability).toBe("lead.list");
    expect(response.body.leads).toEqual([]);
    expect(response.body.correlationId).toBe("dispatch-regression");
    expect(poolQuery.mock.calls.some(([sql]) => String(sql).includes("from tenants"))).toBe(true);
    expect(poolQuery.mock.calls.some(([sql]) => String(sql).includes("from leads l"))).toBe(true);
  });
});
