import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
  api,
  type BuilderGraph,
  type Campaign,
  type JourneyEdge,
  type JourneyNode,
  type Milestone,
} from "../../api";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BotIcon,
  HandshakeIcon,
  InstagramMarkIcon,
  ListChecksIcon,
  LockIcon,
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
  if (campaign.triggerSource === "both") return "Comment on post or Reel, or DM";
  return "Comment on post or Reel";
}

function TriggerFlowNode({ data }: NodeProps<FlowNode>) {
  const campaign = data.campaign;
  if (!campaign) return null;

  return (
    <>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2 !w-2 !border-2 !border-card !bg-accent"
      />
      <BuilderNode
        icon={InstagramMarkIcon}
        accent="pink"
        title="Trigger"
        subtitle={triggerSubtitle(campaign)}
        selected={Boolean(data.selected)}
        onClick={() => data.onSelect?.()}
      >
        Keywords: {campaign.keywords.slice(0, 9).join(", ")}
        {campaign.keywords.length > 9 ? "…" : ""}
      </BuilderNode>
    </>
  );
}

function MessageFlowNode({ data }: NodeProps<FlowNode>) {
  const campaign = data.campaign;
  if (!campaign) return null;

  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !border-2 !border-card !bg-accent"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2 !w-2 !border-2 !border-card !bg-accent"
      />
      <BuilderNode
        icon={BotIcon}
        accent="blue"
        title={campaign.replyMode === "ai_generated" ? "AI Message" : "Reply Message"}
        selected={Boolean(data.selected)}
        onClick={() => data.onSelect?.()}
      >
        {campaign.defaultReplyTemplate || "No reply template set yet."}
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
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !border-2 !border-card !bg-accent"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2 !w-2 !border-2 !border-card !bg-accent"
      />

      <BuilderNode
        icon={ListChecksIcon}
        accent="green"
        title={`${index + 1}. ${milestone.goalDescription}`}
        selected={Boolean(data.selected)}
        onClick={() => data.onSelect?.()}
        menu={
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              aria-label="Move up"
              disabled={index === 0 || data.locked}
              className="flex h-6 w-6 items-center justify-center rounded text-subtle hover:bg-chip disabled:opacity-30"
              onClick={(event) => {
                event.stopPropagation();
                data.onMove?.(-1);
              }}
            >
              <ArrowUpIcon className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              aria-label="Move down"
              disabled={data.locked}
              className="flex h-6 w-6 items-center justify-center rounded text-subtle hover:bg-chip disabled:opacity-30"
              onClick={(event) => {
                event.stopPropagation();
                data.onMove?.(1);
              }}
            >
              <ArrowDownIcon className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              aria-label="Remove milestone"
              disabled={data.locked}
              className="flex h-6 w-6 items-center justify-center rounded text-subtle hover:bg-chip disabled:opacity-30"
              onClick={(event) => {
                event.stopPropagation();
                data.onRemove?.();
              }}
            >
              <TrashIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        }
      >
        {milestone.captureFields.length > 0
          ? `Captures: ${milestone.captureFields.join(", ")}`
          : "No fields captured yet."}
      </BuilderNode>
    </>
  );
}

function HandoffFlowNode({ data }: NodeProps<FlowNode>) {
  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !border-2 !border-card !bg-accent"
      />
      <BuilderNode
        icon={HandshakeIcon}
        accent="neutral"
        title="Handoff to Human"
        subtitle="Pauses automation for this lead"
        selected={Boolean(data.selected)}
        onClick={() => data.onSelect?.()}
      >
        Triggered automatically when the AI can't confidently continue.
      </BuilderNode>
    </>
  );
}

function LinkFlowNode({ data }: NodeProps<FlowNode>) {
  const campaign = data.campaign;
  if (!campaign) return null;

  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !border-2 !border-card !bg-accent"
      />
      <BuilderNode
        icon={SendIcon}
        accent="blue"
        title="Send Link"
        subtitle="Sends the CTA link"
        selected={Boolean(data.selected)}
        onClick={() => data.onSelect?.()}
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
    ordinal >= 0 &&
    ordinal < milestones.length
  ) {
    return ordinal;
  }

  return 0;
}

