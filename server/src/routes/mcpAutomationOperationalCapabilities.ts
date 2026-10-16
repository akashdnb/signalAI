import { createHash, randomUUID } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Pool, PoolClient } from "pg";
import { getPool } from "../db/pool.js";
import { getBuilderGraphWithClient } from "../db/journeyGraph.js";
import { listMilestonesWithClient } from "../db/milestones.js";
import { createPublishedJourneyWithClient } from "../db/journeyVersions.js";
import { validateJourneyGraph } from "../domain/journey/validateJourney.js";

const OPERATIONAL_CAPABILITIES = new Set([
  "automation.publish",
  "automation.activate",
  "automation.pause",
]);
const WINDOW_MS = 60_000;
const LIMIT = 10;
const MAX_IDEMPOTENCY_KEY_LENGTH = 200;
const buckets = new Map<string, { startedAt: number; count: number }>();

class OperationalCapabilityError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string,
    readonly details?: Record<string, unknown>,
  ) { super(message); }
}

class InputError extends OperationalCapabilityError {
  constructor(message: string) { super(message, 422, "validation_error"); }
}

export const mcpAutomationOperationalCapabilitiesRouter = Router();

mcpAutomationOperationalCapabilitiesRouter.post(
  "/v1/capabilities/:capability",
  requireMcpServiceAuth,
  async (req, res) => {
    const capability = req.params.capability.endsWith(":invoke")
      ? req.params.capability.slice(0, -":invoke".length)
      : "";
    const correlationId = req.header("x-correlation-id") ?? randomUUID();
    const tenantId = req.mcpTenantId!;

    if (!OPERATIONAL_CAPABILITIES.has(capability)) {
      return res.status(404).json({
        error: "capability_unavailable",
        code: "capability_unavailable",
        message: "This capability is not available.",
        correlationId,
      });
    }

    try {
      const principalId = requireHeader(req, "x-signalai-principal-id");
      const clientId = requireHeader(req, "x-signalai-client-id");
      const idempotencyKey = requireHeader(req, "idempotency-key");
      if (idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
        throw new InputError("Idempotency-Key must be 200 characters or fewer.");
      }
      enforceRateLimit(tenantId, principalId, clientId, res);
      const result = await invokeOperationalCapability(
        capability,
        tenantId,
        principalId,
        clientId,
        correlationId,
        idempotencyKey,
        req.body ?? {},
      );
      return res.status(200).json({ ...result, correlationId });
    } catch (error) {
      if (error instanceof OperationalCapabilityError) {
        return res.status(error.statusCode).json({
          error: error.code,
          code: error.code,
          message: error.message,
          ...(error.details ?? {}),
          correlationId,
        });
      }
      return res.status(500).json({
        error: "upstream_error",
        code: "upstream_error",
        message: "The capability could not be completed. Retry or contact support with the correlation ID.",
        correlationId,
      });
    }
  },
);

async function invokeOperationalCapability(
  capability: string,
  tenantId: string,
  principalId: string,
  clientId: string,
  correlationId: string,
  idempotencyKey: string,
  input: Record<string, unknown>,
) {
  const pool = getPool();
  const inputHash = sha256(JSON.stringify(input));
  const keyHash = sha256(idempotencyKey);
  const client = await pool.connect();
  let auditFailure = false;

  try {
    await client.query("BEGIN");
    const claim = await client.query(
      `insert into mcp_capability_idempotency
        (tenant_id, principal_id, client_id, operation, idempotency_key_hash, input_hash, response)
       values ($1,$2,$3,$4,$5,$6,null)
       on conflict (tenant_id, principal_id, client_id, operation, idempotency_key_hash) do nothing
       returning id`,
      [tenantId, principalId, clientId, capability, keyHash, inputHash],
    );

    if (claim.rowCount === 0) {
      const existing = await client.query<{ input_hash: string; response: Record<string, unknown> | null }>(
        `select input_hash, response
           from mcp_capability_idempotency
          where tenant_id = $1 and principal_id = $2 and client_id = $3
            and operation = $4 and idempotency_key_hash = $5
          for update`,
        [tenantId, principalId, clientId, capability, keyHash],
      );
      const row = existing.rows[0];
      if (!row) throw new Error("idempotency_claim_missing");
      if (row.input_hash !== inputHash) {
        throw new OperationalCapabilityError(
          "This idempotency key was already used with different input.",
          409,
          "idempotency_conflict",
        );
      }
      if (row.response) {
        await client.query("COMMIT");
        return row.response;
      }
      throw new OperationalCapabilityError(
        "A request with this idempotency key is still being processed.",
        409,
        "idempotency_in_progress",
      );
    }

    let result: Record<string, unknown>;
    if (capability === "automation.publish") {
      result = await publishAutomation(client, tenantId, input);
    } else if (capability === "automation.activate") {
      result = await setAutomationActive(client, tenantId, true, input);
    } else {
      result = await setAutomationActive(client, tenantId, false, input);
    }

    await client.query(
      `update mcp_capability_idempotency set response = $6
        where tenant_id = $1 and principal_id = $2 and client_id = $3
          and operation = $4 and idempotency_key_hash = $5`,
      [tenantId, principalId, clientId, capability, keyHash, result],
    );
    await recordAudit(client, {
      tenantId,
      principalId,
      clientId,
      operation: capability,
      automationId: result.automationId,
      correlationId,
      idempotencyKeyHash: keyHash,
      previousVersion: null,
      newVersion: typeof result.publishedVersion === "number" ? result.publishedVersion : null,
      succeeded: true,
    });
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
    auditFailure = true;
    throw error;
  } finally {
    client.release();
    if (auditFailure) {
      await recordFailureAudit(pool, {
        tenantId,
        principalId,
        clientId,
        operation: capability,
        correlationId,
        idempotencyKeyHash: keyHash,
      });
    }
  }
}

