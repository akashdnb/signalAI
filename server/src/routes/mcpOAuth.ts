import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Router, type Response } from "express";
import { config } from "../config.js";
import { getPool } from "../db/pool.js";
import { getUserSessionVersion } from "../db/users.js";
import { verifySessionToken } from "../lib/session.js";

const MCP_READ_SCOPE = "signalai:read";
const MCP_WRITE_SCOPE = "signalai:write";
const MCP_SUPPORTED_SCOPES = [MCP_READ_SCOPE, MCP_WRITE_SCOPE] as const;
const MCP_SUPPORTED_SCOPE_SET = new Set<string>(MCP_SUPPORTED_SCOPES);
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
const CODE_TTL_SECONDS = 5 * 60;

export const mcpOAuthRouter = Router();

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function base64Url(value: Buffer): string {
  return value.toString("base64url");
}

function randomToken(): string {
  return base64Url(randomBytes(32));
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function issuerUrl(): string {
  return config.apiBaseUrl;
}

function configuredMcpPublicUrl(): string {
  return (process.env.MCP_PUBLIC_URL ?? "").replace(/\/+$/, "");
}

function resourceUrl(): string {
  return `${configuredMcpPublicUrl()}/mcp`;
}

function oauthMetadata() {
  const issuer = issuerUrl();
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    introspection_endpoint: `${issuer}/oauth/introspect`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: [...MCP_SUPPORTED_SCOPES],
    token_endpoint_auth_methods_supported: ["none"],
  };
}

function validRedirectUri(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

function appendParams(target: string, params: Record<string, string>): string {
  const url = new URL(target);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

function errorRedirect(res: Response, redirectUri: string, error: string, state?: string) {
  return res.redirect(appendParams(redirectUri, { error, ...(state ? { state } : {}) }));
}

async function loadClient(clientId: string) {
  const result = await getPool().query<{
    clientId: string;
    clientName: string;
    redirectUris: string[];
  }>(
    `select client_id as "clientId", client_name as "clientName", redirect_uris as "redirectUris"
     from mcp_oauth_clients where client_id = $1`,
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
  if (typeof tenantId !== "string" || !tenantId) return null;
  return { userId: session.userId, tenantId };
}

mcpOAuthRouter.get("/.well-known/oauth-authorization-server", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=300");
  return res.json(oauthMetadata());
});

mcpOAuthRouter.get("/.well-known/oauth-protected-resource/mcp", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=300");
  return res.json({
    resource: resourceUrl(),
    authorization_servers: [issuerUrl()],
    scopes_supported: [...MCP_SUPPORTED_SCOPES],
    bearer_methods_supported: ["header"],
  });
});

mcpOAuthRouter.get("/.well-known/openid-configuration", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=300");
  return res.json({
    ...oauthMetadata(),
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: [],
  });
});

mcpOAuthRouter.post("/oauth/register", async (req, res) => {
  const redirectUris = Array.isArray(req.body?.redirect_uris) ? req.body.redirect_uris : [];
  const clientName = typeof req.body?.client_name === "string" ? req.body.client_name.trim() : "MCP client";
  const grantTypes = Array.isArray(req.body?.grant_types) ? req.body.grant_types : ["authorization_code", "refresh_token"];
  const responseTypes = Array.isArray(req.body?.response_types) ? req.body.response_types : ["code"];

  if (!redirectUris.length || redirectUris.some((uri: unknown) => typeof uri !== "string" || !validRedirectUri(uri))) {
    return res.status(400).json({ error: "invalid_redirect_uri" });
  }
  if (!grantTypes.includes("authorization_code") || !responseTypes.includes("code")) {
    return res.status(400).json({ error: "invalid_client_metadata" });
  }

  const clientId = `sig_${randomToken()}`;
  await getPool().query(
    `insert into mcp_oauth_clients(client_id, client_name, redirect_uris, grant_types, response_types)
     values ($1, $2, $3, $4, $5)`,
    [clientId, clientName.slice(0, 200), redirectUris, grantTypes, responseTypes],
  );

  return res.status(201).json({
    client_id: clientId,
    client_name: clientName.slice(0, 200),
    redirect_uris: redirectUris,
    grant_types: grantTypes,
    response_types: responseTypes,
    token_endpoint_auth_method: "none",
  });
});

