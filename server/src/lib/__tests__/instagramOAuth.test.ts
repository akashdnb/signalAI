import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildAuthorizationUrl,
  exchangeCodeForShortLivedToken,
  exchangeForLongLivedToken,
  fetchInstagramProfile,
  refreshLongLivedToken,
} from "../instagramOAuth.js";

const config = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "https://example.com/callback",
};

describe("instagramOAuth", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("buildAuthorizationUrl includes all required OAuth params", () => {
    const url = new URL(buildAuthorizationUrl(config, "state-abc"));
    expect(url.origin + url.pathname).toBe("https://www.instagram.com/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(config.redirectUri);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("state-abc");
    // All three are required by the Instagram use case setup; manage_comments
    // was once missing, which would have broken the comment trigger while
    // leaving the DM path working — asserted individually so a future edit
    // can't silently drop one again.
    const scope = url.searchParams.get("scope") ?? "";
    expect(scope).toContain("instagram_business_basic");
    expect(scope).toContain("instagram_business_manage_comments");
    expect(scope).toContain("instagram_business_manage_messages");
  });

  it("exchangeCodeForShortLivedToken posts to the token endpoint and returns the parsed token", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "short-token", user_id: "u1" }),
    });

    const result = await exchangeCodeForShortLivedToken(config, "auth-code");

    expect(result).toEqual({ access_token: "short-token", user_id: "u1" });
    const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("https://api.instagram.com/oauth/access_token");
    expect(options.method).toBe("POST");
  });

  it("exchangeCodeForShortLivedToken throws with the response body on failure", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "invalid_grant",
    });

    await expect(exchangeCodeForShortLivedToken(config, "bad-code")).rejects.toThrow(/invalid_grant/);
  });

  it("exchangeForLongLivedToken calls the graph endpoint with ig_exchange_token", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "long-token", expires_in: 5184000 }),
    });

    const result = await exchangeForLongLivedToken("secret", "short-token");

    expect(result.access_token).toBe("long-token");
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const parsed = new URL(url as string);
    expect(parsed.pathname).toContain("access_token");
    expect(parsed.searchParams.get("grant_type")).toBe("ig_exchange_token");
  });

  it("refreshLongLivedToken calls the graph refresh endpoint with ig_refresh_token", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "refreshed-token", expires_in: 5184000 }),
    });

    const result = await refreshLongLivedToken("old-token");

    expect(result.access_token).toBe("refreshed-token");
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const parsed = new URL(url as string);
    expect(parsed.pathname).toContain("refresh_access_token");
    expect(parsed.searchParams.get("grant_type")).toBe("ig_refresh_token");
  });

  // The account id must come from `user_id` (the Instagram professional
  // account id, matching a webhook's entry.id) and NOT from `id` (the
  // app-scoped id). Storing `id` made every inbound webhook fail to resolve
  // a tenant and get silently dropped, with no error anywhere.
  it("uses user_id, not the app-scoped id, as the account id", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ id: "38839853485630499", user_id: "17841408728501893", username: "real_handle" }),
    });

    const profile = await fetchInstagramProfile("token");
    expect(profile).toEqual({ id: "17841408728501893", username: "real_handle" });
  });

  it("requests the user_id field rather than id", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ user_id: "17841408728501893", username: "h" }),
    });

    await fetchInstagramProfile("token");
    const requested = new URL(String((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]));
    expect(requested.searchParams.get("fields")).toContain("user_id");
  });

  it("coerces a numeric user_id to a string, since entry.id arrives as one", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ user_id: 17841408728501893, username: "h" }),
    });

    const profile = await fetchInstagramProfile("token");
    expect(typeof profile.id).toBe("string");
  });

  it("throws rather than storing an unidentifiable account", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ id: "app-scoped-only", username: "h" }),
    });

    await expect(fetchInstagramProfile("token")).rejects.toThrow(/user_id/);
  });
});
