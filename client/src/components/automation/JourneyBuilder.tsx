import { useEffect, useRef, useState } from "react";
import { api, type Campaign, type FieldDefinition, type Milestone } from "../../api";
import { BottomSheet } from "../BottomSheet";
import { CampaignEditor, type CampaignEditorHandle } from "../CampaignEditor";
import {
  ChevronDownIcon,
  DotsVerticalIcon,
  EyeIcon,
  FileTextIcon,
} from "../icons";
import { AnalyticsPanel } from "./AnalyticsPanel";
import { BuilderCanvas, type SelectedNode } from "./BuilderCanvas";
import { LeadsPanel } from "./LeadsPanel";
import { NodeInspectorDialog } from "./NodeInspectorDialog";
import { PreviewDialog } from "./PreviewDialog";
import { TestJourneyDialog } from "./TestJourneyDialog";

type BuilderTab = "builder" | "details" | "analytics" | "leads" | "versions";

const TABS: { key: BuilderTab; label: string }[] = [
  { key: "builder", label: "Builder" },
  { key: "details", label: "Details" },
  { key: "analytics", label: "Analytics" },
  { key: "leads", label: "Leads" },
  { key: "versions", label: "Versions" },
];

function describeCampaign(campaign: Campaign): string {
  if (campaign.description) return campaign.description;

  const count = campaign.keywords.length;
  const kind =
    campaign.triggerSource === "message"
      ? "DMs"
      : campaign.triggerSource === "both"
        ? "comments & DMs"
        : "comments";

  return `Replies to ${kind} matching ${count} keyword${count === 1 ? "" : "s"}`;
}

