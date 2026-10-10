import { randomBytes } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { closePool, getPool } from "../../db/pool.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { createLoggedInTenant } from "../../__tests__/helpers/auth.js";

const SESSION_SECRET = "test-session-secret";
const TOKEN_KEY = randomBytes(32);

describe("campaign preset route", () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = SESSION_SECRET;
    process.env.TOKEN_ENCRYPTION_KEYS = `v1:${TOKEN_KEY.toString("base64")}`;
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL must point at a migrated test database to run this suite.");
    }
  });

  beforeEach(async () => {
    await resetDb(getPool());
  });

  afterAll(async () => {
    await closePool();
  });

  const validPreset = {
    triggerSource: "message" as const,
    replyChannel: "dm" as const,
    replyMode: "ai_generated" as const,
    tone: "professional_and_friendly" as const,
    language: "auto" as const,
    defaultReplyTemplate: "Thanks for reaching out!",
    description: "Starter qualification preset",
    milestones: [
      { goalDescription: "Understand the lead's intent", captureFields: ["intent"] },
      { goalDescription: "Capture contact details", captureFields: ["email", "phone"] },
    ],
  };

  it("creates the campaign and milestone-backed builder graph in one operation", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();

    const response = await request(app)
      .post(`/tenants/${tenant.id}/campaigns/from-preset`)
      .set(authHeader)
      .send({ name: "Lead Qualification", keywords: ["demo", "pricing"], preset: validPreset });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      name: "Lead Qualification",
      keywords: ["demo", "pricing"],
      replyMode: "ai_generated",
      replyChannel: "dm",
      triggerSource: "message",
      tone: "professional_and_friendly",
      language: "auto",
    });

    const milestones = await request(app)
      .get(`/tenants/${tenant.id}/campaigns/${response.body.id}/milestones`)
      .set(authHeader);
    expect(milestones.status).toBe(200);
    expect(milestones.body.map((item: { goalDescription: string }) => item.goalDescription)).toEqual([
      "Understand the lead's intent",
      "Capture contact details",
    ]);

    const graph = await request(app)
      .get(`/tenants/${tenant.id}/campaigns/${response.body.id}/builder`)
      .set(authHeader);
    expect(graph.status).toBe(200);
    expect(graph.body.nodes.filter((node: { type: string }) => node.type === "milestone_group")).toHaveLength(2);
  });

  it("rolls back the campaign when milestone configuration fails", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();
    const invalidPreset = {
      ...validPreset,
      milestones: [{ goalDescription: "x".repeat(201), captureFields: ["intent"] }],
    };

    const response = await request(app)
      .post(`/tenants/${tenant.id}/campaigns/from-preset`)
      .set(authHeader)
      .send({ name: "Should Roll Back", keywords: ["demo"], preset: invalidPreset });

    expect(response.status).toBe(500);

    const campaigns = await request(app)
      .get(`/tenants/${tenant.id}/campaigns`)
      .set(authHeader);
    expect(campaigns.status).toBe(200);
    expect(campaigns.body).toHaveLength(0);
  });

  it("rejects malformed preset input before opening a transaction", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();

    const response = await request(app)
      .post(`/tenants/${tenant.id}/campaigns/from-preset`)
      .set(authHeader)
      .send({ name: "Bad", keywords: [], preset: validPreset });

    expect(response.status).toBe(400);
  });
});
