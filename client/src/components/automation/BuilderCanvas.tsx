import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addEdge,
  Background,
  ConnectionMode,
  ConnectionLineType,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";

import {
  api,
  type BuilderGraph,
  type Campaign,
  type JourneyEdge,
  type JourneyNode,
  type Milestone,
} from "../../api";
import {
  BotIcon,
  DotsVerticalIcon,
  HandshakeIcon,
  InstagramMarkIcon,
  ListChecksIcon,
  LockIcon,
  PlusIcon,
  SendIcon,
  TrashIcon,
} from "../icons";
import { BuilderNode } from "./BuilderNode";

export type SelectedNode =
  | { type: "trigger" }
  | { type: "message" }
  | { type: "milestone"; milestoneIndex: number }
  | { type: "action"; action: "handoff" | "link" };

type FlowNodeData = {
  campaign?: Campaign;
  milestone?: Milestone;
  milestoneId?: string;
  milestoneIndex?: number;
  ordinal?: number;
  selected?: boolean;
  locked?: boolean;
  onSelect?: () => void;
  onRemove?: () => void;
  onMove?: (direction: -1 | 1) => void;
};

type FlowNode = Node<FlowNodeData>;

function triggerSubtitle(campaign: Campaign): string {
  if (campaign.triggerSource === "message") return "Direct message";
  if (campaign.triggerSource === "both") return "Comment + direct message";
  return "Comment on post or Reel";
}

const HANDLE_CLASS =
  "!h-2 !w-2 !border-2 !border-card !bg-accent !cursor-crosshair";

function FlowHandles({
  source,
  target,
}: {
  source?: boolean;
  target?: boolean;
}) {
  const positions = [
    [Position.Top, "top"],
    [Position.Right, "right"],
    [Position.Bottom, "bottom"],
    [Position.Left, "left"],
  ] as const;

  return (
    <>
      {target &&
        positions.map(([position, id]) => (
          <Handle
            key={`target-${id}`}
            type="target"
            id={`target-${id}`}
            position={position}
            className={HANDLE_CLASS}
          />
        ))}
      {source &&
        positions.map(([position, id]) => (
          <Handle
            key={`source-${id}`}
            type="source"
            id={`source-${id}`}
            position={position}
            className={HANDLE_CLASS}
          />
        ))}
    </>
  );
}

function DotsMenu() {
  return (
    <button
      type="button"
      aria-label="Node actions"
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-subtle hover:bg-chip hover:text-ink"
      onClick={(event) => event.stopPropagation()}
    >
      <DotsVerticalIcon className="h-4 w-4" />
    </button>
  );
}

