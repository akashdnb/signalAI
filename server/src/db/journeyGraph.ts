import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

/**
 * Deliberately a plain string, not a union, at this layer — the node
 * registry (client) is the source of truth for which types are valid to
 * render/configure; the server only checks shape (see isValidNode below),
 * not membership in a fixed type list, so new node types ship without a
 * server-side change here.
 */
export type JourneyNodeType = string;

export interface JourneyNode {
  id: string;
  type: JourneyNodeType;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  parentGroupId: string | null;
  collapsed: boolean;
}

export interface JourneyEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  label: string | null;
  condition: Record<string, unknown> | null;
}

export interface BuilderGraph {
  nodes: JourneyNode[];
  edges: JourneyEdge[];
  version: number;
}

interface NodeRow {
  id: string;
  type: string;
  position_x: number;
  position_y: number;
  data: Record<string, unknown>;
  parent_group_id: string | null;
  collapsed: boolean;
}

interface EdgeRow {
  id: string;
  source_node_id: string;
  target_node_id: string;
  label: string | null;
  condition: Record<string, unknown> | null;
}

function toNode(row: NodeRow): JourneyNode {
  return {
    id: row.id,
    type: row.type,
    position: { x: row.position_x, y: row.position_y },
    data: row.data,
    parentGroupId: row.parent_group_id,
    collapsed: row.collapsed,
  };
}

function toEdge(row: EdgeRow): JourneyEdge {
  return {
    id: row.id,
    sourceNodeId: row.source_node_id,
    targetNodeId: row.target_node_id,
    label: row.label,
    condition: row.condition,
  };
}

/**
 * The pipeline every campaign already runs (trigger -> message -> milestone
 * group -> handoff, plus a link action when ctaLink is set) expressed as a
 * graph, synthesized on the fly rather than backfilled into journey_nodes/
 * journey_edges — no migration/backfill script needed, and it self-heals
 * for campaigns created after this model existed too. Nodes carry no field
 * data of their own yet (`data: {}`): campaigns/campaign_milestones stay
 * the source of truth for keywords/message text/etc. until the Inspector
 * is ported to read/write through the graph. Once the caller saves any
 * graph, these ids become the real, persisted ones.
 */
function buildDefaultGraph(ctaLink: string | null): { nodes: JourneyNode[]; edges: JourneyEdge[] } {
  const triggerId = randomUUID();
  const messageId = randomUUID();
  const milestonesId = randomUUID();
  const handoffId = randomUUID();

  const nodes: JourneyNode[] = [
    { id: triggerId, type: "trigger", position: { x: 0, y: 0 }, data: {}, parentGroupId: null, collapsed: false },
    { id: messageId, type: "message", position: { x: 0, y: 160 }, data: {}, parentGroupId: null, collapsed: false },
    { id: milestonesId, type: "milestone_group", position: { x: 0, y: 320 }, data: {}, parentGroupId: null, collapsed: false },
    { id: handoffId, type: "human_handoff", position: { x: 0, y: 480 }, data: {}, parentGroupId: null, collapsed: false },
  ];
  const edges: JourneyEdge[] = [
    { id: randomUUID(), sourceNodeId: triggerId, targetNodeId: messageId, label: null, condition: null },
    { id: randomUUID(), sourceNodeId: messageId, targetNodeId: milestonesId, label: null, condition: null },
    { id: randomUUID(), sourceNodeId: milestonesId, targetNodeId: handoffId, label: null, condition: null },
  ];

  if (ctaLink) {
    const linkId = randomUUID();
    nodes.push({ id: linkId, type: "action_link", position: { x: 220, y: 480 }, data: {}, parentGroupId: null, collapsed: false });
    edges.push({ id: randomUUID(), sourceNodeId: milestonesId, targetNodeId: linkId, label: null, condition: null });
  }

  return { nodes, edges };
}

export async function getBuilderGraph(pool: Pool, tenantId: string, campaignId: string): Promise<BuilderGraph | null> {
  const campaignRes = await pool.query<{ builder_version: number; cta_link: string | null }>(
    `select builder_version, cta_link from campaigns where id = $1 and tenant_id = $2`,
    [campaignId, tenantId],
  );
  const campaignRow = campaignRes.rows[0];
  if (!campaignRow) return null;

  const nodesRes = await pool.query<NodeRow>(
    `select * from journey_nodes where campaign_id = $1 and tenant_id = $2 order by created_at`,
    [campaignId, tenantId],
  );

  if (nodesRes.rowCount === 0) {
    const { nodes, edges } = buildDefaultGraph(campaignRow.cta_link);
    return { nodes, edges, version: campaignRow.builder_version };
  }

  const edgesRes = await pool.query<EdgeRow>(
    `select * from journey_edges where campaign_id = $1 and tenant_id = $2 order by created_at`,
    [campaignId, tenantId],
  );

  return {
    nodes: nodesRes.rows.map(toNode),
    edges: edgesRes.rows.map(toEdge),
    version: campaignRow.builder_version,
  };
}

