import { createHmac, randomBytes } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { getPool, closePool } from "../../db/pool.js";
import { createTenant } from "../../db/tenants.js";
import { upsertToken } from "../../db/tokens.js";
import { createCampaign } from "../../db/campaigns.js";
import { getBoss, stopBoss } from "../../queue/boss.js";
import { ensureQueues } from "../../queue/leadEventsQueue.js";
import { ensureUsernameResolutionQueue } from "../../queue/usernameResolutionQueue.js";
import { resetDb } from "../../__tests__/helpers/db.js";

const APP_SECRET = "test-webhook-secret";
const VERIFY_TOKEN = "test-verify-token";

function sign(body: Buffer): string {
  return `sha256=${createHmac("sha256", APP_SECRET).update(body).digest("hex")}`;
}

describe("webhooks route", () => {
  beforeAll(async () => {
    process.env.META_APP_SECRET = APP_SECRET;
    process.env.META_WEBHOOK_VERIFY_TOKEN = VERIFY_TOKEN;
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL must point at a migrated test database to run this suite.");
    }
    // webhookIngestService.ts enqueues onto both of these — previously this
    // suite only passed because some OTHER test file happened to run first
    // in the same `npm test` invocation and created them as a side effect
    // (queue definitions persist in the pgboss schema across files/test
    // runs, so this was invisible locally with a long-lived dev database).
    // A genuinely fresh database — e.g. a CI service container — has
    // neither queue yet, and boss.send() throws "Queue ... does not
    // exist" rather than silently creating it.
    const boss = await getBoss();
    await ensureQueues(boss);
    await ensureUsernameResolutionQueue(boss);
  });

  beforeEach(async () => {
    await resetDb(getPool());
  });

  afterAll(async () => {
    await stopBoss();
    await closePool();
  });

  it("GET handshake succeeds with the correct verify token and echoes the challenge", async () => {
    const app = createApp();
    const res = await request(app)
      .get("/webhooks/instagram")
      .query({ "hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "abc123" });

    expect(res.status).toBe(200);
    expect(res.text).toBe("abc123");
  });

  it("GET handshake fails with the wrong verify token", async () => {
    const app = createApp();
    const res = await request(app)
      .get("/webhooks/instagram")
      .query({ "hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "abc123" });

    expect(res.status).toBe(403);
  });

  it("rejects a POST with a missing or forged signature", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/webhooks/instagram")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ entry: [] }));

    expect(res.status).toBe(403);
  });

  it("ingests a real comment event: resolves tenant, creates lead, stores PII, opens the messaging window", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const keyring = new Map<string, Buffer>([["v1", randomBytes(32)]]);
    await upsertToken(pool, keyring, {
      tenantId: tenant.id,
      instagramAccountId: "acct-1",
      accessToken: "unused-in-this-test",
    });

    const payload = {
      entry: [
        {
          id: "acct-1",
          time: Math.floor(Date.now() / 1000),
          changes: [
            {
              field: "comments",
              value: { id: "comment-1", text: "DM me LINK", from: { id: "user-1", username: "real_handle" } },
            },
          ],
        },
      ],
    };
    const body = Buffer.from(JSON.stringify(payload));

    const app = createApp();
    const res = await request(app)
      .post("/webhooks/instagram")
      .set("Content-Type", "application/json")
      .set("X-Hub-Signature-256", sign(body))
      .send(body.toString("utf8"));

    expect(res.status).toBe(200);

    const lead = await pool.query(
      "select id, instagram_user_id, last_inbound_at, window_open_until from leads where tenant_id = $1",
      [tenant.id],
    );
    expect(lead.rows).toHaveLength(1);
    expect(lead.rows[0].instagram_user_id).toBe("user-1");
    expect(lead.rows[0].window_open_until).not.toBeNull();

    const pii = await pool.query("select comment_text, username from lead_pii where lead_id = $1", [
      lead.rows[0].id,
    ]);
    expect(pii.rows[0]).toMatchObject({ comment_text: "DM me LINK", username: "real_handle" });
  });

  it("is idempotent: redelivering the identical webhook does not create a second event or lead", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const keyring = new Map<string, Buffer>([["v1", randomBytes(32)]]);
    await upsertToken(pool, keyring, {
      tenantId: tenant.id,
      instagramAccountId: "acct-1",
      accessToken: "unused-in-this-test",
    });

    const payload = {
      entry: [
        {
          id: "acct-1",
          changes: [
            { field: "comments", value: { id: "comment-dup", text: "hi", from: { id: "user-1" } } },
          ],
        },
      ],
    };
    const body = Buffer.from(JSON.stringify(payload));
    const app = createApp();

    for (let i = 0; i < 2; i++) {
      const res = await request(app)
        .post("/webhooks/instagram")
        .set("Content-Type", "application/json")
        .set("X-Hub-Signature-256", sign(body))
        .send(body.toString("utf8"));
      expect(res.status).toBe(200);
    }

    const events = await pool.query("select count(*)::int as count from lead_events where tenant_id = $1", [
      tenant.id,
    ]);
    expect(events.rows[0].count).toBe(1);
  });

  it("flags a comment that matches an active campaign keyword (Phase 1 Automation Engine)", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const keyring = new Map<string, Buffer>([["v1", randomBytes(32)]]);
    await upsertToken(pool, keyring, {
      tenantId: tenant.id,
      instagramAccountId: "acct-1",
      accessToken: "unused-in-this-test",
    });
    const campaign = await createCampaign(pool, tenant.id, "Giveaway Reel", ["LINK"]);

    const payload = {
      entry: [
        {
          id: "acct-1",
          changes: [
            { field: "comments", value: { id: "comment-match", text: "please send the LINK!", from: { id: "u1" } } },
          ],
        },
      ],
    };
    const body = Buffer.from(JSON.stringify(payload));
    const app = createApp();

    const res = await request(app)
      .post("/webhooks/instagram")
      .set("Content-Type", "application/json")
      .set("X-Hub-Signature-256", sign(body))
      .send(body.toString("utf8"));

    expect(res.status).toBe(200);
    const event = await pool.query("select attributes from lead_events where tenant_id = $1", [tenant.id]);
    expect(event.rows[0].attributes).toMatchObject({ matchedCampaignId: campaign.id, matchedKeyword: "LINK" });
  });

  it("a campaign defaulted to triggerSource 'comment' does NOT match the same keyword in a DM", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const keyring = new Map<string, Buffer>([["v1", randomBytes(32)]]);
    await upsertToken(pool, keyring, { tenantId: tenant.id, instagramAccountId: "acct-1", accessToken: "unused" });
    await createCampaign(pool, tenant.id, "Comment Only", ["LINK"]); // default triggerSource: 'comment'

    const payload = {
      entry: [
        {
          id: "acct-1",
          time: Math.floor(Date.now() / 1000),
          messaging: [{ sender: { id: "u1" }, timestamp: Date.now(), message: { mid: "m1", text: "send the LINK" } }],
        },
      ],
    };
    const body = Buffer.from(JSON.stringify(payload));
    const app = createApp();

    const res = await request(app)
      .post("/webhooks/instagram")
      .set("Content-Type", "application/json")
      .set("X-Hub-Signature-256", sign(body))
      .send(body.toString("utf8"));

    expect(res.status).toBe(200);
    const event = await pool.query("select attributes from lead_events where tenant_id = $1", [tenant.id]);
    expect(event.rows[0].attributes.matchedCampaignId).toBeUndefined();
  });

  it("flags a DM that matches a campaign with triggerSource 'message'", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const keyring = new Map<string, Buffer>([["v1", randomBytes(32)]]);
    await upsertToken(pool, keyring, { tenantId: tenant.id, instagramAccountId: "acct-1", accessToken: "unused" });
    const campaign = await createCampaign(pool, tenant.id, "DM Trigger", ["PRICE"], { triggerSource: "message" });

    const payload = {
      entry: [
        {
          id: "acct-1",
          time: Math.floor(Date.now() / 1000),
          messaging: [
            { sender: { id: "u1" }, timestamp: Date.now(), message: { mid: "m2", text: "what's the PRICE?" } },
          ],
        },
      ],
    };
    const body = Buffer.from(JSON.stringify(payload));
    const app = createApp();

    const res = await request(app)
      .post("/webhooks/instagram")
      .set("Content-Type", "application/json")
      .set("X-Hub-Signature-256", sign(body))
      .send(body.toString("utf8"));

    expect(res.status).toBe(200);
    const event = await pool.query("select attributes from lead_events where tenant_id = $1", [tenant.id]);
    expect(event.rows[0].attributes).toMatchObject({ matchedCampaignId: campaign.id, matchedKeyword: "PRICE" });
  });

  it("a campaign with triggerSource 'both' matches the keyword in either a comment or a DM", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const keyring = new Map<string, Buffer>([["v1", randomBytes(32)]]);
    await upsertToken(pool, keyring, { tenantId: tenant.id, instagramAccountId: "acct-1", accessToken: "unused" });
    const campaign = await createCampaign(pool, tenant.id, "Everywhere", ["GIVEAWAY"], { triggerSource: "both" });
    const app = createApp();

    const commentPayload = {
      entry: [
        { id: "acct-1", changes: [{ field: "comments", value: { id: "c1", text: "GIVEAWAY please", from: { id: "u1" } } }] },
      ],
    };
    const commentBody = Buffer.from(JSON.stringify(commentPayload));
    await request(app)
      .post("/webhooks/instagram")
      .set("Content-Type", "application/json")
      .set("X-Hub-Signature-256", sign(commentBody))
      .send(commentBody.toString("utf8"));

    const dmPayload = {
      entry: [
        {
          id: "acct-1",
          time: Math.floor(Date.now() / 1000),
          messaging: [{ sender: { id: "u2" }, timestamp: Date.now(), message: { mid: "m3", text: "is there a GIVEAWAY?" } }],
        },
      ],
    };
    const dmBody = Buffer.from(JSON.stringify(dmPayload));
    await request(app)
      .post("/webhooks/instagram")
      .set("Content-Type", "application/json")
      .set("X-Hub-Signature-256", sign(dmBody))
      .send(dmBody.toString("utf8"));

    const events = await pool.query(
      "select event_type, attributes from lead_events where tenant_id = $1 order by event_type",
      [tenant.id],
    );
    expect(events.rows).toHaveLength(2);
    for (const row of events.rows) {
      expect(row.attributes).toMatchObject({ matchedCampaignId: campaign.id, matchedKeyword: "GIVEAWAY" });
    }
  });

  it("records a non-matching comment for analytics but with no campaign match", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const keyring = new Map<string, Buffer>([["v1", randomBytes(32)]]);
    await upsertToken(pool, keyring, {
      tenantId: tenant.id,
      instagramAccountId: "acct-1",
      accessToken: "unused-in-this-test",
    });
    await createCampaign(pool, tenant.id, "Giveaway Reel", ["LINK"]);

    const payload = {
      entry: [
        { id: "acct-1", changes: [{ field: "comments", value: { id: "c-nomatch", text: "nice reel!", from: { id: "u1" } } }] },
      ],
    };
    const body = Buffer.from(JSON.stringify(payload));
    const app = createApp();

    const res = await request(app)
      .post("/webhooks/instagram")
      .set("Content-Type", "application/json")
      .set("X-Hub-Signature-256", sign(body))
      .send(body.toString("utf8"));

    expect(res.status).toBe(200);
    const event = await pool.query("select attributes from lead_events where tenant_id = $1", [tenant.id]);
    // commentId is still recorded even without a campaign match — it's what
    // lets a public comment reply be posted later and what the post-picker
    // (listObservedMedia) is built from; there's just no mediaId here since
    // this payload's comment carries no `media` object.
    expect(event.rows[0].attributes).toEqual({ commentId: "c-nomatch" });
  });

  it("ignores a disabled campaign's keyword", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    const keyring = new Map<string, Buffer>([["v1", randomBytes(32)]]);
    await upsertToken(pool, keyring, {
      tenantId: tenant.id,
      instagramAccountId: "acct-1",
      accessToken: "unused-in-this-test",
    });
    const campaign = await createCampaign(pool, tenant.id, "Giveaway Reel", ["LINK"]);
    await pool.query("update campaigns set enabled = false where id = $1", [campaign.id]);

    const payload = {
      entry: [
        { id: "acct-1", changes: [{ field: "comments", value: { id: "c-disabled", text: "send LINK", from: { id: "u1" } } }] },
      ],
    };
    const body = Buffer.from(JSON.stringify(payload));
    const app = createApp();

    await request(app)
      .post("/webhooks/instagram")
      .set("Content-Type", "application/json")
      .set("X-Hub-Signature-256", sign(body))
      .send(body.toString("utf8"));

    const event = await pool.query("select attributes from lead_events where tenant_id = $1", [tenant.id]);
    expect(event.rows[0].attributes).toEqual({ commentId: "c-disabled" });
  });

  it("acks an event for an unconnected/unknown account without creating any lead", async () => {
    const payload = {
      entry: [{ id: "unknown-acct", changes: [{ field: "comments", value: { id: "c1", from: { id: "u1" } } }] }],
    };
    const body = Buffer.from(JSON.stringify(payload));
    const app = createApp();

    const res = await request(app)
      .post("/webhooks/instagram")
      .set("Content-Type", "application/json")
      .set("X-Hub-Signature-256", sign(body))
      .send(body.toString("utf8"));

    expect(res.status).toBe(200);
    const leads = await getPool().query("select count(*)::int as count from leads");
    expect(leads.rows[0].count).toBe(0);
  });
});
