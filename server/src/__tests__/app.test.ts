import { createHmac } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { getPool, closePool } from "../db/pool.js";
import { createTenant } from "../db/tenants.js";
import { findOrCreateLeadByInstagramUserId } from "../db/leads.js";
import { insertEventIdempotent } from "../db/events.js";
import { insertPii } from "../db/pii.js";
import { resetDb } from "./helpers/db.js";

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
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL must point at a migrated test database to run this suite " +
          "(see docs/phase0_phase1_impl_plan.md B2).",
      );
    }
  });

  beforeEach(async () => {
    await resetDb(getPool());
  });

  afterAll(async () => {
    await closePool();
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

  it("rejects a Data Deletion Callback with a forged signature", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/data-deletion")
      .type("form")
      .send({ signed_request: "forged.payload" });

    expect(res.status).toBe(403);
  });

  it("round-trips a real signed Data Deletion Callback and actually scrubs PII", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "pilot-creator-1");
    const lead = await findOrCreateLeadByInstagramUserId(pool, tenant.id, "ig-user-42");
    const event = await insertEventIdempotent(pool, {
      tenantId: tenant.id,
      leadId: lead.id,
      metaEventId: "meta-evt-1",
      eventType: "comment",
      occurredAt: new Date(),
      sequence: 1,
    });
    await insertPii(pool, {
      leadEventId: event!.id,
      leadId: lead.id,
      commentText: "DM me the word LINK",
      username: "real_user_handle",
    });

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

    // The actual point of this test: content is gone, structure survives.
    const piiRow = await pool.query(
      "select comment_text, username, deleted_at from lead_pii where lead_id = $1",
      [lead.id],
    );
    expect(piiRow.rows[0].comment_text).toBeNull();
    expect(piiRow.rows[0].username).toBeNull();
    expect(piiRow.rows[0].deleted_at).not.toBeNull();

    const leadRow = await pool.query("select instagram_user_id from leads where id = $1", [
      lead.id,
    ]);
    expect(leadRow.rows[0].instagram_user_id).toBeNull();

    const eventRow = await pool.query("select meta_event_id from lead_events where lead_id = $1", [
      lead.id,
    ]);
    expect(eventRow.rows[0].meta_event_id).toBe("meta-evt-1");
  });
});