/**
 * Structural validation (roadmap: no broken edges, no orphaned/duplicate
 * ids, no invalid group references) — checked against the incoming payload
 * itself, before it ever touches the database. Loop protection is
 * deliberately not implemented yet: today's graphs are always a simple
 * chain, and nothing this model exposes (no Condition/Split node) can
 * create a cycle — add cycle detection when branching nodes ship.
 */
function validateGraph(nodes: JourneyNode[], edges: JourneyEdge[]): string[] {
  const errors: string[] = [];
  if (nodes.length === 0) errors.push("a journey must have at least one node");

  const nodeIds = new Set<string>();
  for (const node of nodes) {
    if (nodeIds.has(node.id)) errors.push(`duplicate node id: ${node.id}`);
    nodeIds.add(node.id);
  }
  for (const node of nodes) {
    if (node.parentGroupId && !nodeIds.has(node.parentGroupId)) {
      errors.push(`node ${node.id} has an invalid parentGroupId: ${node.parentGroupId}`);
    }
  }

  const edgeIds = new Set<string>();
  for (const edge of edges) {
    if (edgeIds.has(edge.id)) errors.push(`duplicate edge id: ${edge.id}`);
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.sourceNodeId)) errors.push(`edge ${edge.id} references unknown source node ${edge.sourceNodeId}`);
    if (!nodeIds.has(edge.targetNodeId)) errors.push(`edge ${edge.id} references unknown target node ${edge.targetNodeId}`);
  }

  return errors;
}

export type SaveBuilderGraphResult =
  | { status: "ok"; graph: BuilderGraph }
  | { status: "not_found" }
  | { status: "conflict"; currentVersion: number }
  | { status: "invalid"; errors: string[] };

/**
 * Atomic full-replace save (roadmap "Atomic Save"): one PUT with the whole
 * graph, not per-node/per-edge calls, so an editing session can never leave
 * a partially-saved graph behind. `expectedVersion` gates it — a mismatch
 * (another editor saved in between) is rejected as a conflict rather than
 * silently overwriting their change, using `for update` to close the
 * read-check-write race between two concurrent saves.
 */
export async function saveBuilderGraph(
  pool: Pool,
  tenantId: string,
  campaignId: string,
  expectedVersion: number,
  nodes: JourneyNode[],
  edges: JourneyEdge[],
): Promise<SaveBuilderGraphResult> {
  const errors = validateGraph(nodes, edges);
  if (errors.length > 0) return { status: "invalid", errors };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const campaignRes = await client.query<{ builder_version: number }>(
      `select builder_version from campaigns where id = $1 and tenant_id = $2 for update`,
      [campaignId, tenantId],
    );
    const campaignRow = campaignRes.rows[0];
    if (!campaignRow) {
      await client.query("ROLLBACK");
      return { status: "not_found" };
    }
    if (campaignRow.builder_version !== expectedVersion) {
      await client.query("ROLLBACK");
      return { status: "conflict", currentVersion: campaignRow.builder_version };
    }

    // Full replace, not a diff — the same "replace the whole list" shape
    // as setCampaignMilestones. Deleting the whole node set in one
    // statement is safe even with the self-referential parent_group_id FK:
    // Postgres checks a NOT DEFERRABLE FK at the end of the statement, by
    // which point every row in the deleted set (parents included) is
    // already gone, so nothing is left pointing at a missing parent.
    // journey_edges would cascade-delete via its own FK regardless; deleted
    // explicitly first anyway so that's never load-bearing.
    await client.query(`delete from journey_edges where campaign_id = $1 and tenant_id = $2`, [campaignId, tenantId]);
    await client.query(`delete from journey_nodes where campaign_id = $1 and tenant_id = $2`, [campaignId, tenantId]);

    for (const node of nodes) {
      await client.query(
        `insert into journey_nodes (id, tenant_id, campaign_id, type, position_x, position_y, data, parent_group_id, collapsed)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          node.id,
          tenantId,
          campaignId,
          node.type,
          Math.round(node.position.x),
          Math.round(node.position.y),
          node.data,
          node.parentGroupId,
          node.collapsed,
        ],
      );
    }
    for (const edge of edges) {
      await client.query(
        `insert into journey_edges (id, tenant_id, campaign_id, source_node_id, target_node_id, label, condition)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [edge.id, tenantId, campaignId, edge.sourceNodeId, edge.targetNodeId, edge.label, edge.condition],
      );
    }

    const newVersion = expectedVersion + 1;
    await client.query(`update campaigns set builder_version = $3, updated_at = now() where id = $1 and tenant_id = $2`, [
      campaignId,
      tenantId,
      newVersion,
    ]);

    await client.query("COMMIT");
    return { status: "ok", graph: { nodes, edges, version: newVersion } };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
