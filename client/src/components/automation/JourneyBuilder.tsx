import { useEffect, useRef, useState } from "react";
import { api, type Campaign, type FieldDefinition, type Milestone } from "../../api";
import { BottomSheet } from "../BottomSheet";
import { CampaignEditor, type CampaignEditorHandle } from "../CampaignEditor";
import { DotsVerticalIcon } from "../icons";
import { AnalyticsPanel } from "./AnalyticsPanel";
import { BuilderCanvas, type SelectedNode } from "./BuilderCanvas";
import { LeadsPanel } from "./LeadsPanel";
import { NodeInspectorDialog } from "./NodeInspectorDialog";
import { TestJourneyDialog } from "./TestJourneyDialog";

type BuilderTab = "builder" | "details" | "analytics" | "leads";

const TABS: { key: BuilderTab; label: string }[] = [
  { key: "builder", label: "Builder" },
  { key: "details", label: "Details" },
  { key: "analytics", label: "Analytics" },
  { key: "leads", label: "Leads" },
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
  const [milestonesLoaded, setMilestonesLoaded] = useState(false);
  const [selectedNode, setSelectedNode] = useState<SelectedNode>({ type: "trigger" });
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showTestJourney, setShowTestJourney] = useState(false);
  const [detailsDirty, setDetailsDirty] = useState(false);
  const [pendingTab, setPendingTab] = useState<BuilderTab | null>(null);
  const [graphReloadSignal, setGraphReloadSignal] = useState(0);
  const [builderVersion, setBuilderVersion] = useState<number | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const detailsRef = useRef<CampaignEditorHandle>(null);

  async function loadMilestones() {
    setMilestonesLoaded(false);
    const [ms, defs] = await Promise.all([
      api.listMilestones(tenantId, campaign.id),
      api.listFieldDefinitions(tenantId),
    ]);
    setMilestonesState(ms);
    setFieldDefinitions(defs);
    setMilestonesLoaded(true);
  }

  useEffect(() => {
    void loadMilestones();
    setSelectedNode({ type: "trigger" });
    setInspectorOpen(false);
    setBuilderVersion(null);
    setGraphReloadSignal(0);
    setPublishError(null);
    // campaign.id is the editor/document boundary.
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

    // The milestone endpoint also synchronizes journey_nodes/journey_edges
    // and advances builder_version. Ask the canvas for one explicit silent
    // reconciliation instead of letting unrelated UI state trigger a GET.
    setGraphReloadSignal((value) => value + 1);

    return saved;
  }

  async function handleSaveMilestone(
    index: number,
    updates: { goalDescription: string; captureFields: string[] },
  ) {
    const next = milestones.map((milestone, i) =>
      i === index ? { ...milestone, ...updates } : milestone,
    );
    await persistMilestones(next);
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
    const next = milestones.filter((_, i) => i !== index);
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

  async function handlePublish() {
    if (builderVersion === null) {
      setPublishError("The journey version is still loading. Try again in a moment.");
      return;
    }

    setPublishing(true);
    setPublishError(null);

    try {
      await api.publishJourney(tenantId, campaign.id, builderVersion);
      await onChanged();
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : "Couldn't publish this journey");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-card">
        <div className="border-b border-line px-3 py-3 md:px-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                className="flex h-8 shrink-0 items-center rounded-lg border border-line px-2.5 text-xs font-semibold text-ink hover:bg-chip"
                onClick={onBack}
              >
                ← Journeys
              </button>

              <div className="h-5 w-px bg-line" />

              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <h1 className="m-0 truncate text-sm font-semibold text-ink">{campaign.name}</h1>
                  <span
                    className={`shrink-0 text-[11px] ${campaign.enabled ? "pill pill-ok" : "pill"}`}
                    style={{ marginLeft: 0, padding: "0.05rem 0.5rem" }}
                  >
                    <span className="mr-1">●</span>
                    {campaign.enabled ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="muted small m-0 truncate">
                  {describeCampaign(campaign)} · Updated {new Date(campaign.updatedAt).toLocaleDateString()}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {subTab === "builder" && builderVersion !== null && (
                <span className="hidden text-[11px] text-subtle md:inline">
                  Draft v{builderVersion}
                </span>
              )}

              <button
                type="button"
                className="btn-secondary btn-small hidden md:inline-flex"
                onClick={() => setShowTestJourney(true)}
              >
                Test Journey
              </button>

              <button
                type="button"
                disabled={publishing || builderVersion === null}
                className="btn-primary btn-small hidden md:inline-flex disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => void handlePublish()}
              >
                {publishing ? "Publishing…" : "Publish"}
              </button>

              <div className="relative">
                <button
                  type="button"
                  aria-label="More actions"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-subtle hover:bg-chip hover:text-ink"
                  onClick={() => setMenuOpen((value) => !value)}
                >
                  <DotsVerticalIcon className="h-4 w-4" />
                </button>

                {menuOpen && (
                  <>
                    <button
                      type="button"
                      aria-label="Close menu"
                      className="fixed inset-0 z-40 cursor-default"
                      onClick={() => setMenuOpen(false)}
                    />
                    <div className="absolute right-0 top-9 z-50 w-44 rounded-xl border border-line bg-card p-1 shadow-lg">
                      <button
                        type="button"
                        className="w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-chip md:hidden"
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
                        className="w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-chip disabled:opacity-40 md:hidden"
                        onClick={() => {
                          setMenuOpen(false);
                          void handlePublish();
                        }}
                      >
                        {publishing ? "Publishing…" : "Publish"}
                      </button>

                      <button
                        type="button"
                        className="w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-chip"
                        onClick={() => void handleToggleEnabled()}
                      >
                        {campaign.enabled ? "Disable journey" : "Enable journey"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="-mx-3 mt-2 flex min-w-0 gap-5 overflow-x-auto px-3 text-xs md:mx-0 md:px-0">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => requestSubTabChange(tab.key)}
                className={`-mb-px flex min-h-10 shrink-0 items-center whitespace-nowrap border-b-2 pb-0.5 transition-colors ${
                  subTab === tab.key
                    ? "border-accent font-semibold text-accent"
                    : "border-transparent text-subtle hover:text-ink"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {publishError && (
          <div className="banner banner-error mx-3 mt-3 md:mx-4">{publishError}</div>
        )}

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col">
            {subTab === "builder" &&
              (milestonesLoaded ? (
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
                />
              ) : (
                <div className="relative flex min-h-[420px] flex-1 items-center justify-center bg-canvas">
                  <span className="text-sm text-subtle">Loading journey…</span>
                </div>
              ))}

            {subTab === "details" && (
              <div className="py-4 md:h-full md:overflow-y-auto md:p-4">
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
              <div className="py-4 md:h-full md:overflow-y-auto md:p-4">
                <AnalyticsPanel tenantId={tenantId} campaign={campaign} />
              </div>
            )}

            {subTab === "leads" && (
              <div className="py-4 md:h-full md:overflow-y-auto md:p-4">
                <LeadsPanel tenantId={tenantId} campaign={campaign} />
              </div>
            )}
          </div>
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
