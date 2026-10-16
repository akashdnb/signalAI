import { randomUUID } from "node:crypto";
import { Router } from "express";
import { getPool } from "../db/pool.js";
import { requireServiceAuth } from "../lib/serviceAuth.js";
import { CompanyCapability, CapabilityInputError } from "../capabilities/company.js";
import { ConnectorsClient, ConnectorError } from "../capabilities/connectorsClient.js";
import type { CompanyGetInput, CompanySearchInput } from "../capabilities/types.js";

const READ_CAPABILITIES = new Set([
  "lead.list",
  "lead.get",
  "conversation.list",
  "conversation.get",
  "automation.list",
  "automation.get",
  "campaign.list",
  "campaign.get",
  "analytics.overview",
  "contact.list",
  "contact.get",
  "integration.list",
  "integration.get",
]);

export function capabilitiesRouter(companyCapability = new CompanyCapability(new ConnectorsClient())) {
  const router = Router();

  router.use("/internal/capabilities", requireServiceAuth);

  router.post("/internal/capabilities/company/search", async (req, res) => {
    const correlationId = req.header("x-correlation-id") ?? randomUUID();
    const context = {
      tenantId: req.capabilityContext!.tenantId,
      correlationId,
      actor: req.capabilityContext!.actor,
    } as const;

    try {
      const result = await companyCapability.search(req.body as CompanySearchInput, context);
      return res.status(200).json(result);
    } catch (error) {
      return handleCapabilityError(error, res);
    }
  });

  router.post("/internal/capabilities/company/get", async (req, res) => {
    const correlationId = req.header("x-correlation-id") ?? randomUUID();
    const context = {
      tenantId: req.capabilityContext!.tenantId,
      correlationId,
      actor: req.capabilityContext!.actor,
    } as const;

    try {
      const result = await companyCapability.get(req.body as CompanyGetInput, context);
      return res.status(200).json(result);
    } catch (error) {
      return handleCapabilityError(error, res);
    }
  });

  // Client-facing MCP read boundary. MCP never talks to the database directly;
  // all tenant-scoped reads are executed here with the same service-auth and
  // tenant context used by the rest of the capability layer.
  router.post("/v1/capabilities/:capability:invoke", async (req, res) => {
    const capability = req.params.capability;
    const tenantId = req.capabilityContext!.tenantId;

    if (!READ_CAPABILITIES.has(capability)) {
      return res.status(404).json({ error: "capability_not_available" });
    }

    try {
      const result = await invokeReadCapability(capability, tenantId, req.body ?? {});
      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof CapabilityInputError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      throw error;
    }
  });

  return router;
}

async function invokeReadCapability(capability: string, tenantId: string, input: Record<string, unknown>) {
  const pool = getPool();
  const limit = boundedLimit(input.limit);

  switch (capability) {
    case "lead.list":
      return listLeads(pool, tenantId, limit);
    case "lead.get":
      return getLead(pool, tenantId, requireString(input.lead_id, "lead_id"));
    case "conversation.list":
      return listConversations(pool, tenantId, limit, optionalString(input.lead_id));
    case "conversation.get":
      return getConversation(pool, tenantId, requireString(input.conversation_id, "conversation_id"));
    case "automation.list":
      return listAutomations(pool, tenantId, limit);
    case "automation.get":
      return getAutomation(pool, tenantId, requireString(input.automation_id, "automation_id"));
    case "campaign.list":
      return listCampaigns(pool, tenantId, limit);
    case "campaign.get":
      return getCampaign(pool, tenantId, requireString(input.campaign_id, "campaign_id"));
    case "analytics.overview":
      return analyticsOverview(pool, tenantId);
    case "contact.list":
      return listContacts(pool, tenantId, limit);
    case "contact.get":
      return getContact(pool, tenantId, requireString(input.contact_id, "contact_id"));
    case "integration.list":
      return listIntegrations(pool, tenantId, limit);
    case "integration.get":
      return getIntegration(pool, tenantId, requireString(input.integration_id, "integration_id"));
    default:
      throw new Error(`unhandled_capability:${capability}`);
  }
}

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

function handleCapabilityError(error: unknown, res: import("express").Response) {
  if (error instanceof CapabilityInputError) {
    return res.status(error.statusCode).json({ error: error.message });
  }
  if (error instanceof ConnectorError) {
    return res.status(error.statusCode).json({ error: error.message });
  }
  throw error;
}
