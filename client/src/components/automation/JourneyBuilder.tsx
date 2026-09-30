import { useEffect, useState } from "react";
import {
  api,
  type Campaign,
  type Dropoff,
  type FieldDefinition,
  type LeadListItem,
  type Milestone,
} from "../../api";
import { CampaignEditor } from "../CampaignEditor";
import { PIPELINE_STAGES } from "../../lib/leadFormatting";
import { DotsVerticalIcon } from "../icons";
import { BuilderCanvas, type SelectedNode } from "./BuilderCanvas";
import { Inspector } from "./Inspector";
import { TestJourneyDialog } from "./TestJourneyDialog";

type BuilderTab = "builder" | "details" | "analytics" | "leads";

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
  const [dropoff, setDropoff] = useState<Dropoff[] | null>(null);
  const [leads, setLeads] = useState<LeadListItem[] | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showTestJourney, setShowTestJourney] = useState(false);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, campaign.id]);

  useEffect(() => {
    if (subTab === "analytics") {
      api.getDropoff(tenantId, campaign.id).then(setDropoff).catch(() => setDropoff([]));
    }
    if (subTab === "leads" && leads === null) {
      api
        .getLeads(tenantId)
        .then((all) => {
          const milestoneIds = new Set(milestones.map((m) => m.id));
          setLeads(all.filter((l) => l.activeMilestoneId && milestoneIds.has(l.activeMilestoneId)));
        })
        .catch(() => setLeads([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTab, tenantId, campaign.id]);

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
    setSelectedNode({ type: "milestone", milestoneIndex: saved.length - 1 });
  }

  async function handleRemoveMilestone(index: number) {
    const next = milestones.filter((_, i) => i !== index);
    if (next.length === 0) return;
    await persistMilestones(next);
    setSelectedNode({ type: "trigger" });
  }

  async function handleReorderMilestone(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= milestones.length) return;
    const next = [...milestones];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved!);
    await persistMilestones(next);
    setSelectedNode({ type: "milestone", milestoneIndex: target });
  }

  async function handleToggleEnabled() {
    await api.setCampaignEnabled(tenantId, campaign.id, !campaign.enabled);
    setMenuOpen(false);
    onChanged();
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-card">
      <div className="border-b border-line p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="m-0 text-lg font-semibold text-ink">{campaign.name}</h2>
              <span className={campaign.enabled ? "pill pill-ok" : "pill"} style={{ marginLeft: 0 }}>
                <span className="mr-1">●</span>
                {campaign.enabled ? "Active" : "Inactive"}
              </span>
            </div>
            <p className="muted m-0 mt-1 text-sm">{campaign.defaultReplyTemplate ? "Qualify Instagram leads and capture key details." : "No reply configured yet."}</p>
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

        <div className="mt-3 flex gap-5 text-sm">
          {(["builder", "details", "analytics", "leads"] as BuilderTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setSubTab(tab)}
              className={`-mb-px border-b-2 pb-1.5 capitalize transition-colors ${
                subTab === tab ? "border-accent font-semibold text-accent" : "border-transparent text-subtle hover:text-ink"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto md:overflow-hidden">
        {subTab === "builder" && (
          <div className="flex h-full min-h-[560px] flex-col md:min-h-0 md:flex-row">
            <BuilderCanvas
              campaign={campaign}
              milestones={milestones}
              selectedNode={selectedNode}
              onSelectNode={setSelectedNode}
              onAddMilestone={handleAddMilestone}
              onRemoveMilestone={handleRemoveMilestone}
              onReorderMilestone={handleReorderMilestone}
            />
            <div className="w-full shrink-0 border-t border-line p-4 md:w-[340px] md:overflow-y-auto md:border-l md:border-t-0">
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
          <div className="h-full overflow-y-auto p-4">
            <CampaignEditor tenantId={tenantId} campaign={campaign} onChanged={onChanged} />
          </div>
        )}

        {subTab === "analytics" && (
          <div className="h-full overflow-y-auto p-4">
            <h3>Milestone drop-off</h3>
            {dropoff === null ? (
              <p className="muted">Loading…</p>
            ) : dropoff.length === 0 ? (
              <p className="muted">No milestone activity yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {dropoff.map((d) => {
                  const max = Math.max(...dropoff.map((x) => x.advancedCount), 1);
                  return (
                    <div key={d.milestoneId}>
                      <div className="flex justify-between text-xs text-subtle">
                        <span>
                          {d.ordinal + 1}. {d.goalDescription}
                        </span>
                        <span>{d.advancedCount}</span>
                      </div>
                      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-chip">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${(d.advancedCount / max) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {subTab === "leads" && (
          <div className="h-full overflow-y-auto p-4">
            <h3>Leads in this journey</h3>
            {leads === null ? (
              <p className="muted">Loading…</p>
            ) : leads.length === 0 ? (
              <p className="muted">No leads are currently in this journey.</p>
            ) : (
              <ul className="list">
                {leads.map((lead) => {
                  const stage = PIPELINE_STAGES.find((s) => s.value === lead.pipelineStage);
                  return (
                    <li key={lead.id} className="list-item">
                      <span>{lead.username ?? "Unknown"}</span>
                      <span className="pill">{stage?.label ?? lead.pipelineStage}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {showTestJourney && (
        <TestJourneyDialog tenantId={tenantId} campaign={campaign} milestones={milestones} onClose={() => setShowTestJourney(false)} />
      )}
    </div>
  );
}
