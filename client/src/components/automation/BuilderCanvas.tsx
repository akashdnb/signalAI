import { useState } from "react";
import type { Campaign, Milestone } from "../../api";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BotIcon,
  HandshakeIcon,
  InstagramMarkIcon,
  ListChecksIcon,
  LockIcon,
  MaximizeIcon,
  MinusIcon,
  PlusIcon,
  SendIcon,
  TrashIcon,
} from "../icons";
import { BuilderNode, NodeConnector } from "./BuilderNode";

export type SelectedNode =
  | { type: "trigger" }
  | { type: "message" }
  | { type: "milestone"; milestoneIndex: number }
  | { type: "action"; action: "handoff" | "link" };

function triggerSubtitle(campaign: Campaign): string {
  if (campaign.triggerSource === "message") return "Direct message";
  if (campaign.triggerSource === "both") return "Comment on post or Reel, or DM";
  return "Comment on post or Reel";
}

export function BuilderCanvas({
  campaign,
  milestones,
  selectedNode,
  onSelectNode,
  onAddMilestone,
  onRemoveMilestone,
  onReorderMilestone,
}: {
  campaign: Campaign;
  milestones: Milestone[];
  selectedNode: SelectedNode;
  onSelectNode: (node: SelectedNode) => void;
  onAddMilestone: () => void;
  onRemoveMilestone: (index: number) => void;
  onReorderMilestone: (index: number, direction: -1 | 1) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [locked, setLocked] = useState(false);

  function select(node: SelectedNode) {
    if (locked) return;
    onSelectNode(node);
  }

  const isSelected = (node: SelectedNode) => JSON.stringify(node) === JSON.stringify(selectedNode);

  return (
    <div className="relative min-h-[420px] flex-1 overflow-auto bg-canvas md:min-h-0">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(var(--border) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
        aria-hidden="true"
      />

      <div
        className="relative flex flex-col items-center gap-0 p-8"
        style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
      >
        <BuilderNode
          icon={InstagramMarkIcon}
          accent="pink"
          title="Trigger"
          subtitle={triggerSubtitle(campaign)}
          selected={isSelected({ type: "trigger" })}
          onClick={() => select({ type: "trigger" })}
        >
          Keywords: {campaign.keywords.slice(0, 9).join(", ")}
          {campaign.keywords.length > 9 ? "…" : ""}
        </BuilderNode>

        <NodeConnector />

        <BuilderNode
          icon={BotIcon}
          accent="blue"
          title={campaign.replyMode === "ai_generated" ? "AI Message" : "Reply Message"}
          selected={isSelected({ type: "message" })}
          onClick={() => select({ type: "message" })}
        >
          {campaign.defaultReplyTemplate || "No reply template set yet."}
        </BuilderNode>

        {milestones.map((milestone, index) => (
          <div key={milestone.id || index} className="contents">
            <NodeConnector />
            <BuilderNode
              icon={ListChecksIcon}
              accent="green"
              title={`${index + 1}. ${milestone.goalDescription}`}
              selected={isSelected({ type: "milestone", milestoneIndex: index })}
              onClick={() => select({ type: "milestone", milestoneIndex: index })}
              menu={
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    aria-label="Move up"
                    disabled={index === 0}
                    className="flex h-6 w-6 items-center justify-center rounded text-subtle hover:bg-chip disabled:opacity-30"
                    onClick={(e) => {
                      e.stopPropagation();
                      onReorderMilestone(index, -1);
                    }}
                  >
                    <ArrowUpIcon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Move down"
                    disabled={index === milestones.length - 1}
                    className="flex h-6 w-6 items-center justify-center rounded text-subtle hover:bg-chip disabled:opacity-30"
                    onClick={(e) => {
                      e.stopPropagation();
                      onReorderMilestone(index, 1);
                    }}
                  >
                    <ArrowDownIcon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Remove milestone"
                    disabled={milestones.length === 1}
                    className="flex h-6 w-6 items-center justify-center rounded text-subtle hover:bg-chip disabled:opacity-30"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveMilestone(index);
                    }}
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              }
            >
              {milestone.captureFields.length > 0 ? `Captures: ${milestone.captureFields.join(", ")}` : "No fields captured yet."}
            </BuilderNode>
          </div>
        ))}

        <NodeConnector />
        <button
          type="button"
          onClick={onAddMilestone}
          className="mb-1 flex items-center gap-1.5 rounded-lg border border-dashed border-line px-3 py-1.5 text-xs font-medium text-subtle hover:border-accent hover:text-accent"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Add milestone
        </button>

        <NodeConnector />

        <div className="flex flex-col flex-wrap items-center gap-3 sm:flex-row sm:justify-center">
          {campaign.ctaLink && (
            <BuilderNode
              icon={SendIcon}
              accent="blue"
              title="Send Link"
              subtitle="Sends the CTA link"
              selected={isSelected({ type: "action", action: "link" })}
              onClick={() => select({ type: "action", action: "link" })}
            >
              {campaign.ctaLink}
            </BuilderNode>
          )}
          <BuilderNode
            icon={HandshakeIcon}
            accent="neutral"
            title="Handoff to Human"
            subtitle="Pauses automation for this lead"
            selected={isSelected({ type: "action", action: "handoff" })}
            onClick={() => select({ type: "action", action: "handoff" })}
          >
            Triggered automatically when the AI can't confidently continue.
          </BuilderNode>
        </div>
      </div>

      <div className="absolute bottom-4 left-4 flex flex-col gap-1 rounded-xl border border-line bg-card p-1 shadow-sm">
        <button
          type="button"
          aria-label="Zoom in"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-subtle hover:bg-chip hover:text-ink"
          onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))}
        >
          <PlusIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-subtle hover:bg-chip hover:text-ink"
          onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
        >
          <MinusIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Fit and center"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-subtle hover:bg-chip hover:text-ink"
          onClick={() => setZoom(1)}
        >
          <MaximizeIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label={locked ? "Unlock canvas" : "Lock canvas"}
          aria-pressed={locked}
          className={`flex h-8 w-8 items-center justify-center rounded-lg hover:bg-chip ${locked ? "text-accent" : "text-subtle hover:text-ink"}`}
          onClick={() => setLocked((v) => !v)}
        >
          <LockIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
