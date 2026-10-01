import { useEffect, useMemo, useRef, useState } from "react";
import type { Campaign, FieldDefinition, Milestone } from "../../api";
import { BottomSheet } from "../BottomSheet";
import { CloseIcon } from "../icons";
import {
  Inspector,
  type InspectorHandle,
} from "./Inspector";
import type { SelectedNode } from "./BuilderCanvas";

function dialogTitle(selectedNode: SelectedNode): string {
  if (selectedNode.type === "trigger") return "Edit Trigger";
  if (selectedNode.type === "message") return "Edit Message";
  if (selectedNode.type === "milestone") return "Edit Goal";
  return selectedNode.action === "link" ? "Edit Send Link" : "Edit Handoff";
}

function GoalHeader({
  milestone,
  index,
}: {
  milestone: Milestone | undefined;
  index: number;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-[0.13em] text-accent">
        Goal {index + 1}
      </div>

      <h2 className="m-0 mt-0.5 break-words text-[20px] font-semibold leading-6 tracking-[-0.015em] text-ink">
        {milestone?.goalDescription ?? "Edit Goal"}
      </h2>

      <p className="muted m-0 mt-1 text-[11px] leading-4">
        Conversational goal the AI works toward.
      </p>
    </div>
  );
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
  onCampaignChanged: () => Promise<void> | void;
  onSaveMilestone: (
    index: number,
    updates: { goalDescription: string; captureFields: string[] },
  ) => Promise<void>;
  onFieldDefinitionsChanged: (defs: FieldDefinition[]) => void;
}) {
  const inspectorRef = useRef<InspectorHandle>(null);
  const [actions, setActions] = useState<InspectorHandle>({
    save: async () => true,
    discard: () => undefined,
    dirty: false,
    saving: false,
    canSave: false,
  });
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const milestone =
    selectedNode.type === "milestone"
      ? milestones[selectedNode.milestoneIndex]
      : undefined;

  useEffect(() => {
    if (!open) {
      setConfirmDiscard(false);
      setActions({
        save: async () => true,
        discard: () => undefined,
        dirty: false,
        saving: false,
        canSave: false,
      });
    }
  }, [open]);

  const requestClose = () => {
    if (actions.dirty) {
      setConfirmDiscard(true);
      return;
    }

    onClose();
  };

  const footer = useMemo(
    () => (
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          className="btn-secondary min-h-10 px-4"
          onClick={requestClose}
          disabled={actions.saving}
        >
          Cancel
        </button>

        {actions.canSave && (
          <button
            type="button"
            className="btn-primary min-h-10 px-4"
            onClick={async () => {
              const saved = await inspectorRef.current?.save();

              if (saved) {
                onClose();
              }
            }}
            disabled={actions.saving}
          >
            {actions.saving ? "Saving…" : "Save changes"}
          </button>
        )}
      </div>
    ),
    [actions, onClose],
  );

  if (!open) return null;

  const title = dialogTitle(selectedNode);

  return (
    <>
      <BottomSheet
        title={title}
        onClose={requestClose}
        maxWidth={860}
        bodyClassName="md:px-7"
        headerContent={
          selectedNode.type === "milestone" ? (
            <GoalHeader
              milestone={milestone}
              index={selectedNode.milestoneIndex}
            />
          ) : (
            <div className="min-w-0">
              <h2 className="m-0 text-[18px] font-semibold tracking-[-0.01em] text-ink">
                {title}
              </h2>
            </div>
          )
        }
        footer={footer}
      >
        <Inspector
          ref={inspectorRef}
          tenantId={tenantId}
          campaign={campaign}
          milestones={milestones}
          fieldDefinitions={fieldDefinitions}
          selectedNode={selectedNode}
          onCampaignChanged={onCampaignChanged}
          onSaveMilestone={onSaveMilestone}
          onFieldDefinitionsChanged={onFieldDefinitionsChanged}
          onActionsChange={setActions}
        />
      </BottomSheet>

      {confirmDiscard && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 px-4 pb-4 md:items-center md:pb-0">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="discard-dialog-title"
            className="w-full max-w-[390px] rounded-2xl border border-line bg-card p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-accent">
                  Unsaved changes
                </div>

                <h2
                  id="discard-dialog-title"
                  className="m-0 mt-1 text-[17px] font-semibold text-ink"
                >
                  Discard changes?
                </h2>

                <p className="muted m-0 mt-2 text-[12px] leading-5">
                  You have unsaved changes to this{" "}
                  {selectedNode.type === "milestone" ? "goal" : "node"}.
                </p>
              </div>

              <button
                type="button"
                aria-label="Close discard dialog"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-subtle hover:bg-chip hover:text-ink"
                onClick={() => setConfirmDiscard(false)}
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary min-h-10 px-4"
                onClick={() => setConfirmDiscard(false)}
              >
                Cancel
              </button>

              <button
                type="button"
                className="btn-primary min-h-10 bg-[#DC2626] px-4 hover:bg-[#B91C1C]"
                onClick={() => {
                  inspectorRef.current?.discard();
                  setConfirmDiscard(false);
                  onClose();
                }}
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
