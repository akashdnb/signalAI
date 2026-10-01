import { describe, expect, it } from "vitest";
import type { BuilderGraph } from "../../../db/journeyGraph.js";
import { validateJourneyGraph } from "../validateJourney.js";

function graph(
  overrides: Partial<BuilderGraph> = {},
): BuilderGraph {
  return {
    version: 1,
    nodes: [
      {
        id: "trigger",
        type: "trigger",
        position: { x: 0, y: 0 },
        data: {},
        parentGroupId: null,
        collapsed: false,
      },
      {
        id: "message",
        type: "message",
        position: { x: 0, y: 100 },
        data: {},
        parentGroupId: null,
        collapsed: false,
      },
      {
        id: "handoff",
        type: "human_handoff",
        position: { x: 0, y: 200 },
        data: {},
        parentGroupId: null,
        collapsed: false,
      },
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
        targetNodeId: "handoff",
        label: null,
        condition: null,
      },
    ],
    ...overrides,
  };
}

describe("validateJourneyGraph", () => {
  it("accepts a valid journey", () => {
    const result = validateJourneyGraph(graph());

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("requires exactly one trigger", () => {
    const result = validateJourneyGraph(
      graph({
        nodes: graph().nodes.filter((node) => node.type !== "trigger"),
      }),
    );

    expect(result.errors.some((e) => e.code === "INVALID_TRIGGER_COUNT")).toBe(
      true,
    );
  });

  it("rejects dangling edge sources", () => {
    const result = validateJourneyGraph(
      graph({
        edges: [
          ...graph().edges,
          {
            id: "bad",
            sourceNodeId: "missing",
            targetNodeId: "handoff",
            label: null,
            condition: null,
          },
        ],
      }),
    );

    expect(
      result.errors.some((e) => e.code === "UNKNOWN_EDGE_SOURCE"),
    ).toBe(true);
  });

  it("rejects dangling edge targets", () => {
    const result = validateJourneyGraph(
      graph({
        edges: [
          {
            id: "e1",
            sourceNodeId: "trigger",
            targetNodeId: "missing",
            label: null,
            condition: null,
          },
        ],
      }),
    );

    expect(
      result.errors.some((e) => e.code === "UNKNOWN_EDGE_TARGET"),
    ).toBe(true);
  });

  it("rejects unsupported node types", () => {
    const result = validateJourneyGraph(
      graph({
        nodes: [
          ...graph().nodes,
          {
            id: "unknown",
            type: "something_new",
            position: { x: 0, y: 0 },
            data: {},
            parentGroupId: null,
            collapsed: false,
          },
        ],
      }),
    );

    expect(
      result.errors.some((e) => e.code === "UNSUPPORTED_NODE_TYPE"),
    ).toBe(true);
  });

  it("rejects unreachable nodes", () => {
    const result = validateJourneyGraph(
      graph({
        nodes: [
          ...graph().nodes,
          {
            id: "orphan",
            type: "message",
            position: { x: 500, y: 500 },
            data: {},
            parentGroupId: null,
            collapsed: false,
          },
        ],
      }),
    );

    expect(
      result.errors.some((e) => e.code === "UNREACHABLE_NODE"),
    ).toBe(true);
  });

  it("rejects journeys without a terminal node", () => {
    const result = validateJourneyGraph(
      graph({
        nodes: graph().nodes.filter(
          (node) => node.type !== "human_handoff",
        ),
        edges: [
          {
            id: "e1",
            sourceNodeId: "trigger",
            targetNodeId: "message",
            label: null,
            condition: null,
          },
        ],
      }),
    );

    expect(
      result.errors.some((e) => e.code === "NO_TERMINAL_NODE"),
    ).toBe(true);
  });

  it("rejects cycles", () => {
    const result = validateJourneyGraph(
      graph({
        edges: [
          ...graph().edges,
          {
            id: "cycle",
            sourceNodeId: "handoff",
            targetNodeId: "message",
            label: null,
            condition: null,
          },
        ],
      }),
    );

    expect(result.errors.some((e) => e.code === "CYCLE")).toBe(true);
  });

  it("validates milestone references", () => {
    const result = validateJourneyGraph(
      graph({
        nodes: [
          ...graph().nodes,
          {
            id: "milestone-node",
            type: "milestone_group",
            position: { x: 0, y: 150 },
            data: { milestoneId: "missing-milestone" },
            parentGroupId: null,
            collapsed: false,
          },
        ],
      }),
      [
        {
          id: "real-milestone",
          campaignId: "campaign",
          tenantId: "tenant",
          ordinal: 0,
          goalDescription: "Get budget",
          captureFields: [],
        },
      ],
    );

    expect(
      result.errors.some((e) => e.code === "UNKNOWN_MILESTONE"),
    ).toBe(true);
  });
});
