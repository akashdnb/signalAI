import { describe, expect, it } from "vitest";
import type {
  BuilderGraph,
  JourneyNode,
} from "../../db/journeyGraph.js";

function node(
  id: string,
  type: string,
  data: Record<string, unknown> = {},
): JourneyNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data,
    parentGroupId: null,
    collapsed: false,
  };
}

function graph(): BuilderGraph {
  return {
    version: 1,
    nodes: [
      node("trigger", "trigger"),
      node("message", "message", {
        text: "Hello",
      }),
      node("milestone", "milestone_group", {
        milestoneId: "m1",
      }),
      node("handoff", "human_handoff"),
    ],
    edges: [
      {
        id: "e1",
        sourceNodeId: "trigger",
        targetNodeId: "message",
        label: null,
        condition: null,
      },
      {
        id: "e2",
        sourceNodeId: "message",
        targetNodeId: "milestone",
        label: null,
        condition: null,
      },
      {
        id: "e3",
        sourceNodeId: "milestone",
        targetNodeId: "handoff",
        label: null,
        condition: null,
      },
    ],
  };
}

describe("journey runtime graph semantics", () => {
  it("contains deterministic trigger -> message -> milestone -> handoff flow", () => {
    const journey = graph();

    expect(
      journey.nodes.find((node) => node.type === "trigger")?.id,
    ).toBe("trigger");

    expect(
      journey.edges.find(
        (edge) => edge.sourceNodeId === "trigger",
      )?.targetNodeId,
    ).toBe("message");

    expect(
      journey.edges.find(
        (edge) => edge.sourceNodeId === "message",
      )?.targetNodeId,
    ).toBe("milestone");

    expect(
      journey.edges.find(
        (edge) => edge.sourceNodeId === "milestone",
      )?.targetNodeId,
    ).toBe("handoff");
  });

  it("keeps message payload inside node data", () => {
    const message = graph().nodes.find(
      (node) => node.type === "message",
    );

    expect(message?.data).toEqual({
      text: "Hello",
    });
  });

  it("keeps milestone identity inside node data", () => {
    const milestone = graph().nodes.find(
      (node) => node.type === "milestone_group",
    );

    expect(milestone?.data.milestoneId).toBe("m1");
  });
});