function MilestoneMenu({
  locked,
  onMove,
  onRemove,
}: {
  locked: boolean;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Goal actions"
        className="flex h-6 w-6 items-center justify-center rounded-md text-subtle hover:bg-chip hover:text-ink"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <DotsVerticalIcon className="h-4 w-4" />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close goal actions"
            className="fixed inset-0 z-20 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-7 z-30 w-36 rounded-xl border border-line bg-card p-1.5 shadow-xl">
            <button
              type="button"
              disabled={locked}
              className="w-full rounded-lg px-2.5 py-2 text-left text-xs text-ink hover:bg-chip disabled:opacity-40"
              onClick={() => {
                setOpen(false);
                onMove(-1);
              }}
            >
              Move up
            </button>
            <button
              type="button"
              disabled={locked}
              className="w-full rounded-lg px-2.5 py-2 text-left text-xs text-ink hover:bg-chip disabled:opacity-40"
              onClick={() => {
                setOpen(false);
                onMove(1);
              }}
            >
              Move down
            </button>
            <button
              type="button"
              disabled={locked}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-ink hover:bg-chip disabled:opacity-40"
              onClick={() => {
                setOpen(false);
                onRemove();
              }}
            >
              <TrashIcon className="h-3.5 w-3.5" />
              Remove
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function TriggerFlowNode({ data }: NodeProps<FlowNode>) {
  const campaign = data.campaign;
  if (!campaign) return null;

  return (
    <>
      <FlowHandles source />
      <BuilderNode
        icon={InstagramMarkIcon}
        accent="pink"
        title="Trigger"
        subtitle={triggerSubtitle(campaign)}
        selected={Boolean(data.selected)}
        onClick={() => data.onSelect?.()}
        menu={<DotsMenu />}
      >
        Keywords: {campaign.keywords.slice(0, 5).join(", ")}
        {campaign.keywords.length > 5 ? "…" : ""}
      </BuilderNode>
    </>
  );
}

function MessageFlowNode({ data }: NodeProps<FlowNode>) {
  const campaign = data.campaign;
  if (!campaign) return null;

  return (
    <>
      <FlowHandles source target />
      <BuilderNode
        icon={BotIcon}
        accent="blue"
        title={campaign.replyMode === "ai_generated" ? "AI Reply" : "Reply Message"}
        selected={Boolean(data.selected)}
        onClick={() => data.onSelect?.()}
        menu={<DotsMenu />}
      >
        {campaign.defaultReplyTemplate || "No reply message configured yet."}
      </BuilderNode>
    </>
  );
}

function MilestoneFlowNode({ data }: NodeProps<FlowNode>) {
  const milestone = data.milestone;
  const index = data.milestoneIndex ?? 0;
  if (!milestone) return null;

  return (
    <>
      <FlowHandles source target />

      <BuilderNode
        icon={ListChecksIcon}
        accent="green"
        title={`${index + 1}. ${milestone.goalDescription}`}
        selected={Boolean(data.selected)}
        onClick={() => data.onSelect?.()}
        menu={
          <MilestoneMenu
            locked={Boolean(data.locked)}
            onMove={(direction) => data.onMove?.(direction)}
            onRemove={() => data.onRemove?.()}
          />
        }
      >
        {milestone.captureFields.length > 0
          ? `Capture ${milestone.captureFields.join(", ")}`
          : "Capture product interest"}
      </BuilderNode>
    </>
  );
}

function HandoffFlowNode({ data }: NodeProps<FlowNode>) {
  return (
    <>
      <FlowHandles target />
      <BuilderNode
        icon={HandshakeIcon}
        accent="neutral"
        title="Handoff to Human"
        subtitle="Escalate to team when needed"
        selected={Boolean(data.selected)}
        onClick={() => data.onSelect?.()}
        menu={<DotsMenu />}
      >
        Pauses automation for this lead.
      </BuilderNode>
    </>
  );
}

function LinkFlowNode({ data }: NodeProps<FlowNode>) {
  const campaign = data.campaign;
  if (!campaign) return null;

  return (
    <>
      <FlowHandles target />
      <BuilderNode
        icon={SendIcon}
        accent="blue"
        title="Send Link"
        subtitle="Sends the CTA link"
        selected={Boolean(data.selected)}
        onClick={() => data.onSelect?.()}
        menu={<DotsMenu />}
      >
        {campaign.ctaLink}
      </BuilderNode>
    </>
  );
}

const nodeTypes = {
  trigger: TriggerFlowNode,
  message: MessageFlowNode,
  milestone: MilestoneFlowNode,
  human_handoff: HandoffFlowNode,
  action_link: LinkFlowNode,
};

function getMilestoneIndex(
  milestoneId: string | undefined,
  ordinal: number | undefined,
  milestones: Milestone[],
): number {
  if (milestoneId) {
    const byId = milestones.findIndex((milestone) => milestone.id === milestoneId);
    if (byId >= 0) return byId;
  }

  if (
    typeof ordinal === "number" &&
    Number.isInteger(ordinal) &&
    ordinal >= 0 &&
    ordinal < milestones.length
  ) {
    return ordinal;
  }

  return 0;
}

function looksLikeLegacyDefaultGraph(graph: BuilderGraph): boolean {
  if (graph.nodes.length < 2) return false;

  const xValues = graph.nodes.map((node) => node.position.x);
  return Math.max(...xValues) - Math.min(...xValues) < 2;
}

/**
 * Old synthesized graphs have all nodes on x=0. Reposition them into the
 * finalized diagonal composition on first presentation. Once the user moves
 * a node, the updated coordinates are saved normally.
 */
function applyPresentationLayout(graph: BuilderGraph): BuilderGraph {
  if (!looksLikeLegacyDefaultGraph(graph)) return graph;

  const milestoneNodes = graph.nodes.filter((node) => node.type === "milestone_group");
  const handoffY = 110 + milestoneNodes.length * 150;

  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      if (node.type === "trigger") {
        return { ...node, position: { x: 215, y: 80 } };
      }

      if (node.type === "message") {
        return { ...node, position: { x: 470, y: 110 } };
      }

      if (node.type === "milestone_group") {
        const index =
          typeof node.data?.ordinal === "number"
            ? node.data.ordinal
            : milestoneNodes.findIndex((candidate) => candidate.id === node.id);

        return {
          ...node,
          position: {
            x: 710 + Math.min(index, 2) * 55,
            y: 150 + index * 150,
          },
        };
      }

      if (node.type === "human_handoff") {
        return { ...node, position: { x: 770, y: handoffY } };
      }

      if (node.type === "action_link") {
        return { ...node, position: { x: 1040, y: handoffY - 12 } };
      }

      return node;
    }),
  };
}

