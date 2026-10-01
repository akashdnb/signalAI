import { BottomSheet } from "../BottomSheet";
import { Inspector } from "./Inspector";
import type { SelectedNode } from "./BuilderCanvas";
import type { Campaign, FieldDefinition, Milestone } from "../../api";

function inspectorTitle(selectedNode: SelectedNode): string {
  if (selectedNode.type === "trigger") return "Edit Trigger";
  if (selectedNode.type === "message") return "Edit Message";
  if (selectedNode.type === "milestone") return `Edit Milestone ${selectedNode.milestoneIndex + 1}`;
  return selectedNode.action === "link" ? "Edit Send Link" : "Handoff to Human";
}

export function NodeInspectorDialog({
  open,
  tenantId,
  campaign,
  milestones,
  fieldDefinitions,
  selectedNode,
  onClose,
  onCampaignChanged,
  onSaveMilestone,
  onFieldDefinitionsChanged,
}: {
  open: boolean;
  tenantId: string;
  campaign: Campaign;
  milestones: Milestone[];
  fieldDefinitions: FieldDefinition[];
  selectedNode: SelectedNode;
  onClose: () => void;
  onCampaignChanged: () => void;
  onSaveMilestone: (
    index: number,
    updates: { goalDescription: string; captureFields: string[] },
  ) => Promise<void>;
  onFieldDefinitionsChanged: (defs: FieldDefinition[]) => void;
}) {
  if (!open) return null;

  return (
    <div className="inspector-compact">
      <BottomSheet title={inspectorTitle(selectedNode)} onClose={onClose} maxWidth={560}>
        <Inspector
          tenantId={tenantId}
          campaign={campaign}
          milestones={milestones}
          fieldDefinitions={fieldDefinitions}
          selectedNode={selectedNode}
          onCampaignChanged={onCampaignChanged}
          onSaveMilestone={onSaveMilestone}
          onFieldDefinitionsChanged={onFieldDefinitionsChanged}
        />
      </BottomSheet>
    </div>
  );
}
