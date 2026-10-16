import { randomUUID, createHash } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Pool, PoolClient } from "pg";
import { getPool } from "../db/pool.js";
import { createCampaign, getCampaign } from "../db/campaigns.js";
import { listMilestones } from "../db/milestones.js";
import { getBuilderGraph, saveBuilderGraph, type BuilderGraph, type JourneyNode, type JourneyEdge } from "../db/journeyGraph.js";
import { validateJourneyGraph } from "../domain/journey/validateJourney.js";

const READ_CAPABILITIES = new Set([
  "lead.list", "lead.get", "conversation.list", "conversation.get",
  "automation.list", "automation.get", "campaign.list", "campaign.get",
  "analytics.overview", "contact.list", "contact.get", "integration.list", "integration.get",
]);
const WRITE_CAPABILITIES = new Set([
  "automation.create_draft", "automation.update_draft", "automation.validate",
]);
const WRITE_WINDOW_MS = 60_000;
const WRITE_LIMIT = 10;
const MAX_IDEMPOTENCY_KEY_LENGTH = 200;

class CapabilityError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string,
    readonly details?: Record<string, unknown>,
  ) { super(message); }
}
class CapabilityInputError extends CapabilityError {
  constructor(message: string, statusCode = 422, code = "validation_error", details?: Record<string, unknown>) {
    super(message, statusCode, code, details);
  }
}
class ResourceNotFoundError extends CapabilityError {
  constructor() { super("Automation not found in this workspace.", 404, "resource_not_found"); }
}

const writeBuckets = new Map<string, { startedAt: number; count: number }>();
export const mcpCapabilitiesRouter = Router();

mcpCapabilitiesRouter.post("/v1/capabilities/:capability", requireMcpServiceAuth, async (req, res) => {
  const raw = req.params.capability;
  const capability = raw.endsWith(":invoke") ? raw.slice(0, -":invoke".length) : "";
  const tenantId = req.mcpTenantId!;
  const correlationId = req.header("x-correlation-id") ?? randomUUID();
  if (!READ_CAPABILITIES.has(capability) && !WRITE_CAPABILITIES.has(capability)) {
    return res.status(404).json({ error: "capability_unavailable", code: "capability_unavailable", correlationId });
  }
  try {
    if (WRITE_CAPABILITIES.has(capability)) {
      enforceWriteRateLimit(req, tenantId);
      const principalId = requireHeader(req, "x-signalai-principal-id");
      const clientId = requireHeader(req, "x-signalai-client-id");
      const idempotencyKey = requireHeader(req, "idempotency-key");
      if (idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
        throw new CapabilityInputError("Idempotency-Key must be 200 characters or fewer.");
      }
      const result = await invokeWriteCapability(
        capability, tenantId, principalId, clientId, correlationId, idempotencyKey, req.body ?? {},
      );
      return res.status(200).json({ ...result, correlationId });
    }
    const result = await invokeReadCapability(capability, tenantId, req.body ?? {});
    return res.status(200).json({ ...result, correlationId });
  } catch (error) {
    if (error instanceof CapabilityError) {
      return res.status(error.statusCode).json({
        error: error.code,
        code: error.code,
        message: error.message,
        ...(error.details ?? {}),
        correlationId,
      });
    }
    // Internal exception text may contain SQL, paths, or credentials: never return it.
    return res.status(500).json({
      error: "upstream_error", code: "upstream_error",
      message: "The capability could not be completed. Retry or contact support with the correlation ID.",
      correlationId,
    });
  }
});

