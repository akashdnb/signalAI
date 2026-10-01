import type { BuilderGraph, JourneyNode } from "../../db/journeyGraph.js";
import type { Milestone } from "../../db/milestones.js";

export type JourneyValidationCode =
  | "EMPTY_GRAPH"
  | "INVALID_TRIGGER_COUNT"
  | "DUPLICATE_NODE_ID"
  | "DUPLICATE_EDGE_ID"
  | "UNKNOWN_EDGE_SOURCE"
  | "UNKNOWN_EDGE_TARGET"
  | "INVALID_PARENT_GROUP"
  | "UNSUPPORTED_NODE_TYPE"
  | "MISSING_MILESTONE_ID"
  | "UNKNOWN_MILESTONE"
  | "MISSING_MILESTONE_NODE"
  | "DUPLICATE_MILESTONE_NODE"
  | "UNREACHABLE_NODE"
  | "NO_TERMINAL_NODE"
  | "CYCLE";

export interface JourneyValidationError {
  code: JourneyValidationCode;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

export interface JourneyValidationResult {
  valid: boolean;
  errors: JourneyValidationError[];
}

const SUPPORTED_NODE_TYPES = new Set([
  "trigger",
  "message",
  "milestone_group",
  "human_handoff",
  "action_link",
]);

function error(
  code: JourneyValidationCode,
  message: string,
  extra?: Pick<JourneyValidationError, "nodeId" | "edgeId">,
): JourneyValidationError {
  return {
    code,
    message,
    ...extra,
  };
}

function reachableNodes(graph: BuilderGraph): Set<string> {
  const adjacency = new Map<string, string[]>();

  for (const node of graph.nodes) {
    adjacency.set(node.id, []);
  }

  for (const edge of graph.edges) {
    const children = adjacency.get(edge.sourceNodeId);
    if (children) {
      children.push(edge.targetNodeId);
    }
  }

  const trigger = graph.nodes.find((node) => node.type === "trigger");
  if (!trigger) return new Set();

  const visited = new Set<string>();
  const queue = [trigger.id];

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (visited.has(current)) continue;
    visited.add(current);

    for (const child of adjacency.get(current) ?? []) {
      if (!visited.has(child)) {
        queue.push(child);
      }
    }
  }

  return visited;
}

