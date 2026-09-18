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
    expect(url.searchParams.get("scope")).toContain("instagram_business_manage_messages");
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

  it("fetchInstagramProfile returns id and username", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ id: "acct-1", username: "real_handle" }),
    });

    const profile = await fetchInstagramProfile("token");
    expect(profile).toEqual({ id: "acct-1", username: "real_handle" });
  });
});