async function publishAutomation(client: PoolClient, tenantId: string, input: Record<string, unknown>) {
  assertAllowedKeys(input, ["automation_id", "expected_version"]);
  const automationId = requireString(input.automation_id, "automation_id");
  const expectedVersion = requireInteger(input.expected_version, "expected_version");

  const campaignResult = await client.query<{
    builder_version: number;
    enabled: boolean;
    published: boolean;
  }>(
    `select c.builder_version,
            c.enabled,
            exists (
              select 1 from campaign_journey_versions v
               where v.tenant_id = c.tenant_id and v.campaign_id = c.id
            ) as published
       from campaigns c
      where c.id = $1 and c.tenant_id = $2
      for update`,
    [automationId, tenantId],
  );
  const campaign = campaignResult.rows[0];
  if (!campaign) throw new OperationalCapabilityError("Automation not found in this workspace.", 404, "resource_not_found");
  if (campaign.enabled || campaign.published) {
    throw new OperationalCapabilityError(
      "Only inactive, unpublished drafts can be published.",
      409,
      "invalid_lifecycle_state",
    );
  }
  if (campaign.builder_version !== expectedVersion) {
    throw new OperationalCapabilityError(
      "The automation changed since it was read. Re-read it before publishing.",
      409,
      "version_conflict",
      { currentVersion: campaign.builder_version, recovery: "reread_automation" },
    );
  }

  const graph = await getBuilderGraphWithClient(client, tenantId, automationId);
  if (!graph) throw new OperationalCapabilityError("Automation not found in this workspace.", 404, "resource_not_found");
  const milestones = await listMilestonesWithClient(client, tenantId, automationId);
  const validation = validateJourneyGraph(graph, milestones);
  if (!validation.valid) {
    throw new OperationalCapabilityError(
      "The automation cannot be published until validation errors are fixed.",
      422,
      "validation_error",
      { validationErrors: validation.errors },
    );
  }

  const published = await createPublishedJourneyWithClient(client, tenantId, automationId, graph);
  return {
    capability: "automation.publish",
    automationId,
    status: "published",
    enabled: false,
    publishedVersion: published.version,
    publishedAt: published.publishedAt,
    lifecycle: "published_inactive",
  };
}

async function setAutomationActive(
  client: PoolClient,
  tenantId: string,
  enabled: boolean,
  input: Record<string, unknown>,
) {
  assertAllowedKeys(input, ["automation_id"]);
  const automationId = requireString(input.automation_id, "automation_id");
  const found = await client.query<{ enabled: boolean; published: boolean }>(
    `select c.enabled,
            exists (
              select 1 from campaign_journey_versions v
               where v.tenant_id = c.tenant_id and v.campaign_id = c.id
            ) as published
       from campaigns c
      where c.id = $1 and c.tenant_id = $2
      for update`,
    [automationId, tenantId],
  );
  const campaign = found.rows[0];
  if (!campaign) throw new OperationalCapabilityError("Automation not found in this workspace.", 404, "resource_not_found");

  if (enabled) {
    if (campaign.enabled) {
      throw new OperationalCapabilityError("Automation is already active.", 409, "invalid_lifecycle_state");
    }
    if (!campaign.published) {
      throw new OperationalCapabilityError(
        "The automation must be published before it can be activated.",
        409,
        "invalid_lifecycle_state",
      );
    }
    const ready = await client.query(
      `select 1
         from campaign_instagram_accounts cia
         join meta_tokens mt on mt.id = cia.meta_token_id
        where cia.campaign_id = $1
          and cia.enabled = true
          and mt.tenant_id = $2
          and mt.status = 'healthy'
        limit 1`,
      [automationId, tenantId],
    );
    if (!ready.rowCount) {
      throw new OperationalCapabilityError(
        "The automation needs at least one healthy Instagram account before it can be activated.",
        409,
        "activation_not_ready",
      );
    }
  } else if (!campaign.enabled) {
    throw new OperationalCapabilityError("Automation is already paused.", 409, "invalid_lifecycle_state");
  }

  const updated = await client.query(
    `update campaigns
        set enabled = $3, updated_at = now()
      where id = $1 and tenant_id = $2
      returning enabled`,
    [automationId, tenantId, enabled],
  );
  if (updated.rowCount !== 1) throw new OperationalCapabilityError("Automation could not be updated.", 409, "invalid_lifecycle_state");

  return {
    capability: enabled ? "automation.activate" : "automation.pause",
    automationId,
    status: enabled ? "active" : "paused",
    enabled,
    lifecycle: enabled ? "active" : "paused",
  };
}

