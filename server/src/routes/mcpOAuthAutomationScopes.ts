import { createHash, randomBytes } from "node:crypto";
import { Router, type Response } from "express";
import { config } from "../config.js";
import { getPool } from "../db/pool.js";
import { getUserSessionVersion } from "../db/users.js";
import { verifySessionToken } from "../lib/session.js";

export const MCP_AUTOMATION_PUBLISH_SCOPE = "signalai:automation:publish";
export const MCP_AUTOMATION_OPERATE_SCOPE = "signalai:automation:operate";
const SUPPORTED_SCOPES = [
  "signalai:read",
  "signalai:write",
  MCP_AUTOMATION_PUBLISH_SCOPE,
  MCP_AUTOMATION_OPERATE_SCOPE,
] as const;
const SUPPORTED_SCOPE_SET = new Set<string>(SUPPORTED_SCOPES);
const CODE_TTL_SECONDS = 5 * 60;
const router = Router();

function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function randomToken(): string { return randomBytes(32).toString("base64url"); }
function issuerUrl(): string { return config.apiBaseUrl; }
function publicUrl(): string { return (process.env.MCP_PUBLIC_URL ?? "").replace(/\/+$/, ""); }
function resourceUrl(): string { return `${publicUrl()}/mcp`; }
function appendParams(target: string, params: Record<string, string>) {
  const url = new URL(target);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}
function errorRedirect(res: Response, redirectUri: string, error: string, state?: string) {
  return res.redirect(appendParams(redirectUri, { error, ...(state ? { state } : {}) }));
}
function validRedirectUri(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  } catch { return false; }
}
async function loadClient(clientId: string) {
  const result = await getPool().query<{ redirectUris: string[] }>(
    `select redirect_uris as "redirectUris" from mcp_oauth_clients where client_id = $1`,
    [clientId],
  );
  return result.rows[0] ?? null;
}
async function consumeGoogleHandoff(handoff: string): Promise<{ userId: string; tenantId: string } | null> {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(handoff)) return null;
  const result = await getPool().query<{ payload: unknown }>(
    `update google_login_handoffs
        set used_at = now()
      where token_hash = $1 and used_at is null and expires_at > now()
      returning payload`,
    [sha256(handoff)],
  );
  const payload = result.rows[0]?.payload;
  if (!payload || typeof payload !== "object") return null;
  const token = (payload as { token?: unknown }).token;
  if (typeof token !== "string") return null;
  const session = verifySessionToken(config.sessionSecret, token);
  if (!session) return null;
  const currentVersion = await getUserSessionVersion(getPool(), session.userId);
  if (currentVersion === null || session.sessionVersion !== currentVersion) return null;
  const tenantId = (payload as { tenantId?: unknown }).tenantId;
  return typeof tenantId === "string" && tenantId ? { userId: session.userId, tenantId } : null;
}

router.get("/.well-known/oauth-authorization-server", (_req, res) => {
  const issuer = issuerUrl();
  res.setHeader("Cache-Control", "public, max-age=300");
  return res.json({
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    introspection_endpoint: `${issuer}/oauth/introspect`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: SUPPORTED_SCOPES,
    token_endpoint_auth_methods_supported: ["none"],
  });
});

router.get("/.well-known/oauth-protected-resource/mcp", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=300");
  return res.json({
    resource: resourceUrl(),
    authorization_servers: [issuerUrl()],
    scopes_supported: SUPPORTED_SCOPES,
    bearer_methods_supported: ["header"],
  });
});

router.get("/.well-known/openid-configuration", (_req, res) => {
  const issuer = issuerUrl();
  res.setHeader("Cache-Control", "public, max-age=300");
  return res.json({
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    introspection_endpoint: `${issuer}/oauth/introspect`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: SUPPORTED_SCOPES,
    token_endpoint_auth_methods_supported: ["none"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: [],
  });
});

router.get("/oauth/authorize", async (req, res) => {
  const clientId = typeof req.query.client_id === "string" ? req.query.client_id : "";
  const redirectUri = typeof req.query.redirect_uri === "string" ? req.query.redirect_uri : "";
  const responseType = typeof req.query.response_type === "string" ? req.query.response_type : "";
  const scopeText = typeof req.query.scope === "string" ? req.query.scope : "";
  const state = typeof req.query.state === "string" ? req.query.state : undefined;
  const codeChallenge = typeof req.query.code_challenge === "string" ? req.query.code_challenge : "";
  const codeChallengeMethod = typeof req.query.code_challenge_method === "string" ? req.query.code_challenge_method : "";
  const resource = typeof req.query.resource === "string" ? req.query.resource : resourceUrl();

  const client = await loadClient(clientId);
  if (!client) return res.status(400).json({ error: "unauthorized_client" });
  if (!client.redirectUris.includes(redirectUri)) return res.status(400).json({ error: "invalid_redirect_uri" });
  if (responseType !== "code") return errorRedirect(res, redirectUri, "unsupported_response_type", state);
  if (codeChallengeMethod !== "S256" || codeChallenge.length < 43) return errorRedirect(res, redirectUri, "invalid_request", state);
  const scopes = scopeText.split(/\s+/).filter(Boolean);
  if (!scopes.length || scopes.some((scope) => !SUPPORTED_SCOPE_SET.has(scope)) || new Set(scopes).size !== scopes.length) {
    return errorRedirect(res, redirectUri, "invalid_scope", state);
  }
  if (!publicUrl()) return res.status(503).json({ error: "mcp_oauth_not_configured" });
  if (resource !== resourceUrl()) return errorRedirect(res, redirectUri, "invalid_target", state);

  const handoff = typeof req.query.mcp_handoff === "string" ? req.query.mcp_handoff : "";
  if (!handoff) {
    const loginReturn = new URL(req.originalUrl, issuerUrl());
    loginReturn.searchParams.delete("mcp_handoff");
    const loginUrl = new URL("/auth/google/start", issuerUrl());
    loginUrl.searchParams.set("returnTo", loginReturn.toString());
    return res.redirect(loginUrl.toString());
  }

  const principal = await consumeGoogleHandoff(handoff);
  if (!principal) return errorRedirect(res, redirectUri, "access_denied", state);

  const code = randomToken();
  await getPool().query(
    `insert into mcp_oauth_codes(code_hash, client_id, redirect_uri, scopes, code_challenge, resource, user_id, tenant_id, expires_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, now() + ($9 * interval '1 second'))`,
    [sha256(code), clientId, redirectUri, scopes, codeChallenge, resource, principal.userId, principal.tenantId, CODE_TTL_SECONDS],
  );
  return res.redirect(appendParams(redirectUri, { code, ...(state ? { state } : {}) }));
});

export { router as mcpOAuthAutomationScopesRouter };