function containsCycle(graph: BuilderGraph): boolean {
  const adjacency = new Map<string, string[]>();

  for (const node of graph.nodes) {
    adjacency.set(node.id, []);
  }

  for (const edge of graph.edges) {
    adjacency.get(edge.sourceNodeId)?.push(edge.targetNodeId);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(nodeId: string): boolean {
    if (visiting.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;

    visiting.add(nodeId);

    for (const child of adjacency.get(nodeId) ?? []) {
      if (visit(child)) return true;
    }

    visiting.delete(nodeId);
    visited.add(nodeId);

    return false;
  }

  for (const node of graph.nodes) {
    if (visit(node.id)) return true;
  }

  return false;
}

export function validateJourneyGraph(
  graph: BuilderGraph,
  milestones: Milestone[] = [],
): JourneyValidationResult {
  const errors: JourneyValidationError[] = [];

  if (graph.nodes.length === 0) {
    errors.push(error("EMPTY_GRAPH", "Journey must contain at least one node."));
    return { valid: false, errors };
  }

  /*
   * Build the complete node registry first.
   *
   * Parent references must not depend on node ordering. A child is allowed
   * to appear before its parent in the serialized graph.
   */
  const nodeIds = new Set<string>();

  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) {
      errors.push(
        error("DUPLICATE_NODE_ID", `Duplicate node id: ${node.id}`, {
          nodeId: node.id,
        }),
      );
    }

    nodeIds.add(node.id);
  }

  for (const node of graph.nodes) {
    if (!SUPPORTED_NODE_TYPES.has(node.type)) {
      errors.push(
        error(
          "UNSUPPORTED_NODE_TYPE",
          `Unsupported journey node type: ${node.type}`,
          { nodeId: node.id },
        ),
      );
    }

    if (
      node.parentGroupId !== null &&
      !nodeIds.has(node.parentGroupId)
    ) {
      errors.push(
        error(
          "INVALID_PARENT_GROUP",
          `Node ${node.id} references missing parent group ${node.parentGroupId}.`,
          { nodeId: node.id },
        ),
      );
    }

    if (node.type === "milestone_group") {
      const milestoneId = node.data.milestoneId;

      if (typeof milestoneId !== "string" || !milestoneId) {
        errors.push(
          error(
            "MISSING_MILESTONE_ID",
            `Milestone node ${node.id} has no milestoneId.`,
            { nodeId: node.id },
          ),
        );
      } else if (
        milestones.length > 0 &&
        !milestones.some((milestone) => milestone.id === milestoneId)
      ) {
        errors.push(
          error(
            "UNKNOWN_MILESTONE",
            `Milestone node ${node.id} references unknown milestone ${milestoneId}.`,
            { nodeId: node.id },
          ),
        );
      }
    }
  }

  /*
   * Every active milestone must be represented exactly once in the journey.
   *
   * A milestone node referencing an unknown milestone is already reported
   * above. Here we additionally make sure no current milestone disappears
   * from the graph.
   */
  if (milestones.length > 0) {
    const milestoneNodeCounts = new Map<string, number>();

    for (const node of graph.nodes) {
      if (node.type !== "milestone_group") continue;

      const milestoneId = node.data.milestoneId;

      if (typeof milestoneId !== "string" || !milestoneId) {
        continue;
      }

      milestoneNodeCounts.set(
        milestoneId,
        (milestoneNodeCounts.get(milestoneId) ?? 0) + 1,
      );
    }

    for (const milestone of milestones) {
      const count = milestoneNodeCounts.get(milestone.id) ?? 0;

      if (count === 0) {
        errors.push(
          error(
            "MISSING_MILESTONE_NODE",
            `Milestone ${milestone.id} is not represented in the journey.`,
          ),
        );
      } else if (count > 1) {
        errors.push(
          error(
            "DUPLICATE_MILESTONE_NODE",
            `Milestone ${milestone.id} is represented by ${count} journey nodes.`,
          ),
        );
      }
    }
  }

  const triggerCount = graph.nodes.filter(
    (node) => node.type === "trigger",
  ).length;

  if (triggerCount !== 1) {
    errors.push(
      error(
        "INVALID_TRIGGER_COUNT",
        `Journey must contain exactly one trigger node; found ${triggerCount}.`,
      ),
    );
  }

  const edgeIds = new Set<string>();

  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) {
      errors.push(
        error("DUPLICATE_EDGE_ID", `Duplicate edge id: ${edge.id}`, {
          edgeId: edge.id,
        }),
      );
    }

    edgeIds.add(edge.id);

    if (!nodeIds.has(edge.sourceNodeId)) {
      errors.push(
        error(
          "UNKNOWN_EDGE_SOURCE",
          `Edge ${edge.id} references unknown source node ${edge.sourceNodeId}.`,
          { edgeId: edge.id },
        ),
      );
    }

    if (!nodeIds.has(edge.targetNodeId)) {
      errors.push(
        error(
          "UNKNOWN_EDGE_TARGET",
          `Edge ${edge.id} references unknown target node ${edge.targetNodeId}.`,
          { edgeId: edge.id },
        ),
      );
    }
  }

  const reachable = reachableNodes(graph);

  for (const node of graph.nodes) {
    if (!reachable.has(node.id)) {
      errors.push(
        error(
          "UNREACHABLE_NODE",
          `Node ${node.id} is unreachable from the trigger.`,
          { nodeId: node.id },
        ),
      );
    }
  }

  const terminalNodes = graph.nodes.filter(
    (node) =>
      node.type === "human_handoff" ||
      node.type === "action_link",
  );

  if (terminalNodes.length === 0) {
    errors.push(
      error(
        "NO_TERMINAL_NODE",
        "Journey must contain at least one terminal node.",
      ),
    );
  }

  if (containsCycle(graph)) {
    errors.push(
      error(
        "CYCLE",
        "Journey contains a cycle. Cyclic journeys are not supported yet.",
      ),
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
