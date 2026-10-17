import { randomBytes } from "node:crypto";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.js";
import { getPool, closePool } from "../../db/pool.js";
import { upsertToken } from "../../db/tokens.js";
import { findOrCreateLeadByInstagramUserId } from "../../db/leads.js";
import { upsertMediaMetadata } from "../../db/mediaMetadata.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { createLoggedInTenant } from "../../__tests__/helpers/auth.js";

const SESSION_SECRET = "test-session-secret";
const TOKEN_KEY = randomBytes(32);
const keyring = new Map<string, Buffer>([["v1", TOKEN_KEY]]);

function graphMediaResponse(mediaId: string, caption: string) {
  return {
    ok: true,
    json: async () => ({
      id: mediaId,
      caption,
      media_type: "IMAGE",
      thumbnail_url: `https://x/${mediaId}.jpg`,
      permalink: `https://www.instagram.com/p/${mediaId}/`,
      timestamp: "2026-01-01T00:00:00+0000",
    }),
  } as Response;
}

describe("content observed-media route", () => {
  const originalFetch = global.fetch;

  beforeAll(() => {
    process.env.SESSION_SECRET = SESSION_SECRET;
    process.env.TOKEN_ENCRYPTION_KEYS = `v1:${TOKEN_KEY.toString("base64")}`;
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

  it("backs off repeated failures, caps the retry budget, and keeps the cached preview untouched", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "content-retry");
    await upsertToken(pool, keyring, {
      tenantId: tenant.id,
      instagramAccountId: "acct-1",
      accessToken: "token-1",
    });
    const app = createApp();

    await pool.query(`insert into leads (tenant_id, instagram_user_id) values ($1, 'u1')`, [tenant.id]);
    const lead = (await pool.query(`select id from leads where tenant_id = $1`, [tenant.id])).rows[0];
    await pool.query(
      `insert into lead_events (tenant_id, lead_id, meta_event_id, event_type, occurred_at, sequence, attributes)
       values ($1, $2, 'evt-1', 'comment', now(), 1, '{"mediaId":"media-retry"}')`,
      [tenant.id, lead.id],
    );
    await pool.query(
      `insert into media_metadata
         (tenant_id, instagram_account_id, media_id, caption, media_type, thumbnail_url, permalink, posted_at,
          fetched_at, refresh_failure_count, refresh_retry_at)
       values ($1, 'acct-1', 'media-retry', 'Cached caption', 'IMAGE',
               'https://x/cached.jpg', 'https://www.instagram.com/p/cached/', now() - interval '8 hours',
               now() - interval '7 hours', 0, null)`,
      [tenant.id],
    );

    vi.mocked(global.fetch).mockRejectedValue(new Error("Graph API unavailable"));

    const getMedia = () => request(app).get(`/tenants/${tenant.id}/observed-media`).set(authHeader);
    const clearRetry = () =>
      pool.query(
        `update media_metadata set refresh_retry_at = now() - interval '1 second'
          where tenant_id = $1 and media_id = 'media-retry'`,
        [tenant.id],
      );

    const first = await getMedia();
    expect(first.status).toBe(200);
    expect(first.body[0]).toMatchObject({
      mediaId: "media-retry",
      caption: "Cached caption",
      thumbnailUrl: "https://x/cached.jpg",
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const stateAfterFirstFailure = await pool.query(
      `select fetched_at, refresh_failure_count, refresh_retry_at
         from media_metadata
        where tenant_id = $1 and media_id = 'media-retry' and instagram_account_id = 'acct-1'`,
      [tenant.id],
    );
    expect(stateAfterFirstFailure.rows[0].fetched_at).toBeInstanceOf(Date);
    expect(stateAfterFirstFailure.rows[0].refresh_failure_count).toBe(1);
    expect((stateAfterFirstFailure.rows[0].refresh_retry_at as Date).getTime()).toBeGreaterThan(Date.now());

    const second = await getMedia();
    expect(second.body[0]).toMatchObject({ mediaId: "media-retry", thumbnailUrl: "https://x/cached.jpg" });
    expect(global.fetch).toHaveBeenCalledTimes(1);

    await clearRetry();
    await getMedia();
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(
      (await pool.query(
        `select refresh_failure_count from media_metadata where tenant_id = $1 and media_id = 'media-retry'`,
        [tenant.id],
      )).rows[0].refresh_failure_count,
    ).toBe(2);

    await clearRetry();
    await getMedia();
    expect(global.fetch).toHaveBeenCalledTimes(3);

    await clearRetry();
    await getMedia();
    const cappedState = await pool.query(
      `select refresh_failure_count, refresh_retry_at
         from media_metadata
        where tenant_id = $1 and media_id = 'media-retry'`,
      [tenant.id],
    );
    expect(global.fetch).toHaveBeenCalledTimes(4);
    expect(cappedState.rows[0].refresh_failure_count).toBe(3);
    expect((cappedState.rows[0].refresh_retry_at as Date).getTime()).toBeGreaterThan(Date.now());

    await getMedia();
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });

  it("uses media-level retry state when account and legacy rows disagree", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "content-mixed-retry");
    await upsertToken(pool, keyring, {
      tenantId: tenant.id,
      instagramAccountId: "acct-1",
      accessToken: "token-1",
    });
    const app = createApp();

    await pool.query(`insert into leads (tenant_id, instagram_user_id) values ($1, 'u1')`, [tenant.id]);
    const lead = (await pool.query(`select id from leads where tenant_id = $1`, [tenant.id])).rows[0];
    await pool.query(
      `insert into lead_events (tenant_id, lead_id, meta_event_id, event_type, occurred_at, sequence, attributes)
       values ($1, $2, 'evt-mixed', 'comment', now(), 1, '{"mediaId":"media-mixed"}')`,
      [tenant.id, lead.id],
    );
    await pool.query(
      `insert into media_metadata
         (tenant_id, instagram_account_id, media_id, caption, media_type, thumbnail_url, permalink, posted_at,
          fetched_at, refresh_failure_count, refresh_retry_at)
       values ($1, 'acct-1', 'media-mixed', 'Account cached', 'IMAGE',
               'https://x/account.jpg', 'https://www.instagram.com/p/account/', now() - interval '8 hours',
               now() - interval '7 hours', 2, now() + interval '30 minutes')`,
      [tenant.id],
    );
    await pool.query(
      `insert into media_metadata
         (tenant_id, instagram_account_id, media_id, caption, media_type, thumbnail_url, permalink, posted_at,
          fetched_at, refresh_failure_count, refresh_retry_at)
       values ($1, null, 'media-mixed', 'Legacy cached', 'IMAGE',
               'https://x/legacy.jpg', 'https://www.instagram.com/p/legacy/', now() - interval '7 hours',
               now() - interval '1 hour', 0, null)`,
      [tenant.id],
    );

    vi.mocked(global.fetch).mockRejectedValue(new Error("Graph API unavailable"));

    const getMedia = () => request(app).get(`/tenants/${tenant.id}/observed-media`).set(authHeader);
    const first = await getMedia();

    expect(first.status).toBe(200);
    expect(first.body[0]).toMatchObject({
      mediaId: "media-mixed",
      caption: "Legacy cached",
      thumbnailUrl: "https://x/legacy.jpg",
      refreshFailureCount: 2,
    });
    expect(new Date(first.body[0].refreshRetryAt).getTime()).toBeGreaterThan(Date.now());
    expect(global.fetch).toHaveBeenCalledTimes(0);

    await pool.query(
      `update media_metadata
          set refresh_retry_at = now() - interval '1 second'
        where tenant_id = $1 and media_id = 'media-mixed'`,
      [tenant.id],
    );

    const second = await getMedia();
    expect(second.body[0]).toMatchObject({
      mediaId: "media-mixed",
      caption: "Legacy cached",
      thumbnailUrl: "https://x/legacy.jpg",
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const normalized = await pool.query(
      `select refresh_failure_count, refresh_retry_at
         from media_metadata
        where tenant_id = $1 and media_id = 'media-mixed'
        order by instagram_account_id nulls first`,
      [tenant.id],
    );
    expect(normalized.rows).toHaveLength(2);
    expect(normalized.rows.map((row) => row.refresh_failure_count)).toEqual([3, 3]);
    expect(normalized.rows[0].refresh_retry_at.getTime()).toBeGreaterThan(Date.now());
    expect(normalized.rows[1].refresh_retry_at.getTime()).toBeGreaterThan(Date.now());

    await getMedia();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("refreshes stale metadata successfully and clears previous retry state", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "content-refresh");
    await upsertToken(pool, keyring, {
      tenantId: tenant.id,
      instagramAccountId: "acct-1",
      accessToken: "token-1",
    });
    const app = createApp();

    await pool.query(`insert into leads (tenant_id, instagram_user_id) values ($1, 'u1')`, [tenant.id]);
    const lead = (await pool.query(`select id from leads where tenant_id = $1`, [tenant.id])).rows[0];
    await pool.query(
      `insert into lead_events (tenant_id, lead_id, meta_event_id, event_type, occurred_at, sequence, attributes)
       values ($1, $2, 'evt-1', 'comment', now(), 1, '{"mediaId":"media-refresh"}')`,
      [tenant.id, lead.id],
    );
    await pool.query(
      `insert into media_metadata
         (tenant_id, instagram_account_id, media_id, caption, media_type, thumbnail_url, permalink, posted_at,
          fetched_at, refresh_failure_count, refresh_retry_at)
       values ($1, 'acct-1', 'media-refresh', 'Old caption', 'IMAGE',
               'https://x/old.jpg', 'https://www.instagram.com/p/old/', now() - interval '8 hours',
               now() - interval '7 hours', 2, now() - interval '1 minute')`,
      [tenant.id],
    );

    vi.mocked(global.fetch).mockResolvedValue(graphMediaResponse("media-refresh", "Fresh caption"));

    const response = await request(app)
      .get(`/tenants/${tenant.id}/observed-media`)
      .set(authHeader);
    expect(response.status).toBe(200);
    expect(response.body[0]).toMatchObject({
      mediaId: "media-refresh",
      caption: "Fresh caption",
      thumbnailUrl: "https://x/media-refresh.jpg",
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const refreshed = await pool.query(
      `select fetched_at, refresh_failure_count, refresh_retry_at
         from media_metadata
        where tenant_id = $1 and media_id = 'media-refresh' and instagram_account_id = 'acct-1'`,
      [tenant.id],
    );
    expect(refreshed.rows[0].fetched_at.getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect(refreshed.rows[0].refresh_failure_count).toBe(0);
    expect(refreshed.rows[0].refresh_retry_at).toBeNull();
  });

  it("keeps campaign targeting compatible: comment-observed and URL-added media share the endpoint", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "content-picker");
    await upsertToken(pool, keyring, {
      tenantId: tenant.id,
      instagramAccountId: "acct-1",
      accessToken: "token-1",
    });
    const app = createApp();

    await pool.query(`insert into leads (tenant_id, instagram_user_id) values ($1, 'u1')`, [tenant.id]);
    const lead = (await pool.query(`select id from leads where tenant_id = $1`, [tenant.id])).rows[0];
    await pool.query(
      `insert into lead_events (tenant_id, lead_id, meta_event_id, event_type, occurred_at, sequence, attributes)
       values ($1, $2, 'evt-comment', 'comment', now(), 1, '{"mediaId":"media-comment"}')`,
      [tenant.id, lead.id],
    );

    vi.mocked(global.fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/media?fields=")) {
        return {
          ok: true,
          json: async () => ({
            data: [
              {
                id: "media-url",
                caption: "Added by URL",
                media_type: "IMAGE",
                thumbnail_url: "https://x/media-url.jpg",
                permalink: "https://www.instagram.com/p/url-added/",
                timestamp: "2026-01-02T00:00:00+0000",
              },
            ],
          }),
        } as Response;
      }
      if (url.includes("media-comment")) {
        return graphMediaResponse("media-comment", "Comment observed");
      }
      throw new Error(`unexpected Graph request: ${url}`);
    });

    const added = await request(app)
      .post(`/tenants/${tenant.id}/known-media`)
      .set(authHeader)
      .send({ url: "https://www.instagram.com/p/url-added/" });
    expect(added.status).toBe(200);
    expect(added.body).toMatchObject({ mediaId: "media-url", caption: "Added by URL" });

    const picker = await request(app)
      .get(`/tenants/${tenant.id}/observed-media`)
      .set(authHeader);
    expect(picker.status).toBe(200);
    expect(picker.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          mediaId: "media-comment",
          commentCount: 1,
          caption: "Comment observed",
          thumbnailUrl: "https://x/media-comment.jpg",
          permalink: "https://www.instagram.com/p/media-comment/",
        }),
        expect.objectContaining({
          mediaId: "media-url",
          commentCount: 0,
          caption: "Added by URL",
          thumbnailUrl: "https://x/media-url.jpg",
          permalink: "https://www.instagram.com/p/url-added/",
        }),
      ]),
    );
  });
  it("scopes media IDs, comments, and cached metadata to a server-validated account", async () => {
    const pool = getPool();
    const { tenant: tenantA, authHeader: authA } = await createLoggedInTenant(pool, SESSION_SECRET, "content-account-scope-a");
    const { tenant: tenantB } = await createLoggedInTenant(pool, SESSION_SECRET, "content-account-scope-b");
    await upsertToken(pool, keyring, { tenantId: tenantA.id, instagramAccountId: "acct-a", accessToken: "token-a" });
    await upsertToken(pool, keyring, { tenantId: tenantA.id, instagramAccountId: "acct-b", accessToken: "token-b" });
    await upsertToken(pool, keyring, { tenantId: tenantB.id, instagramAccountId: "acct-foreign", accessToken: "token-foreign" });
    const accountRows = await pool.query<{ id: string; instagram_account_id: string }>(
      "select id, instagram_account_id from meta_tokens where tenant_id = $1",
      [tenantA.id],
    );
    const rowA = accountRows.rows.find((row) => row.instagram_account_id === "acct-a")!;
    const rowB = accountRows.rows.find((row) => row.instagram_account_id === "acct-b")!;
    const leadA = await findOrCreateLeadByInstagramUserId(pool, tenantA.id, "same-person", "acct-a");
    const leadB = await findOrCreateLeadByInstagramUserId(pool, tenantA.id, "same-person", "acct-b");

    await pool.query(
      `insert into lead_events (tenant_id, lead_id, meta_event_id, event_type, occurred_at, sequence, attributes)
       values ($1, $2, 'evt-shared-media-a', 'comment', now(), 1, $3::jsonb)`,
      [tenantA.id, leadA.id, JSON.stringify({ mediaId: "same-media-id", instagramAccountId: "acct-a" })],
    );
    await pool.query(
      `insert into lead_events (tenant_id, lead_id, meta_event_id, event_type, occurred_at, sequence, attributes)
       values ($1, $2, 'evt-shared-media-b', 'comment', now(), 1, $3::jsonb)`,
      [tenantA.id, leadB.id, JSON.stringify({ mediaId: "same-media-id", instagramAccountId: "acct-b" })],
    );
    await pool.query(
      `insert into lead_events (tenant_id, lead_id, meta_event_id, event_type, occurred_at, sequence, attributes)
       values ($1, $2, 'evt-misattributed-media', 'comment', now() + interval '1 second', 2, $3::jsonb)`,
      [tenantA.id, leadA.id, JSON.stringify({ mediaId: "wrong-account-post", instagramAccountId: "acct-b" })],
    );
    await upsertMediaMetadata(pool, tenantA.id, {
      mediaId: "same-media-id",
      caption: "Account A post",
      mediaType: "IMAGE",
      thumbnailUrl: "https://x/account-a.jpg",
      permalink: "https://www.instagram.com/p/account-a/",
      postedAt: new Date("2026-01-01T00:00:00Z"),
    }, "acct-a");
    await upsertMediaMetadata(pool, tenantA.id, {
      mediaId: "same-media-id",
      caption: "Account B post",
      mediaType: "IMAGE",
      thumbnailUrl: "https://x/account-b.jpg",
      permalink: "https://www.instagram.com/p/account-b/",
      postedAt: new Date("2026-01-02T00:00:00Z"),
    }, "acct-b");

    const app = createApp();
    const fromA = await request(app)
      .get(`/tenants/${tenantA.id}/observed-media?accountId=${rowA.id}`)
      .set(authA);
    expect(fromA.status).toBe(200);
    expect(fromA.body).toEqual([
      expect.objectContaining({
        mediaId: "same-media-id",
        instagramAccountId: "acct-a",
        commentCount: 1,
        caption: "Account A post",
        thumbnailUrl: "https://x/account-a.jpg",
      }),
    ]);

    const fromB = await request(app)
      .get(`/tenants/${tenantA.id}/observed-media?accountId=${rowB.id}`)
      .set(authA);
    expect(fromB.status).toBe(200);
    expect(fromB.body).toEqual([
      expect.objectContaining({
        mediaId: "same-media-id",
        instagramAccountId: "acct-b",
        commentCount: 1,
        caption: "Account B post",
        thumbnailUrl: "https://x/account-b.jpg",
      }),
    ]);

    const foreignRow = await pool.query<{ id: string }>(
      "select id from meta_tokens where tenant_id = $1 and instagram_account_id = $2",
      [tenantB.id, "acct-foreign"],
    );
    const forbiddenAccount = await request(app)
      .get(`/tenants/${tenantA.id}/observed-media?accountId=${foreignRow.rows[0]!.id}`)
      .set(authA);
    expect(forbiddenAccount.status).toBe(404);
    expect(forbiddenAccount.body).toMatchObject({ error: "Instagram account not found for this workspace" });

    const repeatedAccount = await request(app)
      .get(`/tenants/${tenantA.id}/observed-media?accountId=${rowA.id}&accountId=${rowB.id}`)
      .set(authA);
    expect(repeatedAccount.status).toBe(400);
    expect(repeatedAccount.body).toMatchObject({ error: "accountId must be a single connected-account identifier" });

    const emptyAccount = await request(app)
      .get(`/tenants/${tenantA.id}/observed-media?accountId=`)
      .set(authA);
    expect(emptyAccount.status).toBe(400);
  });

});