function requireHeader(req: Request, name: string): string {
  const value = req.header(name)?.trim();
  if (!value) throw new InputError(`${name} header is required.`);
  return value;
}

function requireString(value: unknown, name: string): string {
  const parsed = typeof value === "string" ? value.trim() : "";
  if (!parsed) throw new InputError(`${name} is required.`);
  return parsed;
}

function requireInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new InputError(`${name} must be a non-negative integer.`);
  }
  return value;
}

function assertAllowedKeys(value: Record<string, unknown>, allowed: string[]) {
  const extra = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extra.length) throw new InputError(`Unsupported field(s): ${extra.join(", ")}.`);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function enforceRateLimit(tenantId: string, principalId: string, clientId: string, res: Response) {
  const key = [tenantId, principalId, clientId].join(":");
  const now = Date.now();
  for (const [bucketKey, bucket] of buckets) {
    if (now - bucket.startedAt >= WINDOW_MS) buckets.delete(bucketKey);
  }
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.startedAt >= WINDOW_MS) {
    buckets.set(key, { startedAt: now, count: 1 });
    return;
  }
  if (bucket.count >= LIMIT) {
    const retryAfterSeconds = Math.max(1, Math.ceil((WINDOW_MS - (now - bucket.startedAt)) / 1000));
    res.setHeader("Retry-After", String(retryAfterSeconds));
    throw new OperationalCapabilityError(
      "MCP automation operation limit reached. Retry after the window resets.",
      429,
      "rate_limited",
      { retryAfterSeconds },
    );
  }
  bucket.count += 1;
}

async function recordAudit(client: PoolClient, event: Record<string, unknown>) {
  await client.query(
    `insert into mcp_capability_audit(
       tenant_id, principal_id, client_id, operation, automation_id, correlation_id,
       idempotency_key_hash, previous_version, new_version, succeeded, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())`,
    [
      event.tenantId,
      event.principalId,
      event.clientId,
      event.operation,
      event.automationId,
      event.correlationId,
      event.idempotencyKeyHash,
      event.previousVersion,
      event.newVersion,
      event.succeeded,
    ],
  );
}

async function recordFailureAudit(pool: Pool, event: Record<string, unknown>) {
  let client: PoolClient | null = null;
  try {
    client = await pool.connect();
    await recordAudit(client, {
      ...event,
      automationId: null,
      previousVersion: null,
      newVersion: null,
      succeeded: false,
    });
  } catch {
    // Preserve the original capability error if audit storage is unavailable.
  } finally {
    client?.release();
  }
}

async function requireMcpServiceAuth(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.SIGNALAI_SERVICE_TOKEN ?? "";
  const provided = req.header("x-signalai-service-token") ?? "";
  if (!expected || provided !== expected) {
    return res.status(401).json({ error: "invalid_token", code: "invalid_token" });
  }
  const tenantId = req.header("x-signalai-tenant-id")?.trim();
  if (!tenantId) return res.status(403).json({ error: "tenant_not_found", code: "tenant_not_found" });
  try {
    const tenant = await getPool().query("select 1 from tenants where id = $1", [tenantId]);
    if (!tenant.rowCount) return res.status(403).json({ error: "tenant_not_found", code: "tenant_not_found" });
    req.mcpTenantId = tenantId;
    return next();
  } catch {
    return res.status(500).json({
      error: "upstream_error",
      code: "upstream_error",
      message: "Authentication could not be completed.",
    });
  }
}

declare global {
  namespace Express {
    interface Request { mcpTenantId?: string }
  }
}
