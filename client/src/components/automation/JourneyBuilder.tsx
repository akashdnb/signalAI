import { useEffect, useRef, useState } from "react";
import { api, type Campaign, type FieldDefinition, type Milestone } from "../../api";
import { BottomSheet } from "../BottomSheet";
import { CampaignEditor, type CampaignEditorHandle } from "../CampaignEditor";
import { DotsVerticalIcon } from "../icons";
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, campaign.id]);

  function selectNode(node: SelectedNode) {
    setSelectedNode(node);
    setMobileInspectorOpen(true);
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
    <div className="flex min-w-0 flex-col md:h-full md:overflow-hidden md:rounded-2xl md:border md:border-line md:bg-card">
      <div className="border-b border-line pb-4 md:p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="m-0 text-lg font-semibold text-ink">{campaign.name}</h2>
              <span className={campaign.enabled ? "pill pill-ok" : "pill"} style={{ marginLeft: 0 }}>
                <span className="mr-1">●</span>
                {campaign.enabled ? "Active" : "Inactive"}
              </span>
            </div>
            <p className="muted m-0 mt-1 text-sm">{describeCampaign(campaign)}</p>
            <p className="muted small m-0 mt-0.5">Last updated {new Date(campaign.updatedAt).toLocaleString()}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" className="btn-secondary btn-small" onClick={() => setShowTestJourney(true)}>
              Test Journey
            </button>
            <div className="relative">
              <button
                type="button"
                aria-label="More actions"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-subtle hover:bg-chip hover:text-ink"
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
                  <div className="absolute right-0 top-9 z-20 w-40 rounded-lg border border-line bg-card p-1 shadow-lg">
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

        <div className="-mx-4 mt-3 flex min-w-0 gap-5 overflow-x-auto px-4 text-sm md:mx-0 md:px-0">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => requestSubTabChange(tab.key)}
              className={`-mb-px flex max-md:min-h-11 shrink-0 items-center whitespace-nowrap border-b-2 transition-colors ${
                subTab === tab.key ? "border-accent font-semibold text-accent" : "border-transparent text-subtle hover:text-ink"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 md:min-h-0 md:overflow-hidden">
        {subTab === "builder" && (
          <div className="flex flex-col md:h-full md:min-h-0 md:flex-row">
            <BuilderCanvas
              campaign={campaign}
              milestones={milestones}
              selectedNode={selectedNode}
              onSelectNode={selectNode}
              onAddMilestone={handleAddMilestone}
              onRemoveMilestone={handleRemoveMilestone}
              onReorderMilestone={handleReorderMilestone}
            />
            <div className="hidden shrink-0 border-t border-line p-4 md:block md:w-[340px] md:overflow-y-auto md:border-l md:border-t-0">
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
          </div>
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

      {mobileInspectorOpen && subTab === "builder" && (
        <div className="md:hidden">
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
    </div>
  );
}
