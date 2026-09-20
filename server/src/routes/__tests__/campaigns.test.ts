import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.js";
import { getPool, closePool } from "../../db/pool.js";
import { upsertToken } from "../../db/tokens.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { createLoggedInTenant } from "../../__tests__/helpers/auth.js";

const SESSION_SECRET = "test-session-secret";
// Must decode to the SAME key config.tokenKeyring loads from
// TOKEN_ENCRYPTION_KEYS below — routes/campaigns.ts decrypts via
// config.tokenKeyring (not a keyring passed in by the test), so
// upsertToken here has to encrypt with a key the route can actually read.
const TOKEN_KEY_B64 = "YE23jw59vZdWaiGV2o9eF4fjuoPcXwsvdwJVi79Q6tQ=";
const keyring = new Map<string, Buffer>([["v1", Buffer.from(TOKEN_KEY_B64, "base64")]]);

describe("campaigns routes", () => {
  const originalFetch = global.fetch;

  beforeAll(() => {
    process.env.SESSION_SECRET = SESSION_SECRET;
    process.env.TOKEN_ENCRYPTION_KEYS = `v1:${TOKEN_KEY_B64}`;
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL must point at a migrated test database to run this suite.");
    }
  });

  beforeEach(async () => {
    await resetDb(getPool());
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  afterAll(async () => {
    await closePool();
  });

  it("creates a campaign and lists it back", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();

    const create = await request(app)
      .post(`/tenants/${tenant.id}/campaigns`)
      .set(authHeader)
      .send({ name: "Giveaway Reel", keywords: ["LINK", "giveaway"] });
    expect(create.status).toBe(201);
    expect(create.body).toMatchObject({ name: "Giveaway Reel", keywords: ["LINK", "giveaway"], enabled: true });

    const list = await request(app).get(`/tenants/${tenant.id}/campaigns`).set(authHeader);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(create.body.id);
  });

  it("rejects a campaign with no keywords", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();
    const res = await request(app)
      .post(`/tenants/${tenant.id}/campaigns`)
      .set(authHeader)
      .send({ name: "Empty", keywords: [] });
    expect(res.status).toBe(400);
  });

  it("toggles enabled and 404s for a campaign that doesn't belong to the tenant", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const { tenant: otherTenant, authHeader: otherAuthHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-b");
    const app = createApp();

    const create = await request(app)
      .post(`/tenants/${tenant.id}/campaigns`)
      .set(authHeader)
      .send({ name: "Reel", keywords: ["LINK"] });

    const disable = await request(app)
      .patch(`/tenants/${tenant.id}/campaigns/${create.body.id}/enabled`)
      .set(authHeader)
      .send({ enabled: false });
    expect(disable.status).toBe(200);

    // otherTenant is real and otherAuthHeader is a genuine member session
    // for it — but the campaign belongs to `tenant`, so this is a real
    // cross-tenant 404, not an auth rejection.
    const crossTenant = await request(app)
      .patch(`/tenants/${otherTenant.id}/campaigns/${create.body.id}/enabled`)
      .set(otherAuthHeader)
      .send({ enabled: true });
    expect(crossTenant.status).toBe(404);
  });

  // Identity Refactor regression: no session at all, or a session for a
  // different tenant than the one in the URL, must never reach the handler.
  it("rejects requests with no session and requests whose session is for a different tenant", async () => {
    const pool = getPool();
    const { tenant } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const { authHeader: otherAuthHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-b");
    const app = createApp();

    const noSession = await request(app)
      .post(`/tenants/${tenant.id}/campaigns`)
      .send({ name: "Reel", keywords: ["LINK"] });
    expect(noSession.status).toBe(401);

    const wrongTenantSession = await request(app)
      .post(`/tenants/${tenant.id}/campaigns`)
      .set(otherAuthHeader)
      .send({ name: "Reel", keywords: ["LINK"] });
    expect(wrongTenantSession.status).toBe(403);
  });

  it("sets and clears a campaign's target media ids", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();

    const create = await request(app)
      .post(`/tenants/${tenant.id}/campaigns`)
      .set(authHeader)
      .send({ name: "Reel", keywords: ["LINK"] });
    expect(create.body.targetMediaIds).toEqual([]); // unrestricted by default

    const scoped = await request(app)
      .put(`/tenants/${tenant.id}/campaigns/${create.body.id}/target-media`)
      .set(authHeader)
      .send({ targetMediaIds: ["media-1", "media-2"] });
    expect(scoped.status).toBe(200);
    expect(scoped.body.targetMediaIds).toEqual(["media-1", "media-2"]);

    const cleared = await request(app)
      .put(`/tenants/${tenant.id}/campaigns/${create.body.id}/target-media`)
      .set(authHeader)
      .send({ targetMediaIds: [] });
    expect(cleared.status).toBe(200);
    expect(cleared.body.targetMediaIds).toEqual([]);
  });

  it("rejects a non-array target-media payload", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();
    const create = await request(app)
      .post(`/tenants/${tenant.id}/campaigns`)
      .set(authHeader)
      .send({ name: "Reel", keywords: ["LINK"] });

    const res = await request(app)
      .put(`/tenants/${tenant.id}/campaigns/${create.body.id}/target-media`)
      .set(authHeader)
      .send({ targetMediaIds: "media-1" });
    expect(res.status).toBe(400);
  });

  it("lists posts observed via inbound comments, most recent first", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();

    await pool.query(
      `insert into leads (tenant_id, instagram_user_id) values ($1, 'u1') returning id`,
      [tenant.id],
    );
    const lead = (await pool.query(`select id from leads where tenant_id = $1`, [tenant.id])).rows[0];

    await pool.query(
      `insert into lead_events (tenant_id, lead_id, meta_event_id, event_type, occurred_at, sequence, attributes)
       values
         ($1, $2, 'evt-1', 'comment', now() - interval '1 hour', 1, '{"mediaId":"media-1","commentId":"c1"}'),
         ($1, $2, 'evt-2', 'comment', now(), 2, '{"mediaId":"media-2","commentId":"c2"}')`,
      [tenant.id, lead.id],
    );

    const res = await request(app).get(`/tenants/${tenant.id}/observed-media`).set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.map((m: { mediaId: string }) => m.mediaId)).toEqual(["media-2", "media-1"]);
  });

  it("does not crash and shows a bare entry when no Instagram account is connected to enrich it", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();

    await pool.query(`insert into leads (tenant_id, instagram_user_id) values ($1, 'u1') returning id`, [tenant.id]);
    const lead = (await pool.query(`select id from leads where tenant_id = $1`, [tenant.id])).rows[0];
    await pool.query(
      `insert into lead_events (tenant_id, lead_id, meta_event_id, event_type, occurred_at, sequence, attributes)
       values ($1, $2, 'evt-1', 'comment', now(), 1, '{"mediaId":"media-1"}')`,
      [tenant.id, lead.id],
    );

    const res = await request(app).get(`/tenants/${tenant.id}/observed-media`).set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([expect.objectContaining({ mediaId: "media-1", caption: null, permalink: null })]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("enriches an observed post with metadata from the Graph API, then caches it (no second call)", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    await upsertToken(pool, keyring, { tenantId: tenant.id, instagramAccountId: "acct-1", accessToken: "token-1" });
    const app = createApp();

    await pool.query(`insert into leads (tenant_id, instagram_user_id) values ($1, 'u1') returning id`, [tenant.id]);
    const lead = (await pool.query(`select id from leads where tenant_id = $1`, [tenant.id])).rows[0];
    await pool.query(
      `insert into lead_events (tenant_id, lead_id, meta_event_id, event_type, occurred_at, sequence, attributes)
       values ($1, $2, 'evt-1', 'comment', now(), 1, '{"mediaId":"media-1"}')`,
      [tenant.id, lead.id],
    );

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "media-1",
        caption: "A great post",
        media_type: "IMAGE",
        thumbnail_url: "https://x/thumb.jpg",
        permalink: "https://www.instagram.com/p/abc123/",
        timestamp: "2026-01-01T00:00:00+0000",
      }),
    } as Response);

    const first = await request(app).get(`/tenants/${tenant.id}/observed-media`).set(authHeader);
    expect(first.status).toBe(200);
    expect(first.body[0]).toMatchObject({ mediaId: "media-1", caption: "A great post" });
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const second = await request(app).get(`/tenants/${tenant.id}/observed-media`).set(authHeader);
    expect(second.body[0]).toMatchObject({ mediaId: "media-1", caption: "A great post" });
    expect(global.fetch).toHaveBeenCalledTimes(1); // still 1 — cached, no re-fetch
  });

  it("POST known-media resolves a pasted URL and adds it with zero comments", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    await upsertToken(pool, keyring, { tenantId: tenant.id, instagramAccountId: "acct-1", accessToken: "token-1" });
    const app = createApp();

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: "media-url", permalink: "https://www.instagram.com/p/xyz789/", caption: "Added by URL" }],
      }),
    } as Response);

    const res = await request(app)
      .post(`/tenants/${tenant.id}/known-media`)
      .set(authHeader)
      .send({ url: "https://www.instagram.com/p/xyz789/" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ mediaId: "media-url", commentCount: 0, caption: "Added by URL" });

    const list = await request(app).get(`/tenants/${tenant.id}/observed-media`).set(authHeader);
    expect(list.body).toEqual([expect.objectContaining({ mediaId: "media-url", commentCount: 0 })]);
  });

  it("POST known-media 400s when no Instagram account is connected", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();

    const res = await request(app)
      .post(`/tenants/${tenant.id}/known-media`)
      .set(authHeader)
      .send({ url: "https://www.instagram.com/p/xyz789/" });
    expect(res.status).toBe(400);
  });

  it("POST known-media 404s when the URL doesn't match any post on the account", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    await upsertToken(pool, keyring, { tenantId: tenant.id, instagramAccountId: "acct-1", accessToken: "token-1" });
    const app = createApp();

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "media-other", permalink: "https://www.instagram.com/p/nope/" }] }),
    } as Response);

    const res = await request(app)
      .post(`/tenants/${tenant.id}/known-media`)
      .set(authHeader)
      .send({ url: "https://www.instagram.com/p/notfound/" });
    expect(res.status).toBe(404);
  });

  it("POST known-media rejects a missing url", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();

    const res = await request(app).post(`/tenants/${tenant.id}/known-media`).set(authHeader).send({});
    expect(res.status).toBe(400);
  });
});