function toFlowNodes(graph: BuilderGraph): FlowNode[] {
  return graph.nodes.map((node) => ({
    id: node.id,
    type: node.type === "milestone_group" ? "milestone" : node.type,
    position: node.position,
    data: {
      ...node.data,
      milestoneId:
        typeof node.data?.milestoneId === "string"
          ? node.data.milestoneId
          : undefined,
      ordinal:
        typeof node.data?.ordinal === "number"
          ? node.data.ordinal
          : undefined,
    },
  }));
}

function inferHandlePair(
  source: JourneyNode | undefined,
  target: JourneyNode | undefined,
): { sourceHandle: string; targetHandle: string } {
  if (!source || !target) {
    return {
      sourceHandle: "source-bottom",
      targetHandle: "target-top",
    };
  }

  const dx = target.position.x - source.position.x;
  const dy = target.position.y - source.position.y;

  if (Math.abs(dx) > Math.abs(dy)) {
    return dx >= 0
      ? { sourceHandle: "source-right", targetHandle: "target-left" }
      : { sourceHandle: "source-left", targetHandle: "target-right" };
  }

  return dy >= 0
    ? { sourceHandle: "source-bottom", targetHandle: "target-top" }
    : { sourceHandle: "source-top", targetHandle: "target-bottom" };
}

function toFlowEdges(graph: BuilderGraph): Edge[] {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));

  return graph.edges.map((edge) => {
    const handles = inferHandlePair(
      nodeById.get(edge.sourceNodeId),
      nodeById.get(edge.targetNodeId),
    );

    return {
      id: edge.id,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      sourceHandle: handles.sourceHandle,
      targetHandle: handles.targetHandle,
      label: edge.label ?? undefined,
      type: "smoothstep",
      selectable: false,
    };
  });
}

function toJourneyEdges(edges: Edge[]): JourneyEdge[] {
  return edges.map((edge) => ({
    id: edge.id,
    sourceNodeId: edge.source,
    targetNodeId: edge.target,
    label: typeof edge.label === "string" ? edge.label : null,
    condition: null,
  }));
}

