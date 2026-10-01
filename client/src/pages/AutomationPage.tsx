import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, api, type Campaign } from "../api";
import { AutomationHeader } from "../components/automation/AutomationHeader";
import { AutomationTabs, type AutomationTab } from "../components/automation/AutomationTabs";
import { JourneyTable } from "../components/automation/JourneyTable";
import { NewJourneyDialog } from "../components/automation/NewJourneyDialog";
import { ToastStack, useToasts } from "../components/Toast";

const AUTOMATION_TAB_LABEL: Record<AutomationTab, string> = {
  journeys: "Journeys",
  templates: "Templates",
  keywords: "Keywords",
  quickReplies: "Quick Replies",
  handoffRules: "Handoff Rules",
  settings: "Settings",
};

/**
 * Automation landing page = journey library/workspace.
 * The builder lives on its own route so the list does not stay mounted
 * beside the canvas and builder interactions cannot accidentally refresh it.
 */
export function AutomationPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();

  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<AutomationTab>("journeys");
  const [error, setError] = useState<string | null>(null);
  const [showNewJourney, setShowNewJourney] = useState(false);
  const { toasts, push } = useToasts();

  async function loadJourneys() {
    if (!tenantId) return;

    try {
      const list = await api.listCampaigns(tenantId);
      setCampaigns(list);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load journeys");
    }
  }

  useEffect(() => {
    void loadJourneys();
    // tenantId is the route boundary for this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const filtered = useMemo(() => {
    if (!campaigns) return null;

    const q = search.trim().toLowerCase();
    if (!q) return campaigns;

    return campaigns.filter(
      (campaign) =>
        campaign.name.toLowerCase().includes(q) ||
        campaign.keywords.some((keyword) => keyword.toLowerCase().includes(q)),
    );
  }, [campaigns, search]);

  async function handleCreateJourney(name: string, keywords: string[]) {
    if (!tenantId) return;

    const created = await api.createCampaign(tenantId, name, keywords);
    setShowNewJourney(false);
    push("Journey created");
    navigate(`/dashboard/${tenantId}/automation/journeys/${created.id}`);
  }

  if (!tenantId) return null;

  return (
    <div className="flex flex-col px-4 py-4 md:min-h-[calc(100vh-56px)] md:px-6 md:py-4">
      <AutomationHeader onNewJourney={() => setShowNewJourney(true)} />

      <div className="hidden md:block">
        <AutomationTabs active={activeTab} onChange={setActiveTab} />
      </div>

      {error && <div className="banner banner-error mt-4">{error}</div>}

      {activeTab !== "journeys" ? (
        <div className="mt-6 hidden min-h-[520px] flex-1 items-center justify-center rounded-2xl border border-dashed border-line md:flex">
          <p className="muted">
            {AUTOMATION_TAB_LABEL[activeTab]} is coming soon — everything here today lives under Journeys.
          </p>
        </div>
      ) : (
        <div className="mt-4 min-h-0 flex-1 md:mt-5">
          <JourneyTable
            campaigns={filtered}
            totalCount={campaigns?.length ?? 0}
            search={search}
            onSearch={setSearch}
            onSelect={(campaignId) =>
              navigate(`/dashboard/${tenantId}/automation/journeys/${campaignId}`)
            }
            onNewJourney={() => setShowNewJourney(true)}
          />
        </div>
      )}

      {showNewJourney && (
        <NewJourneyDialog
          onClose={() => setShowNewJourney(false)}
          onCreate={handleCreateJourney}
        />
      )}

      <ToastStack toasts={toasts} />
    </div>
  );
}