mcpOAuthRouter.get("/oauth/authorize", async (req, res) => {
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
  if (
    scopes.length === 0 ||
    scopes.some((scope) => !MCP_SUPPORTED_SCOPE_SET.has(scope)) ||
    new Set(scopes).size !== scopes.length
  ) return errorRedirect(res, redirectUri, "invalid_scope", state);
  if (!configuredMcpPublicUrl()) return res.status(503).json({ error: "mcp_oauth_not_configured" });
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

mcpOAuthRouter.post("/oauth/token", async (req, res) => {
  const grantType = typeof req.body?.grant_type === "string" ? req.body.grant_type : "";
  const clientId = typeof req.body?.client_id === "string" ? req.body.client_id : "";
  const client = await loadClient(clientId);
  if (!client) return res.status(400).json({ error: "invalid_client" });

  if (grantType === "authorization_code") {
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    const redirectUri = typeof req.body?.redirect_uri === "string" ? req.body.redirect_uri : "";
    const verifier = typeof req.body?.code_verifier === "string" ? req.body.code_verifier : "";
    if (!code || !redirectUri || !verifier) return res.status(400).json({ error: "invalid_request" });

    const result = await getPool().query<{
      clientId: string;
      redirectUri: string;
      scopes: string[];
      codeChallenge: string;
      resource: string;
      userId: string;
      tenantId: string;
    }>(
      `update mcp_oauth_codes
       set used_at = now()
       where code_hash = $1 and client_id = $2 and redirect_uri = $3 and used_at is null and expires_at > now()
       returning client_id as "clientId", redirect_uri as "redirectUri", scopes, code_challenge as "codeChallenge",
                 resource, user_id as "userId", tenant_id as "tenantId"`,
      [sha256(code), clientId, redirectUri],
    );
    const grant = result.rows[0];
    if (!grant) return res.status(400).json({ error: "invalid_grant" });
    const calculatedChallenge = base64Url(createHash("sha256").update(verifier, "ascii").digest());
    if (!safeEqual(calculatedChallenge, grant.codeChallenge)) return res.status(400).json({ error: "invalid_grant" });

    return issueTokens(res, grant.clientId, grant.scopes, grant.resource, grant.userId, grant.tenantId);
  }

  if (grantType === "refresh_token") {
    const refreshToken = typeof req.body?.refresh_token === "string" ? req.body.refresh_token : "";
    if (!refreshToken) return res.status(400).json({ error: "invalid_request" });
    const result = await getPool().query<{
      clientId: string;
      scopes: string[];
      resource: string;
      userId: string;
      tenantId: string;
    }>(
      `select client_id as "clientId", scopes, resource, user_id as "userId", tenant_id as "tenantId"
       from mcp_oauth_tokens
       where refresh_token_hash = $1 and revoked_at is null and refresh_expires_at > now()`,
      [sha256(refreshToken)],
    );
    const grant = result.rows[0];
    if (!grant) return res.status(400).json({ error: "invalid_grant" });
    await getPool().query(`update mcp_oauth_tokens set revoked_at = now() where refresh_token_hash = $1`, [sha256(refreshToken)]);
    return issueTokens(res, grant.clientId, grant.scopes, grant.resource, grant.userId, grant.tenantId);
  }

  return res.status(400).json({ error: "unsupported_grant_type" });
});

async function issueTokens(
  res: Response,
  clientId: string,
  scopes: string[],
  resource: string,
  userId: string,
  tenantId: string,
) {
  const accessToken = randomToken();
  const refreshToken = randomToken();
  await getPool().query(
    `insert into mcp_oauth_tokens(access_token_hash, refresh_token_hash, client_id, scopes, resource, user_id, tenant_id, access_expires_at, refresh_expires_at)
     values ($1, $2, $3, $4, $5, $6, $7, now() + ($8 * interval '1 second'), now() + ($9 * interval '1 second'))`,
    [sha256(accessToken), sha256(refreshToken), clientId, scopes, resource, userId, tenantId, ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS],
  );
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  return res.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refreshToken,
    scope: scopes.join(" "),
  });
}

mcpOAuthRouter.post("/oauth/introspect", async (req, res) => {
  const expected = process.env.SIGNALAI_SERVICE_TOKEN ?? "";
  const provided = req.header("x-signalai-service-token") ?? "";
  if (!expected || provided !== expected) return res.status(401).json({ active: false });

  const token = typeof req.body?.token === "string" ? req.body.token : "";
  if (!token) return res.json({ active: false });

  const result = await getPool().query<{
    clientId: string;
    scopes: string[];
    resource: string;
    userId: string;
    tenantId: string;
    expiresAt: Date;
  }>(
    `select client_id as "clientId", scopes, resource, user_id as "userId", tenant_id as "tenantId", access_expires_at as "expiresAt"
     from mcp_oauth_tokens
     where access_token_hash = $1 and revoked_at is null and access_expires_at > now()`,
    [sha256(token)],
  );
  const row = result.rows[0];
  if (!row) return res.json({ active: false });

  return res.json({
    active: true,
    iss: issuerUrl(),
    client_id: row.clientId,
    scope: row.scopes.join(" "),
    exp: Math.floor(row.expiresAt.getTime() / 1000),
    aud: row.resource,
    sub: row.userId,
    tenant_id: row.tenantId,
    token_type: "Bearer",
  });
});