async function invokeReadCapability(capability: string, tenantId: string, input: Record<string, unknown>) {
  const pool = getPool();
  const limit = boundedLimit(input.limit);
  switch (capability) {
    case "lead.list": return listLeads(pool, tenantId, limit);
    case "lead.get": return getLead(pool, tenantId, requireString(input.lead_id, "lead_id"));
    case "conversation.list": return listConversations(pool, tenantId, limit, optionalString(input.lead_id));
    case "conversation.get": return getConversation(pool, tenantId, requireString(input.conversation_id, "conversation_id"));
    case "automation.list": return listAutomations(pool, tenantId, limit);
    case "automation.get": return getAutomation(pool, tenantId, requireString(input.automation_id, "automation_id"));
    case "campaign.list": return listCampaigns(pool, tenantId, limit);
    case "campaign.get": return getCampaignCapability(pool, tenantId, requireString(input.campaign_id, "campaign_id"));
    case "analytics.overview": return analyticsOverview(pool, tenantId);
    case "contact.list": return listContacts(pool, tenantId, limit);
    case "contact.get": return getContact(pool, tenantId, requireString(input.contact_id, "contact_id"));
    case "integration.list": return listIntegrations(pool, tenantId, limit);
    case "integration.get": return getIntegration(pool, tenantId, requireString(input.integration_id, "integration_id"));
    default: throw new CapabilityError("Capability unavailable.", 404, "capability_unavailable");
  }
}