export function BuilderCanvas({
  tenantId,
  campaign,
  milestones,
  selectedNode,
  onSelectNode,
  onAddMilestone,
  onRemoveMilestone,
  onReorderMilestone,
  reloadSignal = 0,
  onBuilderVersionChange,
}: {
  tenantId: string;
  campaign: Campaign;
  milestones: Milestone[];
  selectedNode: SelectedNode;
  onSelectNode: (node: SelectedNode) => void;
  onAddMilestone: () => void;
  onRemoveMilestone: (index: number) => void;
  onReorderMilestone: (index: number, direction: -1 | 1) => void;
  reloadSignal?: number;
  onBuilderVersionChange?: (version: number) => void;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const backendNodesRef = useRef<JourneyNode[]>([]);
  const backendEdgesRef = useRef<JourneyEdge[]>([]);
  const builderVersionRef = useRef<number | null>(null);
  const flowInstanceRef = useRef<ReactFlowInstance<FlowNode, Edge> | null>(null);
  const initializedRef = useRef(false);
  const initialFitDoneRef = useRef(false);

  const [locked, setLocked] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const setVersion = useCallback(
    (version: number) => {
      builderVersionRef.current = version;
      onBuilderVersionChange?.(version);
    },
    [onBuilderVersionChange],
  );

  const scheduleInitialFit = useCallback(() => {
    if (
      initialFitDoneRef.current ||
      !initializedRef.current ||
      !flowInstanceRef.current
    ) {
      return;
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const instance = flowInstanceRef.current;

        if (
          initialFitDoneRef.current ||
          !instance ||
          instance.getNodes().length === 0
        ) {
          return;
        }

        initialFitDoneRef.current = true;

        instance.fitView({
          padding: 0.12,
          minZoom: 0.55,
          maxZoom: 1.12,
          duration: 0,
        });
      });
    });
  }, []);

  const selectForNode = useCallback(
    (node: FlowNode) => {
      if (locked) return;

      if (node.type === "trigger") {
        onSelectNode({ type: "trigger" });
        return;
      }

      if (node.type === "message") {
        onSelectNode({ type: "message" });
        return;
      }

      if (node.type === "milestone") {
        onSelectNode({
          type: "milestone",
          milestoneIndex: node.data.milestoneIndex ?? 0,
        });
        return;
      }

      if (node.type === "action_link") {
        onSelectNode({ type: "action", action: "link" });
        return;
      }

      if (node.type === "human_handoff") {
        onSelectNode({ type: "action", action: "handoff" });
      }
    },
    [locked, onSelectNode],
  );

  const isSelected = useCallback(
    (node: FlowNode) => {
      if (node.type === "trigger") return selectedNode.type === "trigger";
      if (node.type === "message") return selectedNode.type === "message";

      if (node.type === "milestone") {
        return (
          selectedNode.type === "milestone" &&
          selectedNode.milestoneIndex === node.data.milestoneIndex
        );
      }

      if (node.type === "action_link") {
        return selectedNode.type === "action" && selectedNode.action === "link";
      }

      if (node.type === "human_handoff") {
        return selectedNode.type === "action" && selectedNode.action === "handoff";
      }

      return false;
    },
    [selectedNode],
  );

  const loadGraph = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setLoadError(null);

      try {
        const rawGraph = await api.getBuilderGraph(tenantId, campaign.id);
        const graph = applyPresentationLayout(rawGraph);

        backendNodesRef.current = graph.nodes;
        backendEdgesRef.current = graph.edges;
        setVersion(graph.version);

        setNodes(toFlowNodes(graph));
        setEdges(toFlowEdges(graph));
        initializedRef.current = true;
        scheduleInitialFit();
      } catch (error) {
        setLoadError(
          error instanceof Error ? error.message : "Failed to load journey flow",
        );
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [
      campaign.id,
      scheduleInitialFit,
      setEdges,
      setNodes,
      setVersion,
      tenantId,
    ],
  );

  useEffect(() => {
    initializedRef.current = false;
    initialFitDoneRef.current = false;
    void loadGraph(false);
  }, [loadGraph]);

  useEffect(() => {
    if (reloadSignal <= 0 || !initializedRef.current) return;
    void loadGraph(true);
  }, [loadGraph, reloadSignal]);

  const persistGraph = useCallback(
    async (nextNodes: JourneyNode[], nextEdges: JourneyEdge[]) => {
      if (locked) return;

      const version = builderVersionRef.current;
      if (version === null) return;

      setSaving(true);

      try {
        const saved = await api.saveBuilderGraph(
          tenantId,
          campaign.id,
          {
            expectedVersion: version,
            nodes: nextNodes,
            edges: nextEdges,
          },
        );

        backendNodesRef.current = saved.nodes;
        backendEdgesRef.current = saved.edges;
        setVersion(saved.version);
      } catch (error) {
        setLoadError(
          error instanceof Error ? error.message : "Failed to save journey",
        );

        if (
          error &&
          typeof error === "object" &&
          "status" in error &&
          (error as { status?: number }).status === 409
        ) {
          await loadGraph(true);
        }
      } finally {
        setSaving(false);
      }
    },
    [campaign.id, loadGraph, locked, setVersion, tenantId],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (
        locked ||
        !connection.source ||
        !connection.target ||
        connection.source === connection.target
      ) {
        return;
      }

      const nextEdge: Edge = {
        id: crypto.randomUUID(),
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle ?? undefined,
        targetHandle: connection.targetHandle ?? undefined,
        type: "smoothstep",
        selectable: false,
      };

      const nextEdges = addEdge(nextEdge, edges);
      setEdges(nextEdges);

      const nextBackendEdges = toJourneyEdges(nextEdges);
      backendEdgesRef.current = nextBackendEdges;
      void persistGraph(backendNodesRef.current, nextBackendEdges);
    },
    [edges, locked, persistGraph, setEdges],
  );

  const handleNodeDragStop = useCallback(
    (_event: MouseEvent | TouchEvent, draggedNode: FlowNode) => {
      if (locked) return;

      const version = builderVersionRef.current;
      if (version === null) return;

      const updatedNodes = backendNodesRef.current.map((node) =>
        node.id === draggedNode.id
          ? {
              ...node,
              position: {
                x: Math.round(draggedNode.position.x),
                y: Math.round(draggedNode.position.y),
              },
            }
          : node,
      );

      backendNodesRef.current = updatedNodes;
      void persistGraph(updatedNodes, backendEdgesRef.current);
    },
    [campaign.id, locked, persistGraph],
  );

  const decoratedNodes = useMemo<FlowNode[]>(
    () =>
      nodes.map((node) => {
        if (node.type === "milestone") {
          const index = getMilestoneIndex(
            node.data.milestoneId,
            node.data.ordinal,
            milestones,
          );
          const milestone = milestones[index];

          return {
            ...node,
            data: {
              ...node.data,
              milestone,
              milestoneIndex: index,
              selected: isSelected(node),
              locked,
              onSelect: () => selectForNode(node),
              onRemove: () => onRemoveMilestone(index),
              onMove: (direction: -1 | 1) =>
                onReorderMilestone(index, direction),
            },
          };
        }

        return {
          ...node,
          data: {
            ...node.data,
            campaign,
            selected: isSelected(node),
            locked,
            onSelect: () => selectForNode(node),
          },
        };
      }),
    [
      campaign,
      isSelected,
      locked,
      milestones,
      nodes,
      onRemoveMilestone,
      onReorderMilestone,
      selectForNode,
    ],
  );

  useEffect(() => {
    if (decoratedNodes.length > 0) {
      scheduleInitialFit();
    }
  }, [decoratedNodes.length, scheduleInitialFit]);

  const palette = (
    <div
      className={`absolute left-4 top-4 z-20 hidden overflow-hidden rounded-xl border border-line bg-card shadow-lg md:block ${
        paletteOpen ? "w-[178px]" : "w-[128px]"
      }`}
    >
      <button
        type="button"
        aria-expanded={paletteOpen}
        className="flex h-11 w-full items-center gap-2 border-b border-line px-3.5 text-left text-[13px] font-semibold text-ink hover:bg-chip"
        onClick={() => setPaletteOpen((value) => !value)}
      >
        <PlusIcon className="h-4 w-4" />
        <span className="flex-1">Add node</span>
        <span className="text-[11px] text-subtle">{paletteOpen ? "−" : "+"}</span>
      </button>

      {paletteOpen && <div className="p-2.5">
        <button
          type="button"
          className="flex min-h-10 w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-ink hover:bg-chip"
          onClick={() => onSelectNode({ type: "trigger" })}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FCE7F3] text-[#DB2777]">
            <InstagramMarkIcon className="h-4 w-4" />
          </span>
          Trigger
        </button>

        <button
          type="button"
          className="flex min-h-10 w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-ink hover:bg-chip"
          onClick={() => onSelectNode({ type: "message" })}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#DBEAFE] text-[#2563EB]">
            <BotIcon className="h-4 w-4" />
          </span>
          AI Reply
        </button>

        <button
          type="button"
          className="flex min-h-10 w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-ink hover:bg-chip"
          onClick={() => onSelectNode({ type: "message" })}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#DBEAFE] text-[#2563EB]">
            <SendIcon className="h-4 w-4" />
          </span>
          Send Message
        </button>

        <button
          type="button"
          className="flex min-h-10 w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-ink hover:bg-chip"
          onClick={onAddMilestone}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#DCFCE7] text-[#16A34A]">
            <ListChecksIcon className="h-4 w-4" />
          </span>
          New Goal
        </button>

        {[
          ["Condition", "Condition coming soon"],
          ["Delay", "Delay coming soon"],
          ["Handoff", "Handoff node coming soon"],
        ].map(([label, title]) => (
          <button
            key={label}
            type="button"
            disabled
            title={title}
            className="flex min-h-10 w-full cursor-not-allowed items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-subtle opacity-70"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-chip">
              {label === "Handoff" ? (
                <HandshakeIcon className="h-4 w-4" />
              ) : (
                <span className="text-xs">◉</span>
              )}
            </span>
            <span className="min-w-0 flex-1">{label}</span>
            <span className="rounded-full bg-chip px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide">
              Soon
            </span>
          </button>
        ))}
      </div>}
    </div>
  );

  if (loading) {
    return (
      <div className="relative flex min-h-[420px] flex-1 items-center justify-center bg-canvas">
        <span className="text-sm text-subtle">Loading flow…</span>
      </div>
    );
  }

  return (
    <div className="relative min-h-[420px] min-w-0 flex-1 overflow-hidden bg-canvas">
      {palette}

      <div className="pointer-events-none absolute left-[195px] top-4 z-10 hidden rounded-lg bg-card/85 px-2.5 py-1.5 text-[10px] text-subtle backdrop-blur md:block">
        Drag between handles to connect
      </div>

      {loadError && (
        <div className="absolute left-4 right-4 top-4 z-30 flex items-center justify-between gap-3 rounded-xl border border-line bg-card px-3 py-2.5 text-xs text-subtle shadow-sm md:left-[205px]">
          <span>{loadError}</span>
          <button
            type="button"
            className="font-semibold text-accent hover:text-accent-hover"
            onClick={() => void loadGraph(false)}
          >
            Retry
          </button>
        </div>
      )}

      <div className="absolute inset-0 min-h-0 min-w-0">
        <ReactFlow
          style={{ width: "100%", height: "100%" }}
          nodes={decoratedNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onInit={(instance) => {
            flowInstanceRef.current = instance;
            scheduleInitialFit();
          }}
          onNodesChange={locked ? undefined : onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={handleConnect}
          onNodeClick={(_event, node) => selectForNode(node)}
          onNodeDragStop={handleNodeDragStop}
          nodesDraggable={!locked}
          nodesConnectable={!locked}
          connectionMode={ConnectionMode.Loose}
          connectionLineType={ConnectionLineType.SmoothStep}
          isValidConnection={(connection) =>
            Boolean(
              connection.source &&
                connection.target &&
                connection.source !== connection.target &&
                !edges.some(
                  (edge) =>
                    edge.source === connection.source &&
                    edge.target === connection.target,
                ),
            )
          }
          elementsSelectable={!locked}
          minZoom={0.35}
          maxZoom={1.5}
          defaultEdgeOptions={{
            type: "smoothstep",
            animated: false,
          }}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={18} size={1} color="var(--border)" />

          <Controls
            showInteractive={false}
            className="!m-4 !overflow-hidden !rounded-xl !border !border-line !bg-card !shadow-sm"
          />

          <MiniMap
            nodeStrokeWidth={2}
            pannable
            zoomable
            className="!m-4 !overflow-hidden !rounded-xl !border !border-line !bg-card"
          />
        </ReactFlow>
      </div>

      <button
        type="button"
        aria-label={locked ? "Unlock canvas" : "Lock canvas"}
        aria-pressed={locked}
        className={`absolute bottom-[76px] left-4 z-20 hidden h-9 w-9 items-center justify-center rounded-lg border border-line bg-card shadow-sm md:flex ${
          locked ? "text-accent" : "text-subtle hover:text-ink"
        }`}
        onClick={() => setLocked((value) => !value)}
      >
        <LockIcon className="h-4 w-4" />
      </button>

      <div className="pointer-events-none absolute bottom-4 left-4 right-4 z-20 flex justify-start md:hidden">
        <div className="rounded-xl bg-card/95 px-3 py-2 text-[11px] text-subtle shadow-lg backdrop-blur">
          Tap a node to edit it
        </div>
      </div>

      {saving && (
        <div className="absolute bottom-4 right-4 z-20 rounded-lg border border-line bg-card px-2.5 py-1.5 text-[11px] text-subtle shadow-sm">
          Saving…
        </div>
      )}
    </div>
  );
}