function toFlowNodes(graph: BuilderGraph): FlowNode[] {
  return graph.nodes
    .map((node) => ({
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

function toFlowEdges(graph: BuilderGraph): Edge[] {
  return graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    label: edge.label ?? undefined,
    type: "smoothstep",
    selectable: false,
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
  const initializedRef = useRef(false);

  const [locked, setLocked] = useState(false);
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
        const graph = await api.getBuilderGraph(tenantId, campaign.id);

        backendNodesRef.current = graph.nodes;
        backendEdgesRef.current = graph.edges;
        setVersion(graph.version);

        setNodes(toFlowNodes(graph));
        setEdges(toFlowEdges(graph));
        initializedRef.current = true;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to load journey";
        setLoadError(message);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [campaign.id, setEdges, setNodes, setVersion, tenantId],
  );

  useEffect(() => {
    initializedRef.current = false;
    void loadGraph(false);
  }, [loadGraph]);

  useEffect(() => {
    if (reloadSignal <= 0 || !initializedRef.current) return;
    void loadGraph(true);
  }, [loadGraph, reloadSignal]);

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
                x: draggedNode.position.x,
                y: draggedNode.position.y,
              },
            }
          : node,
      );

      backendNodesRef.current = updatedNodes;
      setSaving(true);

      const save = async () => {
        try {
          const saved = await api.saveBuilderGraph(
            tenantId,
            campaign.id,
            {
              expectedVersion: version,
              nodes: updatedNodes,
              edges: backendEdgesRef.current,
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
      };

      void save();
    },
    [campaign.id, loadGraph, locked, setVersion, tenantId],
  );

  const decoratedNodes = useMemo<FlowNode[]>(
    () =>
      nodes.map((node) => {
        if (node.type === "milestone") {
          const milestoneIndex = getMilestoneIndex(
            node.data.milestoneId,
            node.data.ordinal,
            milestones,
          );
          const milestone = milestones[milestoneIndex];

          return {
            ...node,
            data: {
              ...node.data,
              milestone,
              milestoneIndex,
              selected: isSelected(node),
              locked,
              onSelect: () => selectForNode(node),
              onRemove: () => onRemoveMilestone(milestoneIndex),
              onMove: (direction: -1 | 1) =>
                onReorderMilestone(milestoneIndex, direction),
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

  if (loading) {
    return (
      <div className="relative flex min-h-[420px] flex-1 items-center justify-center bg-canvas">
        <div className="text-sm text-subtle">Loading journey…</div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[420px] flex-1 overflow-hidden bg-canvas md:min-h-0">
      {loadError && (
        <div className="absolute left-4 right-4 top-4 z-20 rounded-lg border border-line bg-card px-3 py-2 text-xs text-subtle shadow-sm">
          {loadError}
        </div>
      )}

      <ReactFlow
        nodes={decoratedNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={locked ? undefined : onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_event, node) => selectForNode(node)}
        onNodeDragStop={handleNodeDragStop}
        nodesDraggable={!locked}
        nodesConnectable={false}
        elementsSelectable={!locked}
        fitView
        fitViewOptions={{
          padding: 0.2,
          minZoom: 0.5,
          maxZoom: 1.2,
        }}
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
          nodeStrokeWidth={3}
          className="!m-4 !overflow-hidden !rounded-xl !border !border-line !bg-card"
        />
      </ReactFlow>

      <div className="absolute bottom-4 left-4 z-10 flex items-center gap-2 rounded-xl border border-line bg-card px-3 py-2 text-xs shadow-sm">
        <button
          type="button"
          aria-label={locked ? "Unlock canvas" : "Lock canvas"}
          aria-pressed={locked}
          className={`flex h-7 w-7 items-center justify-center rounded-lg ${
            locked
              ? "text-accent hover:bg-chip"
              : "text-subtle hover:bg-chip hover:text-ink"
          }`}
          onClick={() => setLocked((value) => !value)}
        >
          <LockIcon className="h-4 w-4" />
        </button>

        <div className="h-4 w-px bg-line" />

        <button
          type="button"
          disabled={locked}
          onClick={onAddMilestone}
          className="rounded-lg px-2.5 py-1.5 font-medium text-subtle hover:bg-chip hover:text-ink disabled:opacity-40"
        >
          + Add milestone
        </button>

        {saving && (
          <>
            <div className="h-4 w-px bg-line" />
            <span className="text-subtle">Saving…</span>
          </>
        )}
      </div>
    </div>
  );
}
