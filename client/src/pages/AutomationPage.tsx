import { useEffect, useState } from "react";
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

export function AutomationPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();

  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function handleCreateJourney(name: string, keywords: string[]) {
    if (!tenantId) return;

    const created = await api.createCampaign(tenantId, name, keywords);
    setShowNewJourney(false);
    push("Journey created");
    navigate(`/dashboard/${tenantId}/automation/journeys/${created.id}`);
  }

  if (!tenantId) return null;

  return (
    <div className="flex flex-col px-4 py-3.5 md:min-h-[calc(100vh-56px)] md:px-6 md:py-3.5">
      <AutomationHeader />

      <div className="hidden md:block">
        <AutomationTabs active={activeTab} onChange={setActiveTab} />
      </div>

      {error && <div className="banner banner-error mt-4">{error}</div>}

      {activeTab !== "journeys" ? (
        <div className="mt-6 flex min-h-[520px] flex-1 items-center justify-center rounded-2xl border border-dashed border-line">
          <p className="muted text-sm">{AUTOMATION_TAB_LABEL[activeTab]} is coming soon.</p>
        </div>
      ) : (
        <JourneyTable
          campaigns={campaigns}
          onSelect={(campaignId) =>
            navigate(`/dashboard/${tenantId}/automation/journeys/${campaignId}`)
          }
          onNewJourney={() => setShowNewJourney(true)}
          onChanged={loadJourneys}
        />
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
