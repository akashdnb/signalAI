import type { PoolClient } from "pg";
import {
  createCampaignWithClient,
  type Campaign,
} from "../../db/campaigns.js";
import { listMilestonesWithClient } from "../../db/milestones.js";
import {
  getBuilderGraphWithClient,
  saveBuilderGraphWithClient,
  type BuilderGraph,
  type JourneyEdge,
  type JourneyNode,
} from "../../db/journeyGraph.js";
import { validateJourneyGraph } from "./validateJourney.js";

export type DraftLifecycleErrorCode =
  | "resource_not_found"
  | "version_conflict"
  | "invalid_lifecycle_state"
  | "validation_error";

export class DraftLifecycleError extends Error {
  constructor(
    readonly code: DraftLifecycleErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export interface JourneyDraft {
  campaign: Campaign;
  graph: BuilderGraph;
  metadata: Record<string, unknown>;
}

/**
 * Create an inactive draft in a caller-owned transaction.
 * Tenant identity is always passed from the authenticated capability context.
 */
export async function createJourneyDraftWithClient(
  client: PoolClient,
  tenantId: string,
  name: string,
  trigger: string,
  nodes: JourneyNode[] | undefined,
  edges: JourneyEdge[] | undefined,
  metadata: Record<string, unknown>,
): Promise<JourneyDraft> {
  const campaign = await createCampaignWithClient(client, tenantId, name, [trigger]);
  const defaultGraph = await getBuilderGraphWithClient(client, tenantId, campaign.id);
  if (!defaultGraph) throw new Error("draft_graph_unavailable");
  const save = await saveBuilderGraphWithClient(
    client,
    tenantId,
    campaign.id,
    defaultGraph.version,
    nodes ?? defaultGraph.nodes,
    edges ?? defaultGraph.edges,
  );
  if (save.status === "not_found") {
    throw new DraftLifecycleError("resource_not_found", "The draft could not be found.");
  }
  if (save.status === "conflict") {
    throw new DraftLifecycleError("version_conflict", "The draft changed while it was being created.", {
      currentVersion: save.currentVersion,
    });
  }
  if (save.status === "invalid") {
    throw new DraftLifecycleError("validation_error", "The draft graph is structurally invalid.", {
      validationErrors: save.errors,
    });
  }
  await client.query(
    "update campaigns set mcp_metadata = $3::jsonb where id = $1 and tenant_id = $2",
    [campaign.id, tenantId, JSON.stringify(metadata)],
  );
  return {
    campaign: { ...campaign, enabled: false },
    graph: save.graph,
    metadata,
  };
}

/**
 * Update only a draft that has no published version. A row lock and the graph
 * repository's expected-version guard prevent lost updates.
 */
export async function updateJourneyDraftWithClient(
  client: PoolClient,
  tenantId: string,
  automationId: string,
  expectedVersion: number,
  changes: {
    name?: string;
    trigger?: string;
    nodes?: JourneyNode[];
    edges?: JourneyEdge[];
    metadata?: Record<string, unknown>;
  },
): Promise<JourneyDraft & { previousVersion: number }> {
  const found = await client.query<{
    id: string;
    tenantId: string;
    name: string;
    description: string | null;
    enabled: boolean;
    builder_version: number;
    keywords: string[];
    replyMode: Campaign["replyMode"];
    replyTemplates: string[];
    defaultReplyTemplate: string;
    ctaLink: string | null;
    targetMediaIds: string[];
    replyChannel: Campaign["replyChannel"];
    triggerSource: Campaign["triggerSource"];
    tone: Campaign["tone"];
    language: Campaign["language"];
    useKnowledgeBase: boolean;
    createdAt: Date;
    updatedAt: Date;
    mcp_metadata: Record<string, unknown>;
    published: boolean;
  }>(
    `select c.id, c.tenant_id as "tenantId", c.name, c.description, c.keywords,
            c.enabled, c.reply_mode as "replyMode", c.reply_templates as "replyTemplates",
            c.default_reply_template as "defaultReplyTemplate", c.cta_link as "ctaLink",
            c.target_media_ids as "targetMediaIds", c.reply_channel as "replyChannel",
            c.trigger_source as "triggerSource", c.tone, c.language,
            c.use_knowledge_base as "useKnowledgeBase", c.created_at as "createdAt",
            c.updated_at as "updatedAt", c.builder_version,
            c.mcp_metadata,
            exists (
              select 1 from campaign_journey_versions v
               where v.tenant_id = c.tenant_id and v.campaign_id = c.id
            ) as published
       from campaigns c
       where c.id = $1 and c.tenant_id = $2
       for update`,
    [automationId, tenantId],
  );
  const row = found.rows[0];
  if (!row) throw new DraftLifecycleError("resource_not_found", "Automation not found in this workspace.");
  if (row.enabled || row.published) {
    throw new DraftLifecycleError("invalid_lifecycle_state", "Only inactive, unpublished drafts can be edited.");
  }
  if (row.builder_version !== expectedVersion) {
    throw new DraftLifecycleError(
      "version_conflict",
      "The automation changed since it was read. Re-read it before retrying.",
      { currentVersion: row.builder_version, recovery: "reread_automation" },
    );
  }

  const graphChanges = changes.nodes !== undefined || changes.edges !== undefined;
  let graph: BuilderGraph | null = null;
  let version = expectedVersion + 1;
  if (graphChanges) {
    graph = await getBuilderGraphWithClient(client, tenantId, automationId);
    if (!graph) throw new DraftLifecycleError("resource_not_found", "Automation not found in this workspace.");
    const save = await saveBuilderGraphWithClient(
      client,
      tenantId,
      automationId,
      expectedVersion,
      changes.nodes ?? graph.nodes,
      changes.edges ?? graph.edges,
    );
    if (save.status === "not_found") throw new DraftLifecycleError("resource_not_found", "Automation not found in this workspace.");
    if (save.status === "conflict") {
      throw new DraftLifecycleError("version_conflict", "The automation changed elsewhere.", { currentVersion: save.currentVersion, recovery: "reread_automation" });
    }
    if (save.status === "invalid") {
      throw new DraftLifecycleError("validation_error", "The draft graph is structurally invalid.", { validationErrors: save.errors });
    }
    graph = save.graph;
    version = save.graph.version;
  }

  const sets: string[] = [];
  const values: unknown[] = [automationId, tenantId];
  const setValue = (sql: string, value: unknown) => {
    values.push(value);
    sets.push(sql.replace("?", `$${values.length}`));
  };
  if (changes.name !== undefined) setValue("name = ?", changes.name);
  if (changes.trigger !== undefined) setValue("keywords = ?", [changes.trigger]);
  if (changes.metadata !== undefined) setValue("mcp_metadata = ?::jsonb", JSON.stringify(changes.metadata));
  if (!graphChanges) {
    values.push(version);
    sets.push(`builder_version = $${values.length}`);
  }
  if (sets.length > 0 || !graphChanges) {
    sets.push("updated_at = now()");
    const guard = graphChanges ? "" : ` and builder_version = $${values.length + 1}`;
    const params = graphChanges ? values : [...values, expectedVersion];
    const updated = await client.query(
      `update campaigns set ${sets.join(", ")} where id = $1 and tenant_id = $2${guard}`,
      params,
    );
    if (updated.rowCount !== 1) {
      const current = await client.query<{ builder_version: number }>(
        "select builder_version from campaigns where id = $1 and tenant_id = $2",
        [automationId, tenantId],
      );
      throw new DraftLifecycleError("version_conflict", "The automation changed elsewhere.", {
        currentVersion: current.rows[0]?.builder_version ?? null,
        recovery: "reread_automation",
      });
    }
  }

  const graphNow = graph ?? await getBuilderGraphWithClient(client, tenantId, automationId);
  const campaign = await client.query<{ name: string; keywords: string[]; mcp_metadata: Record<string, unknown> }>(
    "select name, keywords, mcp_metadata from campaigns where id = $1 and tenant_id = $2",
    [automationId, tenantId],
  );
  const current = campaign.rows[0];
  return {
    campaign: {
      id: row.id,
      tenantId: row.tenantId,
      name: current?.name ?? row.name,
      description: row.description,
      keywords: current?.keywords ?? row.keywords,
      enabled: false,
      published: false,
      replyMode: row.replyMode,
      replyTemplates: row.replyTemplates,
      defaultReplyTemplate: row.defaultReplyTemplate,
      ctaLink: row.ctaLink,
      targetMediaIds: row.targetMediaIds,
      replyChannel: row.replyChannel,
      triggerSource: row.triggerSource,
      tone: row.tone,
      language: row.language,
      useKnowledgeBase: row.useKnowledgeBase,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    },
    graph: graphNow ?? { nodes: [], edges: [], version },
    metadata: current?.mcp_metadata ?? row.mcp_metadata ?? {},
    previousVersion: row.builder_version,
  };
}

/** Validate a saved or in-memory journey using the canonical domain validator. */
export async function validateJourneyDraftWithClient(
  client: PoolClient,
  tenantId: string,
  input: {
    automationId?: string;
    nodes?: JourneyNode[];
    edges?: JourneyEdge[];
    expectedVersion?: number;
  },
) {
  let graph: BuilderGraph;
  const milestones = input.automationId
    ? await listMilestonesWithClient(client, tenantId, input.automationId)
    : [];
  if (input.automationId) {
    const exists = await client.query(
      "select 1 from campaigns where id = $1 and tenant_id = $2",
      [input.automationId, tenantId],
    );
    if (!exists.rowCount) throw new DraftLifecycleError("resource_not_found", "Automation not found in this workspace.");
    const loaded = await getBuilderGraphWithClient(client, tenantId, input.automationId);
    if (!loaded) throw new DraftLifecycleError("resource_not_found", "Automation not found in this workspace.");
    graph = loaded;
  } else {
    if (!input.nodes || !input.edges || input.expectedVersion === undefined) {
      throw new DraftLifecycleError("validation_error", "Provide automationId or nodes, edges, and expectedVersion.");
    }
    graph = { nodes: input.nodes, edges: input.edges, version: input.expectedVersion };
  }
  const result = validateJourneyGraph(graph, milestones);
  return {
    version: graph.version,
    valid: result.valid,
    errors: result.errors.map((item) => ({
      path: item.nodeId ? `nodes[id=${item.nodeId}]` : item.edgeId ? `edges[id=${item.edgeId}]` : "graph",
      code: item.code.toLowerCase(),
      message: item.message,
      severity: "error" as const,
    })),
    warnings: [],
    readyForReview: result.valid,
  };
}