export function JourneyBuilder({
  tenantId,
  campaign,
  onChanged,
  onBack,
}: {
  tenantId: string;
  campaign: Campaign;
  onChanged: () => Promise<void> | void;
  onBack: () => void;
}) {
  const [subTab, setSubTab] = useState<BuilderTab>("builder");
  const [milestones, setMilestonesState] = useState<Milestone[]>([]);
  const [fieldDefinitions, setFieldDefinitions] = useState<FieldDefinition[]>([]);
  const [selectedNode, setSelectedNode] = useState<SelectedNode>({ type: "trigger" });
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showTestJourney, setShowTestJourney] = useState(false);
  const [detailsDirty, setDetailsDirty] = useState(false);
  const [pendingTab, setPendingTab] = useState<BuilderTab | null>(null);
  const [graphReloadSignal, setGraphReloadSignal] = useState(0);
  const [builderVersion, setBuilderVersion] = useState<number | null>(null);
  const [builderSaveState, setBuilderSaveState] = useState<
    "saved" | "saving" | "unsaved"
  >("saved");
  const [publishing, setPublishing] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const detailsRef = useRef<CampaignEditorHandle>(null);

  async function loadMilestones() {
    const [ms, defs] = await Promise.all([
      api.listMilestones(tenantId, campaign.id),
      api.listFieldDefinitions(tenantId),
    ]);

    setMilestonesState(ms);
    setFieldDefinitions(defs);
  }

  useEffect(() => {
    void loadMilestones();
    setSelectedNode({ type: "trigger" });
    setInspectorOpen(false);
    setMenuOpen(false);
    setBuilderVersion(null);
    setGraphReloadSignal(0);
    setPublishError(null);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, campaign.id]);

  function selectNode(node: SelectedNode) {
    setSelectedNode(node);
    setInspectorOpen(true);
  }

  function requestSubTabChange(next: BuilderTab) {
    if (subTab === "details" && detailsDirty && next !== "details") {
      setPendingTab(next);
      return;
    }

    setSubTab(next);
  }

  async function persistMilestones(next: Milestone[]) {
    setBuilderSaveState("saving");

    const oldIndexToNewIndex = milestones.map((milestone) => {
      const nextIndex = next.findIndex((candidate) => candidate.id === milestone.id);
      return nextIndex < 0 ? null : nextIndex;
    });

    const saved = await api.setMilestones(
      tenantId,
      campaign.id,
      next.map((milestone) => ({
        goalDescription: milestone.goalDescription,
        captureFields: milestone.captureFields,
      })),
      oldIndexToNewIndex,
    );

    setMilestonesState(saved);
    setGraphReloadSignal((value) => value + 1);
    setBuilderSaveState("saved");
    return saved;
  }

  async function handleSaveMilestone(
    index: number,
    updates: { goalDescription: string; captureFields: string[] },
  ) {
    await persistMilestones(
      milestones.map((milestone, milestoneIndex) =>
        milestoneIndex === index ? { ...milestone, ...updates } : milestone,
      ),
    );
  }

  async function handleAddMilestone() {
    const next = [
      ...milestones,
      {
        id: "",
        campaignId: campaign.id,
        ordinal: milestones.length,
        goalDescription: "New goal",
        captureFields: [],
      },
    ];

    const saved = await persistMilestones(next);
    selectNode({ type: "milestone", milestoneIndex: saved.length - 1 });
  }

  async function handleRemoveMilestone(index: number) {
    const next = milestones.filter((_, milestoneIndex) => milestoneIndex !== index);
    if (next.length === 0) return;

    await persistMilestones(next);
    setInspectorOpen(false);
    setSelectedNode({ type: "trigger" });
  }

  async function handleReorderMilestone(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= milestones.length) return;

    const next = [...milestones];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved!);

    await persistMilestones(next);
    selectNode({ type: "milestone", milestoneIndex: target });
  }

  async function handleToggleEnabled() {
    await api.setCampaignEnabled(tenantId, campaign.id, !campaign.enabled);
    setMenuOpen(false);
    await onChanged();
  }

  function requestPublish() {
    if (builderVersion === null) {
      setPublishError("The journey version is still loading.");
      return;
    }

    setMenuOpen(false);
    setShowPublishConfirm(true);
  }

  async function handlePublish() {
    if (builderVersion === null) return;

    setPublishing(true);
    setPublishError(null);

    try {
      await api.publishJourney(tenantId, campaign.id, builderVersion);
      setShowPublishConfirm(false);
      await onChanged();
    } catch (error) {
      setPublishError(
        error instanceof Error ? error.message : "Couldn't publish this journey",
      );
    } finally {
      setPublishing(false);
    }
  }

  return (
    <>
      <div className="automation-builder flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-card">
        <div className="relative border-b border-line px-4 pt-2.5 md:px-5">
          <div className="flex items-start justify-between gap-4">
            <button
              type="button"
              className="builder-toolbar-button mt-0.5 flex h-8 shrink-0 items-center rounded-lg px-2 text-[13px] font-medium text-ink hover:bg-chip"
              onClick={onBack}
            >
              ← Back to journeys
            </button>

            <div className="flex shrink-0 items-center gap-1">
              {subTab === "builder" && builderVersion !== null && (
                <span className="mr-1 hidden items-center gap-1.5 rounded-lg px-2 text-[11px] text-subtle lg:inline-flex">
                  <span className="font-medium text-ink">v{builderVersion}</span>
                  <span aria-hidden="true">·</span>
                  <span
                    className={
                      builderSaveState === "saving"
                        ? "font-medium text-subtle"
                        : builderSaveState === "unsaved"
                          ? "font-semibold text-[#B45309]"
                          : "font-semibold text-[#059669]"
                    }
                  >
                    {builderSaveState === "saving"
                      ? "Saving…"
                      : builderSaveState === "unsaved"
                        ? "Unsaved changes"
                        : "Saved"}
                  </span>
                </span>
              )}

              <button
                type="button"
                aria-label="Documentation"
                className="builder-toolbar-button hidden h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-ink hover:bg-chip lg:inline-flex"
                title="Documentation is coming soon"
              >
                <FileTextIcon className="h-4 w-4" />
                Docs
              </button>

              <button
                type="button"
                className="builder-toolbar-button hidden h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-ink hover:bg-chip md:inline-flex"
                onClick={() => setShowPreview(true)}
              >
                <EyeIcon className="h-4 w-4" />
                Preview
              </button>

              <button
                type="button"
                className="builder-toolbar-button hidden h-9 rounded-lg bg-chip px-3 text-sm font-semibold text-ink hover:bg-[#EBDDFF] md:inline-flex md:items-center"
                onClick={() => setShowTestJourney(true)}
              >
                Test Journey
              </button>

              <button
                type="button"
                disabled={publishing || builderVersion === null}
                className="builder-toolbar-button hidden h-9 items-center gap-1.5 rounded-lg border border-accent/20 bg-accent px-4 text-sm font-semibold text-white shadow-sm hover:bg-accent-hover disabled:opacity-50 md:inline-flex"
                onClick={() => requestPublish()}
              >
                {publishing ? "Publishing…" : "Publish"}
                <ChevronDownIcon className="h-4 w-4" />
              </button>

              <button
                type="button"
                aria-label="More actions"
                className="builder-toolbar-button flex h-9 w-9 items-center justify-center rounded-lg text-subtle hover:bg-chip hover:text-ink"
                onClick={() => setMenuOpen((value) => !value)}
              >
                <DotsVerticalIcon className="h-5 w-5" />
              </button>

              {menuOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Close actions"
                    className="fixed inset-0 z-40 cursor-default"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="absolute right-5 top-12 z-50 w-48 rounded-xl border border-line bg-card p-1.5 shadow-xl">
                    <button
                      type="button"
                      className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-chip md:hidden"
                      onClick={() => {
                        setMenuOpen(false);
                        setShowPreview(true);
                      }}
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-chip md:hidden"
                      onClick={() => {
                        setMenuOpen(false);
                        setShowTestJourney(true);
                      }}
                    >
                      Test Journey
                    </button>
                    <button
                      type="button"
                      disabled={publishing || builderVersion === null}
                      className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-chip disabled:opacity-40 md:hidden"
                      onClick={() => requestPublish()}
                    >
                      {publishing ? "Publishing…" : "Publish"}
                    </button>
                    <button
                      type="button"
                      className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-chip"
                      onClick={() => void handleToggleEnabled()}
                    >
                      {campaign.enabled ? "Disable journey" : "Enable journey"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="min-w-0 pb-2 pt-1">
            <div className="flex min-w-0 items-center gap-2.5">
              <h1 className="m-0 truncate text-[20px] font-semibold tracking-[-0.015em] text-ink">
                {campaign.name}
              </h1>

              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                  campaign.enabled
                    ? "bg-[#D1FAE5] text-[#047857]"
                    : "bg-[#E2E8F0] text-[#475569]"
                }`}
              >
                <span className="mr-1">●</span>
                {campaign.enabled ? "Active" : "Inactive"}
              </span>
            </div>

            <p className="muted m-0 mt-0.5 truncate text-[11px]">
              {describeCampaign(campaign)} · Updated{" "}
              {new Date(campaign.updatedAt).toLocaleDateString()}
            </p>
          </div>

          <div className="mt-1.5 flex gap-7 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => requestSubTabChange(tab.key)}
                className={`relative -mb-px shrink-0 px-0 pb-2.5 pt-0.5 text-[13px] leading-5 transition-colors ${
                  subTab === tab.key
                    ? "font-semibold text-ink"
                    : "text-subtle hover:text-ink"
                }`}
              >
                {tab.label}
                <span
                  aria-hidden="true"
                  className={`absolute bottom-[-1px] left-0 h-[3px] rounded-full bg-accent transition-opacity ${
                    subTab === tab.key ? "w-full opacity-100" : "w-0 opacity-0"
                  }`}
                />
              </button>
            ))}
          </div>
        </div>

        {publishError && (
          <div className="banner banner-error mx-4 mt-3 md:mx-5">{publishError}</div>
        )}

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {subTab === "builder" && (
            <BuilderCanvas
              tenantId={tenantId}
              campaign={campaign}
              milestones={milestones}
              selectedNode={selectedNode}
              onSelectNode={selectNode}
              onAddMilestone={() => void handleAddMilestone()}
              onRemoveMilestone={(index) => void handleRemoveMilestone(index)}
              onReorderMilestone={(index, direction) =>
                void handleReorderMilestone(index, direction)
              }
              reloadSignal={graphReloadSignal}
              onBuilderVersionChange={setBuilderVersion}
              onSaveStateChange={setBuilderSaveState}
            />
          )}

          {subTab === "details" && (
            <div className="py-4 md:h-full md:overflow-y-auto md:p-5">
              <CampaignEditor
                ref={detailsRef}
                tenantId={tenantId}
                campaign={campaign}
                onChanged={onChanged}
                onDirtyChange={setDetailsDirty}
              />
            </div>
          )}

          {subTab === "analytics" && (
            <div className="py-4 md:h-full md:overflow-y-auto md:p-5">
              <AnalyticsPanel tenantId={tenantId} campaign={campaign} />
            </div>
          )}

          {subTab === "leads" && (
            <div className="py-4 md:h-full md:overflow-y-auto md:p-5">
              <LeadsPanel tenantId={tenantId} campaign={campaign} />
            </div>
          )}

          {subTab === "versions" && (
            <div className="h-full overflow-y-auto p-4 md:p-6">
              <div className="rounded-2xl border border-line bg-card p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="m-0 text-base font-semibold text-ink">
                      Journey versions
                    </h2>
                    <p className="muted m-0 mt-1 text-sm">
                      Draft and published journey snapshots will appear here.
                    </p>
                  </div>

                  <span className="rounded-full bg-chip px-2.5 py-1 text-[11px] font-semibold text-subtle">
                    v{builderVersion ?? "—"}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <NodeInspectorDialog
        open={inspectorOpen && subTab === "builder"}
        tenantId={tenantId}
        campaign={campaign}
        milestones={milestones}
        fieldDefinitions={fieldDefinitions}
        selectedNode={selectedNode}
        onClose={() => setInspectorOpen(false)}
        onCampaignChanged={onChanged}
        onSaveMilestone={handleSaveMilestone}
        onFieldDefinitionsChanged={setFieldDefinitions}
      />

      {showPublishConfirm && (
        <BottomSheet
          title="Publish changes"
          onClose={() => {
            if (!publishing) setShowPublishConfirm(false);
          }}
        >
          <p className="m-0 text-sm text-ink">
            v{builderVersion ?? "—"} will become the active version.
          </p>
          <p className="muted mt-2 text-xs">
            Your currently published journey remains active until these changes are published.
          </p>

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              disabled={publishing}
              onClick={() => setShowPublishConfirm(false)}
            >
              Cancel
            </button>

            <button
              type="button"
              className="btn-primary"
              disabled={publishing}
              onClick={() => void handlePublish()}
            >
              {publishing ? "Publishing…" : "Publish"}
            </button>
          </div>
        </BottomSheet>
      )}

      {showPreview && (
        <PreviewDialog
          tenantId={tenantId}
          campaign={campaign}
          onClose={() => setShowPreview(false)}
        />
      )}

      {showTestJourney && (
        <TestJourneyDialog
          tenantId={tenantId}
          campaign={campaign}
          milestones={milestones}
          onClose={() => setShowTestJourney(false)}
        />
      )}

      {pendingTab && (
        <BottomSheet title="Unsaved changes" onClose={() => setPendingTab(null)}>
          <p className="muted mt-0">
            You have unsaved changes in Details. What would you like to do?
          </p>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="btn-secondary min-h-11"
              onClick={() => setPendingTab(null)}
            >
              Keep editing
            </button>

            <button
              type="button"
              className="btn-secondary min-h-11"
              onClick={() => {
                detailsRef.current?.discard();
                setSubTab(pendingTab);
                setPendingTab(null);
              }}
            >
              Discard changes
            </button>

            <button
              type="button"
              className="btn-primary min-h-11"
              onClick={async () => {
                const ok = await detailsRef.current?.save();
                if (ok) {
                  setSubTab(pendingTab);
                  setPendingTab(null);
                }
              }}
            >
              Save changes
            </button>
          </div>
        </BottomSheet>
      )}
    </>
  );
}
