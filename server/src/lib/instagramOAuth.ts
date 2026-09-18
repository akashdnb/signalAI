/**
 * Instagram API with Instagram Login OAuth flow (see Tech Stack decision —
 * no Facebook Page link needed). Endpoints per Meta's published docs, not
 * exercised against a live app yet (Phase 0 A4 hasn't been submitted) —
 * VERIFY response shapes against a real app during Phase 0 pilot testing.
 *
 * Token lifecycle: authorization code -> short-lived token (1 hour) ->
 * exchanged for a long-lived token (60 days) -> refreshed before expiry.
 * A long-lived token must be at least 24 hours old before it can be
 * refreshed — the refresh job (see tokenRefreshJob.ts) accounts for that.
 */

const AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize";
const SHORT_LIVED_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const GRAPH_BASE_URL = "https://graph.instagram.com";

export interface InstagramOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function buildAuthorizationUrl(config: InstagramOAuthConfig, state: string): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "instagram_business_basic,instagram_business_manage_messages");
  url.searchParams.set("state", state);
  return url.toString();
}

interface ShortLivedTokenResponse {
  access_token: string;
  user_id: string;
}

export async function exchangeCodeForShortLivedToken(
  config: InstagramOAuthConfig,
  code: string,
): Promise<ShortLivedTokenResponse> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
    code,
  });

  const res = await fetch(SHORT_LIVED_TOKEN_URL, { method: "POST", body });
  if (!res.ok) {
    throw new Error(`Short-lived token exchange failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as ShortLivedTokenResponse;
}

interface LongLivedTokenResponse {
  access_token: string;
  expires_in: number; // seconds
}

export async function exchangeForLongLivedToken(
  clientSecret: string,
  shortLivedToken: string,
): Promise<LongLivedTokenResponse> {
  const url = new URL(`${GRAPH_BASE_URL}/access_token`);
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("access_token", shortLivedToken);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Long-lived token exchange failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as LongLivedTokenResponse;
}

export async function refreshLongLivedToken(longLivedToken: string): Promise<LongLivedTokenResponse> {
  const url = new URL(`${GRAPH_BASE_URL}/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", longLivedToken);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as LongLivedTokenResponse;
}

interface InstagramProfile {
  id: string;
  username: string;
}

export async function fetchInstagramProfile(accessToken: string): Promise<InstagramProfile> {
  const url = new URL(`${GRAPH_BASE_URL}/me`);
  url.searchParams.set("fields", "id,username");
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Fetching Instagram profile failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as InstagramProfile;
}
