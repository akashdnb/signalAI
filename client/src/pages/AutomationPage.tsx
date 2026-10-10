import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, api, type Campaign } from "../api";
import { ActivationGuide } from "../components/automation/ActivationGuide";
import { AutomationHeader } from "../components/automation/AutomationHeader";
import { AutomationTabs, type AutomationTab } from "../components/automation/AutomationTabs";
import { AutomationTemplates, type AutomationTemplate } from "../components/automation/AutomationTemplates";
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
    push("Journey created — customize it before publishing");
    navigate(`/dashboard/${tenantId}/automation/journeys/${created.id}`);
  }

  async function handleUseTemplate(template: AutomationTemplate) {
    if (!tenantId) return;
    try {
      const created = await api.createCampaign(tenantId, template.name, template.keywords);
      const { milestones: presetMilestones, ...replyConfig } = template.preset;
      await api.updateReplyConfig(tenantId, created.id, { ...replyConfig, keywords: template.keywords });
      if (presetMilestones) await api.setMilestones(tenantId, created.id, presetMilestones);
      push(`${template.name} preset created — customize it before publishing`);
      navigate(`/dashboard/${tenantId}/automation/journeys/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create journey from preset");
      push(err instanceof ApiError ? err.message : "Failed to create journey from preset", "error");
    }
  }

  if (!tenantId) return null;

  const firstRun = activeTab === "journeys" && campaigns !== null && campaigns.length === 0;

  return (
    <div className="page-automation flex flex-col px-4 py-3.5 md:min-h-[calc(100vh-56px)] md:px-6 md:py-4">
      <AutomationHeader />
      <AutomationTabs active={activeTab} onChange={setActiveTab} />
      {error && <div className="banner banner-error mt-4" role="alert">{error}</div>}

      {activeTab === "templates" ? (
        <AutomationTemplates onUse={(template) => void handleUseTemplate(template)} />
      ) : activeTab !== "journeys" ? (
        <div id="automation-tabpanel" role="tabpanel" aria-labelledby={`automation-tab-${activeTab}`} tabIndex={0} className="mt-6 flex min-h-[300px] flex-1 items-center justify-center rounded-2xl border border-dashed border-line px-5 md:min-h-[520px]">
          <div className="max-w-md text-center">
            <p className="m-0 text-sm font-semibold text-ink">{AUTOMATION_TAB_LABEL[activeTab]} is not available yet</p>
            <p className="muted mb-0 mt-1 text-sm">This section is still in development. Journeys are available now.</p>
          </div>
        </div>
      ) : (
        <div id="automation-tabpanel" role="tabpanel" aria-labelledby="automation-tab-journeys" tabIndex={0} className="min-w-0 flex-1">
          {firstRun && <ActivationGuide onTemplates={() => setActiveTab("templates")} />}
          {campaigns === null ? (
            <div className="mt-5 rounded-2xl border border-line bg-card p-5" aria-label="Loading journeys" role="status">
              <div className="h-5 w-32 animate-pulse rounded bg-chip" />
              <div className="mt-4 h-11 w-full animate-pulse rounded-xl bg-chip" />
              <div className="mt-3 h-16 w-full animate-pulse rounded-xl bg-chip" />
              <span className="sr-only">Loading journeys…</span>
            </div>
          ) : (
            <JourneyTable campaigns={campaigns} onSelect={(campaignId) => navigate(`/dashboard/${tenantId}/automation/journeys/${campaignId}`)} onNewJourney={() => setShowNewJourney(true)} onChanged={loadJourneys} />
          )}
        </div>
      )}

      {showNewJourney && <NewJourneyDialog onClose={() => setShowNewJourney(false)} onCreate={handleCreateJourney} />}
      <ToastStack toasts={toasts} />
    </div>
  );
}
