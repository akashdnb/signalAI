import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { ApiError, api, type Campaign } from "../api";
import { AutomationHeader } from "../components/automation/AutomationHeader";
import { AutomationTabs, type AutomationTab } from "../components/automation/AutomationTabs";
import { JourneyList } from "../components/automation/JourneyList";
import { JourneyBuilder } from "../components/automation/JourneyBuilder";
import { MobileJourneySelector } from "../components/automation/MobileJourneySelector";
import { NewJourneyDialog } from "../components/automation/NewJourneyDialog";
import { PreviewDialog } from "../components/automation/PreviewDialog";
import { ToastStack, useToasts } from "../components/Toast";

/** Moved off the Dashboard (R6), rebuilt as a journey/milestone builder (R7): reply automatically to comments and DMs that match a campaign's keywords, visualized as trigger -> AI conversation -> milestones -> outcome. */
export function AutomationPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<AutomationTab>("journeys");
  const [error, setError] = useState<string | null>(null);
  const [showNewJourney, setShowNewJourney] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const { toasts, push } = useToasts();

  async function reload(selectAfter?: string) {
    if (!tenantId) return;
    try {
      const list = await api.listCampaigns(tenantId);
      setCampaigns(list);
      setError(null);
      if (selectAfter) {
        setSelectedId(selectAfter);
      } else {
        setSelectedId((prev) => (prev && list.some((c) => c.id === prev) ? prev : (list[0]?.id ?? null)));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load journeys");
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const filtered = useMemo(() => {
    if (!campaigns) return null;
    const q = search.trim().toLowerCase();
    if (!q) return campaigns;
    return campaigns.filter(
      (c) => c.name.toLowerCase().includes(q) || c.keywords.some((k) => k.toLowerCase().includes(q)),
    );
  }, [campaigns, search]);

  const selected = campaigns?.find((c) => c.id === selectedId) ?? null;

  async function handleCreateJourney(name: string, keywords: string[]) {
    if (!tenantId) return;
    const created = await api.createCampaign(tenantId, name, keywords);
    await reload(created.id);
    setShowNewJourney(false);
    push("Journey created");
  }

  async function handlePublish() {
    if (!tenantId || !selected) return;
    setPublishing(true);
    try {
      await api.setCampaignEnabled(tenantId, selected.id, true);
      await reload(selected.id);
      push(`${selected.name} published successfully`);
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't publish this journey", "error");
    } finally {
      setPublishing(false);
    }
  }

  async function handleToggleEnabled(campaign: Campaign) {
    if (!tenantId) return;
    try {
      await api.setCampaignEnabled(tenantId, campaign.id, !campaign.enabled);
      await reload(selectedId ?? undefined);
      push(campaign.enabled ? `${campaign.name} disabled` : `${campaign.name} enabled`);
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't update this journey", "error");
    }
  }

  if (!tenantId) return null;

  return (
    <div className="flex flex-col px-4 py-4 md:h-[calc(100vh-56px)] md:overflow-hidden md:px-6 md:py-4">
      <AutomationHeader
        onPreview={() => setShowPreview(true)}
        previewDisabled={!selected}
        onPublish={handlePublish}
        publishing={publishing}
        publishDisabled={!selected}
        onNewJourney={() => setShowNewJourney(true)}
      />

      <div className="hidden md:block">
        <AutomationTabs active={activeTab} onChange={setActiveTab} />
      </div>

      {error && <div className="banner banner-error mt-4">{error}</div>}

      {/* AutomationTabs is desktop-only (see above) — the "journeys" branch is the only one reachable on mobile. */}
      {activeTab !== "journeys" ? (
        <div className="mt-6 hidden flex-1 items-center justify-center rounded-2xl border border-dashed border-line md:flex">
          <p className="muted">
            {AUTOMATION_TAB_LABEL[activeTab]} is coming soon — everything here today lives under Journeys.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-4 md:hidden">
            <MobileJourneySelector
              campaigns={filtered}
              totalCount={campaigns?.length ?? 0}
              selected={selected}
              search={search}
              onSearch={setSearch}
              onSelect={setSelectedId}
              onNewJourney={() => setShowNewJourney(true)}
            />
          </div>

          <div className="mt-4 flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-y-auto md:mt-5 md:flex-row md:overflow-hidden">
            <div className="hidden md:block md:w-[230px] md:shrink-0 md:overflow-y-auto">
              <JourneyList
                campaigns={filtered}
                totalCount={campaigns?.length ?? 0}
                selectedId={selectedId}
                search={search}
                onSearch={setSearch}
                onSelect={setSelectedId}
                onToggleEnabled={handleToggleEnabled}
              />
            </div>

            <div className="min-h-0 min-w-0 flex-1 md:overflow-hidden">
              {selected ? (
                <JourneyBuilder key={selected.id} tenantId={tenantId} campaign={selected} onChanged={() => reload(selected.id)} />
              ) : campaigns === null ? (
                <div className="flex h-full items-center justify-center rounded-2xl border border-line bg-card">
                  <p className="muted">Loading…</p>
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-line bg-card text-center">
                  <h2 className="m-0">No journeys yet</h2>
                  <p className="muted m-0">Create your first AI conversation journey.</p>
                  <button type="button" className="btn-primary" onClick={() => setShowNewJourney(true)}>
                    + New Journey
                  </button>
                </div>
            )}
          </div>
        </div>
        </>
      )}

      {showNewJourney && <NewJourneyDialog onClose={() => setShowNewJourney(false)} onCreate={handleCreateJourney} />}
      {showPreview && selected && tenantId && (
        <PreviewDialog tenantId={tenantId} campaign={selected} onClose={() => setShowPreview(false)} />
      )}

      <ToastStack toasts={toasts} />
    </div>
  );
}

const AUTOMATION_TAB_LABEL: Record<AutomationTab, string> = {
  journeys: "Journeys",
  templates: "Templates",
  keywords: "Keywords",
  quickReplies: "Quick Replies",
  handoffRules: "Handoff Rules",
  settings: "Settings",
};
