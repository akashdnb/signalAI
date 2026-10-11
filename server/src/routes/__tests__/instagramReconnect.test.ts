import { randomBytes } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.js";
import { closePool, getPool } from "../../db/pool.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { createLoggedInTenant } from "../../__tests__/helpers/auth.js";
import { createCampaign } from "../../db/campaigns.js";
import { attachCampaignToInstagramAccount } from "../../db/campaignAccounts.js";
import { deleteConnectedInstagramAccount } from "../../db/connectedAccounts.js";
import { exchangeCodeForShortLivedToken, exchangeForLongLivedToken, fetchInstagramProfile, subscribeToWebhooks } from "../../lib/instagramOAuth.js";

const SESSION_SECRET = "test-session-secret";
const APP_SECRET = "test-app-secret";
const APP_BASE_URL = "https://app.example.com";

vi.mock("../../lib/instagramOAuth.js", async () => {
  const actual = await vi.importActual<typeof import("../../lib/instagramOAuth.js")>("../../lib/instagramOAuth.js");
  return {
    ...actual,
    exchangeCodeForShortLivedToken: vi.fn(),
    exchangeForLongLivedToken: vi.fn(),
    fetchInstagramProfile: vi.fn(),
    subscribeToWebhooks: vi.fn(),
  };
});

function mockSuccessfulExchange(accountId: string, token = `token-${accountId}`) {
  vi.mocked(exchangeCodeForShortLivedToken).mockResolvedValue({ access_token: "short", user_id: "u1" });
  vi.mocked(exchangeForLongLivedToken).mockResolvedValue({ access_token: token, expires_in: 5184000 });
  vi.mocked(fetchInstagramProfile).mockResolvedValue({ id: accountId, username: accountId });
  vi.mocked(subscribeToWebhooks).mockResolvedValue(undefined);
}

async function mintStartUrl(app: import("express").Express, tenantId: string, authHeader: { Authorization: string }, accountId?: string) {
  const res = await request(app)
    .post(`/tenants/${tenantId}/instagram/connect-link`)
    .set(authHeader)
    .send(accountId ? { accountId } : {});
  expect(res.status).toBe(200);
  const url = new URL(res.body.url);
  return url.pathname + url.search;
}

function extractState(location: string): string {
  return new URL(location).searchParams.get("state")!;
}

describe("Instagram reconnect lifecycle", () => {
  beforeAll(() => {
    process.env.META_APP_SECRET = APP_SECRET;
    process.env.INSTAGRAM_CLIENT_ID = "test-client-id";
    process.env.INSTAGRAM_REDIRECT_URI = "https://example.com/auth/instagram/callback";
    process.env.TOKEN_ENCRYPTION_KEYS = `v1:${randomBytes(32).toString("base64")}`;
    process.env.APP_BASE_URL = APP_BASE_URL;
    process.env.API_BASE_URL = "https://api.example.com";
    process.env.SESSION_SECRET = SESSION_SECRET;
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must point at a migrated test database to run this suite.");
  });

  beforeEach(async () => {
    await resetDb(getPool());
    await getPool().query("truncate table spent_oauth_nonces");
    vi.mocked(exchangeCodeForShortLivedToken).mockReset();
    vi.mocked(exchangeForLongLivedToken).mockReset();
    vi.mocked(fetchInstagramProfile).mockReset();
    vi.mocked(subscribeToWebhooks).mockReset();
  });

  afterAll(async () => {
    await closePool();
  });

  it("reconnects the selected account and restores its existing journey binding", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();

    mockSuccessfulExchange("acct-1", "first-token");
    const firstAgent = request.agent(app);
    const firstStartUrl = await mintStartUrl(app, tenant.id, authHeader);
    const firstStart = await firstAgent.get(firstStartUrl);
    const first = await firstAgent.get("/auth/instagram/callback").query({ code: "auth-code", state: extractState(firstStart.headers.location) });
    expect(first.status).toBe(302);

    const tokenRow = await pool.query<{ id: string }>("select id from meta_tokens where tenant_id = $1 and instagram_account_id = 'acct-1'", [tenant.id]);
    const accountId = tokenRow.rows[0]!.id;
    const campaign = await createCampaign(pool, tenant.id, "Reconnect journey", ["hello"]);
    await attachCampaignToInstagramAccount(pool, tenant.id, campaign.id, accountId);

    await deleteConnectedInstagramAccount(pool, tenant.id, accountId);

    mockSuccessfulExchange("acct-1", "refreshed-token");
    const reconnectAgent = request.agent(app);
    const reconnectStartUrl = await mintStartUrl(app, tenant.id, authHeader, accountId);
    const reconnectStart = await reconnectAgent.get(reconnectStartUrl);
    const reconnect = await reconnectAgent.get("/auth/instagram/callback").query({ code: "auth-code", state: extractState(reconnectStart.headers.location) });

    expect(reconnect.status).toBe(302);
    const account = await pool.query("select id, status from meta_tokens where tenant_id = $1 and instagram_account_id = 'acct-1'", [tenant.id]);
    expect(account.rowCount).toBe(1);
    expect(account.rows[0].id).toBe(accountId);
    expect(account.rows[0].status).toBe("healthy");

    const binding = await pool.query(
      "select enabled from campaign_instagram_accounts where campaign_id = $1 and meta_token_id = $2",
      [campaign.id, accountId],
    );
    expect(binding.rows[0].enabled).toBe(true);
  });

  it("rejects a reconnect flow when OAuth returns a different Instagram identity", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp();

    mockSuccessfulExchange("acct-1");
    const firstAgent = request.agent(app);
    const firstStartUrl = await mintStartUrl(app, tenant.id, authHeader);
    const firstStart = await firstAgent.get(firstStartUrl);
    await firstAgent.get("/auth/instagram/callback").query({ code: "auth-code", state: extractState(firstStart.headers.location) });

    const tokenRow = await pool.query<{ id: string }>("select id from meta_tokens where tenant_id = $1 and instagram_account_id = 'acct-1'", [tenant.id]);
    const accountId = tokenRow.rows[0]!.id;

    mockSuccessfulExchange("acct-2");
    const reconnectAgent = request.agent(app);
    const reconnectStartUrl = await mintStartUrl(app, tenant.id, authHeader, accountId);
    const reconnectStart = await reconnectAgent.get(reconnectStartUrl);
    const reconnect = await reconnectAgent.get("/auth/instagram/callback").query({ code: "auth-code", state: extractState(reconnectStart.headers.location) });

    expect(reconnect.status).toBe(302);
    expect(reconnect.headers.location).toBe(`${APP_BASE_URL}/connect?error=account_mismatch`);

    const rows = await pool.query("select instagram_account_id from meta_tokens where tenant_id = $1 order by instagram_account_id", [tenant.id]);
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].instagram_account_id).toBe("acct-1");
  });
});