async function invokeWriteCapability(
  capability: string,
  tenantId: string,
  principalId: string,
  clientId: string,
  correlationId: string,
  idempotencyKey: string,
  input: Record<string, unknown>,
) {
  const pool = getPool();
  const inputHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const keyHash = createHash("sha256").update(idempotencyKey).digest("hex");
  const operation = capability;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query<{ input_hash: string; response: unknown }>(
      `select input_hash, response from mcp_capability_idempotency
        where tenant_id = $1 and principal_id = $2 and client_id = $3 and operation = $4 and idempotency_key_hash = $5
        for update`,
      [tenantId, principalId, clientId, operation, keyHash],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].input_hash !== inputHash) {
        await client.query("ROLLBACK");
        throw new CapabilityError("This idempotency key was already used with different input.", 409, "idempotency_conflict");
      }
      await client.query("COMMIT");
      return existing.rows[0].response as Record<string, unknown>;
    }

    const result = capability === "automation.create_draft"
      ? await createDraft(client, tenantId, principalId, input)
      : capability === "automation.update_draft"
        ? await updateDraft(client, tenantId, principalId, input)
        : await validateDraft(pool, tenantId, input);

    await client.query(
      `insert into mcp_capability_idempotency(tenant_id, principal_id, client_id, operation, idempotency_key_hash, input_hash, response)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [tenantId, principalId, clientId, operation, keyHash, inputHash, result],
    );
    await recordAudit(client, {
      tenantId, principalId, clientId, operation,
      automationId: typeof result.automationId === "string" ? result.automationId : null,
      correlationId, idempotencyKeyHash: keyHash,
      previousVersion: typeof result.previousVersion === "number" ? result.previousVersion : null,
      newVersion: typeof result.version === "number" ? result.version : null,
      succeeded: true,
    });
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* connection cleanup */ }
    await recordFailureAudit(pool, { tenantId, principalId, clientId, operation, correlationId, idempotencyKeyHash: keyHash });
    throw error;
  } finally {
    client.release();
  }
}

async function createDraft(client: PoolClient, tenantId: string, principalId: string, input: Record<string, unknown>) {
  assertAllowedKeys(input, ["name", "trigger", "nodes", "edges", "metadata", "idempotency_key"]);
  const name = requireString(input.name, "name");
  const trigger = requireString(input.trigger, "trigger");
  const nodes = normalizeNodes(input.nodes);
  const edges = normalizeEdges(input.edges);
  const metadata = input.metadata === undefined ? {} : requireObject(input.metadata, "metadata");
  if (name.length > 120) throw new CapabilityInputError("name must be 120 characters or fewer.");
  // Campaign model is the existing journey domain aggregate. Drafts always start inactive.
  const campaign = await createCampaign(getPool(), tenantId, name, [trigger], { enabled: false });
  const graph = await getBuilderGraph(getPool(), tenantId, campaign.id);
  if (!graph) throw new Error("created_campaign_graph_unavailable");
  const submitted = nodes.length > 0 || edges.length > 0
    ? { nodes, edges, version: graph.version }
    : graph;
  const saved = await saveBuilderGraph(getPool(), tenantId, campaign.id, graph.version, submitted.nodes, submitted.edges);
  if (saved.status !== "ok") throw new CapabilityInputError(
    saved.status === "invalid" ? saved.errors.join("; ") : "The draft could not be initialized.",
  );
  return {
    capability: "automation.create_draft", automationId: campaign.id, name: campaign.name,
    status: "draft", enabled: false, version: saved.graph.version, trigger,
    metadata, nodes: saved.graph.nodes, edges: saved.graph.edges,
  };
}

async function updateDraft(client: PoolClient, tenantId: string, principalId: string, input: Record<string, unknown>) {
  assertAllowedKeys(input, ["automation_id", "expected_version", "changes", "idempotency_key"]);
  const automationId = requireString(input.automation_id, "automation_id");
  const expectedVersion = requireInteger(input.expected_version, "expected_version");
  const changes = requireObject(input.changes, "changes");
  assertAllowedKeys(changes, ["name", "trigger", "nodes", "edges", "metadata"]);
  const row = await client.query<{ id: string; name: string; enabled: boolean; builder_version: number; keywords: string[] }>(
    `select id, name, enabled, builder_version, keywords from campaigns
      where id = $1 and tenant_id = $2 for update`, [automationId, tenantId],
  );
  const campaign = row.rows[0];
  if (!campaign) throw new ResourceNotFoundError();
  const published = await client.query(
    "select 1 from campaign_journey_versions where tenant_id = $1 and campaign_id = $2 limit 1",
    [tenantId, automationId],
  );
  if (campaign.enabled || published.rowCount) {
    throw new CapabilityError("Only inactive, unpublished drafts can be edited.", 409, "invalid_lifecycle_state");
  }
  if (campaign.builder_version !== expectedVersion) {
    throw new CapabilityError("The automation changed since it was read. Re-read it before retrying.", 409, "version_conflict", {
      currentVersion: campaign.builder_version,
      recovery: "reread_automation",
    });
  }
  if (changes.name !== undefined) {
    const name = requireString(changes.name, "changes.name");
    await client.query("update campaigns set name = $3, updated_at = now() where id = $1 and tenant_id = $2", [automationId, tenantId, name]);
  }
  if (changes.trigger !== undefined) {
    const trigger = requireString(changes.trigger, "changes.trigger");
    await client.query("update campaigns set keywords = $3, updated_at = now() where id = $1 and tenant_id = $2", [automationId, tenantId, [trigger]]);
  }
  let version = campaign.builder_version;
  if (changes.nodes !== undefined || changes.edges !== undefined) {
    const graph = await getBuilderGraph(getPool(), tenantId, automationId);
    if (!graph) throw new ResourceNotFoundError();
    const nodes = changes.nodes === undefined ? graph.nodes : normalizeNodes(changes.nodes);
    const edges = changes.edges === undefined ? graph.edges : normalizeEdges(changes.edges);
    const saved = await saveBuilderGraph(getPool(), tenantId, automationId, expectedVersion, nodes, edges);
    if (saved.status === "conflict") throw new CapabilityError("The automation changed since it was read.", 409, "version_conflict", { currentVersion: saved.currentVersion, recovery: "reread_automation" });
    if (saved.status === "not_found") throw new ResourceNotFoundError();
    if (saved.status === "invalid") throw new CapabilityInputError(saved.errors.join("; "));
    version = saved.graph.version;
  }
  const graph = await getBuilderGraph(getPool(), tenantId, automationId);
  return {
    capability: "automation.update_draft", automationId, name: changes.name ?? campaign.name,
    status: "draft", enabled: false, previousVersion: campaign.builder_version,
    version: graph?.version ?? version, trigger: Array.isArray(changes.trigger) ? changes.trigger[0] : changes.trigger ?? campaign.keywords[0],
    nodes: graph?.nodes ?? [], edges: graph?.edges ?? [],
    readyForReview: false,
  };
}

async function validateDraft(pool: Pool, tenantId: string, input: Record<string, unknown>) {
  assertAllowedKeys(input, ["automation_id", "nodes", "edges", "expected_version", "idempotency_key"]);
  const automationId = input.automation_id === undefined ? undefined : requireString(input.automation_id, "automation_id");
  let graph: BuilderGraph;
  let milestones = [];
  if (automationId) {
    const found = await pool.query("select id from campaigns where id = $1 and tenant_id = $2", [automationId, tenantId]);
    if (!found.rowCount) throw new ResourceNotFoundError();
    graph = (await getBuilderGraph(pool, tenantId, automationId))!;
    if (!graph) throw new ResourceNotFoundError();
    milestones = await listMilestones(pool, tenantId, automationId);
  } else {
    graph = { nodes: normalizeNodes(input.nodes), edges: normalizeEdges(input.edges), version: requireInteger(input.expected_version, "expected_version") };
  }
  const result = validateJourneyGraph(graph, milestones);
  return {
    capability: "automation.validate", automationId: automationId ?? null,
    version: graph.version, valid: result.valid,
    errors: result.errors.map((item) => ({
      path: item.nodeId ? `nodes[id=${item.nodeId}]` : item.edgeId ? `edges[id=${item.edgeId}]` : "graph",
      code: item.code.toLowerCase(), message: item.message, severity: "error",
    })),
    warnings: [], readyForReview: result.valid,
    note: "Validation does not publish or activate this draft.",
  };
}

function normalizeNodes(value: unknown): JourneyNode[] {
  if (!Array.isArray(value) || value.length > 500) throw new CapabilityInputError("nodes must be an array of at most 500 nodes.");
  return value.map((item, i) => {
    const node = requireObject(item, `nodes[${i}]`);
    assertAllowedKeys(node, ["id", "type", "position", "data", "parentGroupId", "collapsed"]);
    const position = requireObject(node.position, `nodes[${i}].position`);
    if (typeof position.x !== "number" || !Number.isFinite(position.x) || typeof position.y !== "number" || !Number.isFinite(position.y)) {
      throw new CapabilityInputError(`nodes[${i}].position must contain finite x and y numbers.`);
    }
    const data = node.data === undefined ? {} : requireObject(node.data, `nodes[${i}].data`);
    return {
      id: requireString(node.id, `nodes[${i}].id`), type: requireString(node.type, `nodes[${i}].type`),
      position: { x: position.x, y: position.y }, data,
      parentGroupId: node.parentGroupId === null || node.parentGroupId === undefined ? null : requireString(node.parentGroupId, `nodes[${i}].parentGroupId`),
      collapsed: node.collapsed === undefined ? false : requireBoolean(node.collapsed, `nodes[${i}].collapsed`),
    };
  });
}
function normalizeEdges(value: unknown): JourneyEdge[] {
  if (!Array.isArray(value) || value.length > 1000) throw new CapabilityInputError("edges must be an array of at most 1000 edges.");
  return value.map((item, i) => {
    const edge = requireObject(item, `edges[${i}]`);
    assertAllowedKeys(edge, ["id", "sourceNodeId", "targetNodeId", "label", "condition"]);
    return {
      id: requireString(edge.id, `edges[${i}].id`), sourceNodeId: requireString(edge.sourceNodeId, `edges[${i}].sourceNodeId`),
      targetNodeId: requireString(edge.targetNodeId, `edges[${i}].targetNodeId`),
      label: edge.label === undefined || edge.label === null ? null : requireString(edge.label, `edges[${i}].label`),
      condition: edge.condition === undefined || edge.condition === null ? null : requireObject(edge.condition, `edges[${i}].condition`),
    };
  });
}
function requireObject(value: unknown, name: string): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CapabilityInputError(`${name} must be an object.`);
  return value as Record<string, any>;
}
function assertAllowedKeys(value: Record<string, unknown>, allowed: string[]) {
  const extra = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extra.length) throw new CapabilityInputError(`Unsupported field(s): ${extra.join(", ")}.`);
}
function requireString(value: unknown, name: string): string {
  const parsed = typeof value === "string" ? value.trim() : "";
  if (!parsed) throw new CapabilityInputError(`${name} is required.`);
  return parsed;
}
function requireInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw new CapabilityInputError(`${name} must be a non-negative integer.`);
  return value;
}
function requireBoolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") throw new CapabilityInputError(`${name} must be a boolean.`);
  return value;
}
function requireHeader(req: Request, name: string) {
  const value = req.header(name)?.trim();
  if (!value) throw new CapabilityInputError(`${name} header is required.`, 400, "validation_error");
  return value;
}
function optionalString(value: unknown): string | undefined { const parsed = typeof value === "string" ? value.trim() : ""; return parsed || undefined; }
function boundedLimit(value: unknown): number { const parsed = typeof value === "number" ? value : Number(value ?? 50); if (!Number.isFinite(parsed)) return 50; return Math.min(Math.max(Math.floor(parsed), 1), 100); }

function enforceWriteRateLimit(req: Request, tenantId: string) {
  const principal = req.header("x-signalai-principal-id") ?? "unknown";
  const client = req.header("x-signalai-client-id") ?? "unknown";
  const key = [tenantId, principal, client].join(":");
  const now = Date.now();
  for (const [bucketKey, bucket] of writeBuckets) if (now - bucket.startedAt >= WRITE_WINDOW_MS) writeBuckets.delete(bucketKey);
  const bucket = writeBuckets.get(key);
  if (!bucket || now - bucket.startedAt >= WRITE_WINDOW_MS) {
    writeBuckets.set(key, { startedAt: now, count: 1 }); return;
  }
  if (bucket.count >= WRITE_LIMIT) {
    throw new CapabilityError("MCP write limit reached. Retry after the window resets.", 429, "rate_limited");
  }
  bucket.count += 1;
}
async function recordAudit(client: PoolClient, event: Record<string, unknown>) {
  await client.query(
    `insert into mcp_capability_audit(tenant_id, principal_id, client_id, operation, automation_id, correlation_id, idempotency_key_hash, previous_version, new_version, succeeded, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())`,
    [event.tenantId,event.principalId,event.clientId,event.operation,event.automationId,event.correlationId,event.idempotencyKeyHash,event.previousVersion,event.newVersion,event.succeeded],
  );
}
async function recordFailureAudit(pool: Pool, event: Record<string, unknown>) {
  try { await recordAudit(await pool.connect().then(c => c), { ...event, automationId: null, idempotencyKeyHash: event.idempotencyKeyHash, previousVersion: null, newVersion: null, succeeded: false }); } catch { /* do not mask primary failure */ }
}

async function requireMcpServiceAuth(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.SIGNALAI_SERVICE_TOKEN ?? "";
  const provided = req.header("x-signalai-service-token") ?? "";
  if (!expected || provided !== expected) return res.status(401).json({ error: "invalid_token", code: "invalid_token" });
  const tenantId = req.header("x-signalai-tenant-id")?.trim();
  if (!tenantId) return res.status(400).json({ error: "tenant_not_found", code: "tenant_not_found" });
  const tenant = await getPool().query("select 1 from tenants where id = $1", [tenantId]);
  if (!tenant.rowCount) return res.status(403).json({ error: "tenant_not_found", code: "tenant_not_found" });
  req.mcpTenantId = tenantId;
  return next();
}

declare global { namespace Express { interface Request { mcpTenantId?: string } } }

/*
 * Existing read helpers are retained below this point. This file is generated
 * by extending the current read-only router so all read capabilities keep their contracts.
 */

async function listLeads(pool: ReturnType<typeof getPool>, tenantId: string, limit: number) {
  const result = await pool.query(
    `select l.id,
            l.customer_id as "customerId",
            l.instagram_user_id as "instagramUserId",
            l.created_at as "createdAt",
            l.pipeline_stage as "pipelineStage",
            l.owner_user_id as "ownerUserId",
            l.handoff_status as "handoffStatus",
            l.last_inbound_at as "lastInboundAt",
            l.window_open_until as "windowOpenUntil",
            pii.username,
            latest.event_type as "lastEventType",
            latest.occurred_at as "lastEventAt",
            case when latest.event_type = 'comment' then latest_pii.comment_text
                 when latest.event_type = 'message' then latest_pii.dm_text
            end as "lastMessagePreview"
     from leads l
     left join lateral (
       select p.username
       from lead_pii p
       where p.lead_id = l.id and p.deleted_at is null and p.username is not null
       order by p.created_at desc limit 1
     ) pii on true
     left join lateral (
       select e.id, e.event_type, e.occurred_at
       from lead_events e
       where e.lead_id = l.id and e.tenant_id = $1
       order by e.occurred_at desc, e.id desc limit 1
     ) latest on true
     left join lateral (
       select p.comment_text, p.dm_text
       from lead_pii p
       where p.lead_event_id = latest.id and p.deleted_at is null
       limit 1
     ) latest_pii on true
     where l.tenant_id = $1
     order by coalesce(latest.occurred_at, l.created_at) desc
     limit $2`,
    [tenantId, limit],
  );
  return { capability: "lead.list", leads: result.rows, count: result.rowCount ?? result.rows.length };
}

async function getLead(pool: ReturnType<typeof getPool>, tenantId: string, leadId: string) {
  const result = await pool.query(
    `select l.id,
            l.customer_id as "customerId",
            l.instagram_user_id as "instagramUserId",
            l.created_at as "createdAt",
            l.pipeline_stage as "pipelineStage",
            l.owner_user_id as "ownerUserId",
            l.handoff_status as "handoffStatus",
            l.last_inbound_at as "lastInboundAt",
            l.window_open_until as "windowOpenUntil",
            pii.username,
            pii.phone
     from leads l
     left join lateral (
       select p.username, p.phone
       from lead_pii p
       where p.lead_id = l.id and p.deleted_at is null
       order by p.created_at desc limit 1
     ) pii on true
     where l.id = $1 and l.tenant_id = $2`,
    [leadId, tenantId],
  );
  if (!result.rows[0]) throw new CapabilityInputError("lead_not_found");
  return { capability: "lead.get", lead: result.rows[0] };
}

async function listConversations(pool: ReturnType<typeof getPool>, tenantId: string, limit: number, leadId?: string) {
  const result = await pool.query(
    `select l.id as "conversationId",
            l.id as "leadId",
            pii.username,
            latest.event_type as "lastEventType",
            latest.occurred_at as "lastMessageAt",
            case when latest.event_type = 'comment' then latest_pii.comment_text
                 when latest.event_type = 'message' then latest_pii.dm_text
            end as "lastMessagePreview"
     from leads l
     left join lateral (
       select p.username
       from lead_pii p
       where p.lead_id = l.id and p.deleted_at is null and p.username is not null
       order by p.created_at desc limit 1
     ) pii on true
     join lateral (
       select e.id, e.event_type, e.occurred_at
       from lead_events e
       where e.lead_id = l.id and e.tenant_id = $1
       order by e.occurred_at desc, e.id desc limit 1
     ) latest on true
     left join lateral (
       select p.comment_text, p.dm_text
       from lead_pii p
       where p.lead_event_id = latest.id and p.deleted_at is null
       limit 1
     ) latest_pii on true
     where l.tenant_id = $1
       and ($2::uuid is null or l.id = $2::uuid)
     order by latest.occurred_at desc
     limit $3`,
    [tenantId, leadId ?? null, limit],
  );
  return { capability: "conversation.list", conversations: result.rows, count: result.rowCount ?? result.rows.length };
}

async function getConversation(pool: ReturnType<typeof getPool>, tenantId: string, conversationId: string) {
  const lead = await getLead(pool, tenantId, conversationId);
  const events = await pool.query(
    `select e.id,
            e.event_type as "eventType",
            e.occurred_at as "occurredAt",
            e.attributes,
            p.comment_text as "commentText",
            p.dm_text as "dmText",
            p.username
     from lead_events e
     left join lead_pii p on p.lead_event_id = e.id and p.deleted_at is null
     where e.tenant_id = $1 and e.lead_id = $2
     order by e.occurred_at asc, e.id asc`,
    [tenantId, conversationId],
  );
  return { capability: "conversation.get", conversation: { id: conversationId, lead: lead.lead, events: events.rows } };
}

async function listAutomations(pool: ReturnType<typeof getPool>, tenantId: string, limit: number) {
  const result = await pool.query(
    `select c.id,
            c.name,
            c.enabled,
            c.builder_version as "builderVersion",
            c.created_at as "createdAt",
            c.updated_at as "updatedAt",
            count(distinct n.id)::int as "nodeCount",
            max(v.version)::int as "publishedVersion"
     from campaigns c
     left join journey_nodes n on n.campaign_id = c.id and n.tenant_id = c.tenant_id
     left join campaign_journey_versions v on v.campaign_id = c.id and v.tenant_id = c.tenant_id
     where c.tenant_id = $1
     group by c.id
     order by c.updated_at desc
     limit $2`,
    [tenantId, limit],
  );
  return { capability: "automation.list", automations: result.rows, count: result.rowCount ?? result.rows.length };
}

async function getAutomation(pool: ReturnType<typeof getPool>, tenantId: string, automationId: string) {
  const campaign = await pool.query(`select * from campaigns where id = $1 and tenant_id = $2`, [automationId, tenantId]);
  if (!campaign.rows[0]) throw new CapabilityInputError("automation_not_found");
  const nodes = await pool.query(
    `select id, type, position_x as "positionX", position_y as "positionY", data, parent_group_id as "parentGroupId", collapsed
     from journey_nodes where campaign_id = $1 and tenant_id = $2 order by created_at asc`,
    [automationId, tenantId],
  );
  const edges = await pool.query(
    `select id, source_node_id as "sourceNodeId", target_node_id as "targetNodeId", label, condition
     from journey_edges where campaign_id = $1 and tenant_id = $2 order by created_at asc`,
    [automationId, tenantId],
  );
  const published = await pool.query(
    `select version, graph, created_at as "createdAt", published_at as "publishedAt"
     from campaign_journey_versions
     where campaign_id = $1 and tenant_id = $2
     order by version desc limit 1`,
    [automationId, tenantId],
  );
  return {
    capability: "automation.get",
    automation: {
      ...campaign.rows[0],
      nodes: nodes.rows,
      edges: edges.rows,
      latestPublishedVersion: published.rows[0] ?? null,
    },
  };
}

async function listCampaigns(pool: ReturnType<typeof getPool>, tenantId: string, limit: number) {
  const result = await pool.query(
    `select * from campaigns where tenant_id = $1 order by updated_at desc limit $2`,
    [tenantId, limit],
  );
  return { capability: "campaign.list", campaigns: result.rows, count: result.rowCount ?? result.rows.length };
}

async function getCampaign(pool: ReturnType<typeof getPool>, tenantId: string, campaignId: string) {
  const result = await pool.query(`select * from campaigns where id = $1 and tenant_id = $2`, [campaignId, tenantId]);
  if (!result.rows[0]) throw new CapabilityInputError("campaign_not_found");
  return { capability: "campaign.get", campaign: result.rows[0] };
}

async function analyticsOverview(pool: ReturnType<typeof getPool>, tenantId: string) {
  const result = await pool.query(
    `select
       (select count(*)::int from leads where tenant_id = $1) as "totalLeads",
       (select count(*)::int from leads where tenant_id = $1 and created_at >= now() - interval '30 days') as "newLeadsLast30Days",
       (select count(distinct lead_id)::int from lead_events where tenant_id = $1) as "conversations",
       (select count(*)::int from lead_events where tenant_id = $1 and event_type = 'message' and occurred_at >= now() - interval '30 days') as "inboundMessagesLast30Days",
       (select count(*)::int from campaigns where tenant_id = $1 and enabled = true) as "activeAutomations",
       (select count(*)::int from instagram_accounts where tenant_id = $1) as "connectedIntegrations"`,
    [tenantId],
  );
  return { capability: "analytics.overview", period: "last_30_days", analytics: result.rows[0] };
}

async function listContacts(pool: ReturnType<typeof getPool>, tenantId: string, limit: number) {
  const result = await pool.query(
    `select c.id as "contactId",
            latest_lead.id as "leadId",
            pii.username,
            pii.phone,
            latest_lead.instagram_user_id as "instagramUserId",
            c.created_at as "createdAt"
     from customers c
     join lateral (
       select l.id, l.instagram_user_id
       from leads l
       where l.customer_id = c.id and l.tenant_id = $1
       order by l.created_at desc limit 1
     ) latest_lead on true
     left join lateral (
       select p.username, p.phone
       from lead_pii p
       where p.lead_id = latest_lead.id and p.deleted_at is null
       order by p.created_at desc limit 1
     ) pii on true
     order by c.created_at desc
     limit $2`,
    [tenantId, limit],
  );
  return { capability: "contact.list", contacts: result.rows, count: result.rowCount ?? result.rows.length };
}

async function getContact(pool: ReturnType<typeof getPool>, tenantId: string, contactId: string) {
  const result = await pool.query(
    `select c.id as "contactId",
            l.id as "leadId",
            l.instagram_user_id as "instagramUserId",
            c.created_at as "createdAt",
            pii.username,
            pii.phone
     from customers c
     join leads l on l.customer_id = c.id and l.tenant_id = $1
     left join lateral (
       select p.username, p.phone
       from lead_pii p
       where p.lead_id = l.id and p.deleted_at is null
       order by p.created_at desc limit 1
     ) pii on true
     where c.id = $2`,
    [tenantId, contactId],
  );
  if (!result.rows[0]) throw new CapabilityInputError("contact_not_found");
  return { capability: "contact.get", contact: result.rows[0] };
}

async function listIntegrations(pool: ReturnType<typeof getPool>, tenantId: string, limit: number) {
  const result = await pool.query(
    `select id,
            instagram_user_id as "instagramUserId",
            created_at as "createdAt",
            updated_at as "updatedAt",
            true as connected
     from instagram_accounts
     where tenant_id = $1
     order by updated_at desc
     limit $2`,
    [tenantId, limit],
  );
  return { capability: "integration.list", integrations: result.rows, count: result.rowCount ?? result.rows.length };
}

async function getIntegration(pool: ReturnType<typeof getPool>, tenantId: string, integrationId: string) {
  const result = await pool.query(
    `select id,
            instagram_user_id as "instagramUserId",
            created_at as "createdAt",
            updated_at as "updatedAt",
            true as connected
     from instagram_accounts
     where id = $1 and tenant_id = $2`,
    [integrationId, tenantId],
  );
  if (!result.rows[0]) throw new CapabilityInputError("integration_not_found");
  return { capability: "integration.get", integration: result.rows[0] };
}

function boundedLimit(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 50);
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(Math.max(Math.floor(parsed), 1), 100);
}

function requireString(value: unknown, name: string): string {
  const parsed = typeof value === "string" ? value.trim() : "";
  if (!parsed) throw new CapabilityInputError(`${name}_required`);
  return parsed;
}

function optionalString(value: unknown): string | undefined {
  const parsed = typeof value === "string" ? value.trim() : "";
  return parsed || undefined;
}

function requireMcpServiceAuth(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.SIGNALAI_SERVICE_TOKEN ?? "";
  const provided = req.header("x-signalai-service-token") ?? "";
  if (!expected || provided !== expected) {
    return res.status(401).json({ error: "invalid service credentials" });
  }

  const tenantId = req.header("x-signalai-tenant-id")?.trim();
  if (!tenantId) return res.status(400).json({ error: "missing tenant context" });
  req.mcpTenantId = tenantId;
  return next();
}

declare global {
  namespace Express {
    interface Request {
      mcpTenantId?: string;
    }
  }
}
