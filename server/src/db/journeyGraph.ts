import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { listMilestones, type Milestone } from "./milestones.js";

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
 * is ported to read/write through the graph. Milestone nodes carry only
 * milestone identity metadata. Once the caller saves any graph, these ids
 * become the real, persisted ones.
 */
function buildDefaultGraph(
  ctaLink: string | null,
  milestones: Milestone[],
): { nodes: JourneyNode[]; edges: JourneyEdge[] } {
  const triggerId = randomUUID();
  const messageId = randomUUID();
  const milestoneIds = milestones.map(() => randomUUID());
  const handoffId = randomUUID();
  const handoffY = 320 + milestones.length * 160;

  const nodes: JourneyNode[] = [
    { id: triggerId, type: "trigger", position: { x: 0, y: 0 }, data: {}, parentGroupId: null, collapsed: false },
    { id: messageId, type: "message", position: { x: 0, y: 160 }, data: {}, parentGroupId: null, collapsed: false },
    ...milestones.map((milestone, index): JourneyNode => ({
      id: milestoneIds[index]!,
      type: "milestone_group",
      position: { x: 0, y: 320 + index * 160 },
      data: { milestoneId: milestone.id },
      parentGroupId: null,
      collapsed: false,
    })),
    { id: handoffId, type: "human_handoff", position: { x: 0, y: handoffY }, data: {}, parentGroupId: null, collapsed: false },
  ];

  const journeyPath = [messageId, ...milestoneIds, handoffId];
  const edges: JourneyEdge[] = [
    { id: randomUUID(), sourceNodeId: triggerId, targetNodeId: messageId, label: null, condition: null },
    ...journeyPath.slice(1).map((targetNodeId, index): JourneyEdge => ({
      id: randomUUID(),
      sourceNodeId: journeyPath[index]!,
      targetNodeId,
      label: null,
      condition: null,
    })),
  ];

  if (ctaLink) {
    const linkId = randomUUID();
    nodes.push({ id: linkId, type: "action_link", position: { x: 220, y: handoffY }, data: {}, parentGroupId: null, collapsed: false });
    edges.push({
      id: randomUUID(),
      sourceNodeId: milestoneIds[milestoneIds.length - 1] ?? messageId,
      targetNodeId: linkId,
      label: null,
      condition: null,
    });
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
    const milestones = await listMilestones(pool, tenantId, campaignId);
    const { nodes, edges } = buildDefaultGraph(campaignRow.cta_link, milestones);
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
 * Keep the visual graph aligned with the semantic milestone list. The index
 * map describes where each old milestone moved (or null if it was removed).
 * Existing graph node ids and positions' horizontal coordinates are retained.
 */
export function synchronizeMilestoneGraph(
  graph: BuilderGraph,
  previousMilestones: Milestone[],
  nextMilestones: Milestone[],
  oldIndexToNewIndex: Array<number | null>,
): { nodes: JourneyNode[]; edges: JourneyEdge[] } {
  if (oldIndexToNewIndex.length !== previousMilestones.length) {
    throw new Error("milestone index map must have one entry per previous milestone");
  }

  const milestoneNodes = graph.nodes.filter((node) => node.type === "milestone_group");
  const oldIndexById = new Map(previousMilestones.map((milestone, index) => [milestone.id, index]));
  const nodeByOldIndex = new Map<number, JourneyNode>();
  const unresolved: JourneyNode[] = [];

  for (const node of milestoneNodes) {
    const milestoneId = typeof node.data.milestoneId === "string" ? node.data.milestoneId : null;
    if (milestoneId !== null) {
      const oldIndex = oldIndexById.get(milestoneId);
      if (oldIndex !== undefined && !nodeByOldIndex.has(oldIndex)) {
        nodeByOldIndex.set(oldIndex, node);
      }
      continue;
    }

    const ordinal = typeof node.data.ordinal === "number" ? node.data.ordinal : null;
    if (
      ordinal !== null &&
      Number.isInteger(ordinal) &&
      ordinal >= 0 &&
      ordinal < previousMilestones.length &&
      !nodeByOldIndex.has(ordinal)
    ) {
      nodeByOldIndex.set(ordinal, node);
    } else {
      unresolved.push(node);
    }
  }

  const unassignedOldIndexes = previousMilestones
    .map((_, index) => index)
    .filter((index) => !nodeByOldIndex.has(index));
  unresolved.sort((a, b) => a.position.y - b.position.y);
  for (const [index, node] of unresolved.entries()) {
    const oldIndex = unassignedOldIndexes[index];
    if (oldIndex !== undefined) nodeByOldIndex.set(oldIndex, node);
  }

  const nodeByNewIndex = new Map<number, JourneyNode>();
  for (const [oldIndex, newIndex] of oldIndexToNewIndex.entries()) {
    if (
      newIndex === null ||
      !Number.isInteger(newIndex) ||
      newIndex < 0 ||
      newIndex >= nextMilestones.length
    ) continue;

    const oldNode = nodeByOldIndex.get(oldIndex);
    if (oldNode) nodeByNewIndex.set(newIndex, oldNode);
  }

  const nextNodeByIndex = new Map<number, JourneyNode>();
  for (let index = 0; index < nextMilestones.length; index += 1) {
    const milestone = nextMilestones[index]!;
    const existing = nodeByNewIndex.get(index);
    nextNodeByIndex.set(index, {
      ...(existing ?? {
        id: randomUUID(),
        type: "milestone_group",
        position: { x: 0, y: 0 },
        data: {},
        parentGroupId: null,
        collapsed: false,
      }),
      position: {
        x: existing?.position.x ?? 0,
        y: 320 + index * 160,
      },
      data: {
        ...(existing?.data ?? {}),
        milestoneId: milestone.id,
        ordinal: index,
      },
    });
  }

  const handoffY = 320 + nextMilestones.length * 160;
  const nodes = graph.nodes
    .filter((node) => node.type !== "milestone_group")
    .map((node) =>
      node.type === "human_handoff" || node.type === "action_link"
        ? { ...node, position: { ...node.position, y: handoffY } }
        : node,
    );
  const orderedMilestoneNodes = Array.from(nextNodeByIndex.values());
  const messageIndex = nodes.findIndex((node) => node.type === "message");
  const handoffIndex = nodes.findIndex((node) => node.type === "human_handoff");
  const insertAt = messageIndex >= 0 ? messageIndex + 1 : handoffIndex >= 0 ? handoffIndex : nodes.length;
  nodes.splice(insertAt, 0, ...orderedMilestoneNodes);

  const trigger = nodes.find((node) => node.type === "trigger");
  const message = nodes.find((node) => node.type === "message");
  const handoff = nodes.find((node) => node.type === "human_handoff");
  const oldPath = [
    trigger?.id,
    message?.id,
    ...previousMilestones.map((_, index) => nodeByOldIndex.get(index)?.id),
    handoff?.id,
  ].filter((id): id is string => id !== undefined);
  const newPath = [
    trigger?.id,
    message?.id,
    ...nextMilestones.map((_, index) => nextNodeByIndex.get(index)!.id),
    handoff?.id,
  ].filter((id): id is string => id !== undefined);

  const consumedEdgeIds = new Set<string>();
  const oldSpineEdges: Array<JourneyEdge | undefined> = [];
  for (let index = 0; index < oldPath.length - 1; index += 1) {
    const edge = graph.edges.find(
      (candidate) =>
        candidate.sourceNodeId === oldPath[index] &&
        candidate.targetNodeId === oldPath[index + 1],
    );
    oldSpineEdges.push(edge);
    if (edge) consumedEdgeIds.add(edge.id);
  }

  const spineEdges: JourneyEdge[] = [];
  for (let index = 0; index < newPath.length - 1; index += 1) {
    const oldEdge = oldSpineEdges[index];
    spineEdges.push({
      id: oldEdge?.id ?? randomUUID(),
      sourceNodeId: newPath[index]!,
      targetNodeId: newPath[index + 1]!,
      label: oldEdge?.label ?? null,
      condition: oldEdge?.condition ?? null,
    });
  }

  const oldMilestoneNodeIds = new Set(milestoneNodes.map((node) => node.id));
  const nextMilestoneNodeIds = new Set(orderedMilestoneNodes.map((node) => node.id));
  const removedNodeIds = new Set(
    milestoneNodes
      .filter((node) => !nextMilestoneNodeIds.has(node.id))
      .map((node) => node.id),
  );
  const finalMilestoneId = orderedMilestoneNodes.at(-1)?.id ?? message?.id;
  const otherEdges = graph.edges.flatMap((edge) => {
    if (consumedEdgeIds.has(edge.id)) return [];
    const targetNode = nodes.find((node) => node.id === edge.targetNodeId);
    if (
      targetNode?.type === "action_link" &&
      finalMilestoneId &&
      (edge.sourceNodeId === message?.id || oldMilestoneNodeIds.has(edge.sourceNodeId))
    ) {
      return [{ ...edge, sourceNodeId: finalMilestoneId }];
    }
    if (removedNodeIds.has(edge.sourceNodeId) || removedNodeIds.has(edge.targetNodeId)) return [];
    return [edge];
  });

  return { nodes, edges: [...spineEdges, ...otherEdges] };
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
