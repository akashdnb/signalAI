import { useEffect, useRef, useState } from "react";
import { api, type Campaign, type FieldDefinition, type Milestone } from "../../api";
import { BottomSheet } from "../BottomSheet";
import { CampaignEditor, type CampaignEditorHandle } from "../CampaignEditor";
import { DesktopDrawer } from "../DesktopDrawer";
import { CloseIcon, DotsVerticalIcon } from "../icons";
import { AnalyticsPanel } from "./AnalyticsPanel";
import { BuilderCanvas, type SelectedNode } from "./BuilderCanvas";
import { Inspector } from "./Inspector";
import { LeadsPanel } from "./LeadsPanel";
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
  const kind = campaign.triggerSource === "message" ? "DMs" : campaign.triggerSource === "both" ? "comments & DMs" : "comments";
  return `Replies to ${kind} matching ${count} keyword${count === 1 ? "" : "s"}`;
}

export function JourneyBuilder({
  tenantId,
  campaign,
  onChanged,
}: {
  tenantId: string;
  campaign: Campaign;
  onChanged: () => void;
}) {
  const [subTab, setSubTab] = useState<BuilderTab>("builder");
  const [milestones, setMilestonesState] = useState<Milestone[]>([]);
  const [fieldDefinitions, setFieldDefinitions] = useState<FieldDefinition[]>([]);
  const [selectedNode, setSelectedNode] = useState<SelectedNode>({ type: "trigger" });
  const [menuOpen, setMenuOpen] = useState(false);
  const [showTestJourney, setShowTestJourney] = useState(false);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [desktopInspectorOpen, setDesktopInspectorOpen] = useState(false);
  const [detailsDirty, setDetailsDirty] = useState(false);
  const [pendingTab, setPendingTab] = useState<BuilderTab | null>(null);
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
    loadMilestones();
    setSelectedNode({ type: "trigger" });
    setMobileInspectorOpen(false);
    setDesktopInspectorOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, campaign.id]);

  function selectNode(node: SelectedNode) {
    setSelectedNode(node);
    setMobileInspectorOpen(true);
    setDesktopInspectorOpen(true);
  }

  function requestSubTabChange(next: BuilderTab) {
    if (subTab === "details" && detailsDirty && next !== "details") {
      setPendingTab(next);
      return;
    }
    setSubTab(next);
  }

  async function persistMilestones(next: Milestone[]) {
    const saved = await api.setMilestones(
      tenantId,
      campaign.id,
      next.map((m) => ({ goalDescription: m.goalDescription, captureFields: m.captureFields })),
    );
    setMilestonesState(saved);
    return saved;
  }

  async function handleSaveMilestone(index: number, updates: { goalDescription: string; captureFields: string[] }) {
    const next = milestones.map((m, i) => (i === index ? { ...m, ...updates } : m));
    await persistMilestones(next);
  }

  async function handleAddMilestone() {
    const next = [...milestones, { id: "", campaignId: campaign.id, ordinal: milestones.length, goalDescription: "New goal", captureFields: [] }];
    const saved = await persistMilestones(next);
    selectNode({ type: "milestone", milestoneIndex: saved.length - 1 });
  }

  async function handleRemoveMilestone(index: number) {
    const next = milestones.filter((_, i) => i !== index);
    if (next.length === 0) return;
    await persistMilestones(next);
    selectNode({ type: "trigger" });
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
    onChanged();
  }

  return (
    <>
    <div className="flex min-w-0 min-h-0 flex-1 flex-col md:h-full md:overflow-hidden md:rounded-2xl md:border md:border-line md:bg-card">
      <div className="border-b border-line px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="m-0 text-sm font-semibold text-ink">{campaign.name}</h2>
              <span
                className={`text-[11px] ${campaign.enabled ? "pill pill-ok" : "pill"}`}
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
          <div className="flex shrink-0 items-center gap-2">
            {subTab === "builder" && (
              <button
                type="button"
                className={`hidden h-7 items-center rounded-lg border px-2.5 text-xs font-semibold md:inline-flex ${
                  desktopInspectorOpen ? "border-accent text-accent" : "border-line text-ink hover:bg-chip"
                }`}
                onClick={() => setDesktopInspectorOpen((v) => !v)}
                aria-pressed={desktopInspectorOpen}
              >
                Inspector
              </button>
            )}
            <button type="button" className="btn-secondary btn-small" onClick={() => setShowTestJourney(true)}>
              Test Journey
            </button>
            <div className="relative">
              <button
                type="button"
                aria-label="More actions"
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-line text-subtle hover:bg-chip hover:text-ink"
                onClick={() => setMenuOpen((v) => !v)}
              >
                <DotsVerticalIcon className="h-4 w-4" />
              </button>
              {menuOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Close menu"
                    className="fixed inset-0 z-10 cursor-default"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="absolute right-0 top-8 z-20 w-40 rounded-lg border border-line bg-card p-1 shadow-lg">
                    <button
                      type="button"
                      className="w-full rounded-md px-2.5 py-1.5 text-left text-xs text-ink hover:bg-chip"
                      onClick={handleToggleEnabled}
                    >
                      {campaign.enabled ? "Disable journey" : "Enable journey"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="-mx-4 mt-1 flex min-w-0 gap-5 overflow-x-auto px-4 text-xs md:mx-0 md:px-0">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => requestSubTabChange(tab.key)}
              className={`-mb-px flex max-md:min-h-11 shrink-0 items-center whitespace-nowrap border-b-2 pb-0.5 transition-colors ${
                subTab === tab.key ? "border-accent font-semibold text-accent" : "border-transparent text-subtle hover:text-ink"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* `relative` scopes the Inspector drawer below — it overlays only this content area, never the header above (which holds the Inspector toggle itself). */}
      <div className="relative flex flex-1 flex-col md:min-h-0 md:overflow-hidden">
        <div className="flex flex-1 flex-col md:min-h-0 md:overflow-hidden">
          {subTab === "builder" && (
            <BuilderCanvas
              tenantId={tenantId}
              campaign={campaign}
              milestones={milestones}
              selectedNode={selectedNode}
              onSelectNode={selectNode}
              onAddMilestone={handleAddMilestone}
              onRemoveMilestone={handleRemoveMilestone}
              onReorderMilestone={handleReorderMilestone}
            />
          )}

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

        {subTab === "builder" && (
          <DesktopDrawer side="right" width={340} open={desktopInspectorOpen} onClose={() => setDesktopInspectorOpen(false)}>
            <div className="inspector-compact flex h-full flex-col overflow-y-auto rounded-2xl border border-line bg-card p-4 shadow-xl">
              <div className="mb-3 flex shrink-0 items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-subtle">Inspector</span>
                <button
                  type="button"
                  aria-label="Close inspector"
                  onClick={() => setDesktopInspectorOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-subtle hover:bg-chip hover:text-ink"
                >
                  <CloseIcon className="h-4 w-4" />
                </button>
              </div>
              <Inspector
                tenantId={tenantId}
                campaign={campaign}
                milestones={milestones}
                fieldDefinitions={fieldDefinitions}
                selectedNode={selectedNode}
                onCampaignChanged={onChanged}
                onSaveMilestone={handleSaveMilestone}
                onFieldDefinitionsChanged={setFieldDefinitions}
              />
            </div>
          </DesktopDrawer>
        )}
      </div>
    </div>

    {mobileInspectorOpen && subTab === "builder" && (
      <div className="inspector-compact md:hidden">
        <BottomSheet title="Edit Node" onClose={() => setMobileInspectorOpen(false)}>
          <Inspector
            tenantId={tenantId}
            campaign={campaign}
            milestones={milestones}
            fieldDefinitions={fieldDefinitions}
            selectedNode={selectedNode}
            onCampaignChanged={onChanged}
            onSaveMilestone={handleSaveMilestone}
            onFieldDefinitionsChanged={setFieldDefinitions}
          />
        </BottomSheet>
      </div>
    )}

    {showTestJourney && (
        <TestJourneyDialog tenantId={tenantId} campaign={campaign} milestones={milestones} onClose={() => setShowTestJourney(false)} />
      )}

      {pendingTab && (
        <BottomSheet title="Unsaved changes" onClose={() => setPendingTab(null)}>
          <p className="muted mt-0">You have unsaved changes in Details. What would you like to do?</p>
          <div className="flex flex-col gap-2">
            <button type="button" className="btn-secondary min-h-11" onClick={() => setPendingTab(null)}>
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
