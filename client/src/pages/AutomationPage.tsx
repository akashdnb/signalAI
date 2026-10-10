import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, api } from "../api";
import { AutomationHeader } from "../components/automation/AutomationHeader";
import { AutomationTabs, type AutomationTab } from "../components/automation/AutomationTabs";
import { AutomationTemplates, type AutomationTemplate } from "../components/automation/AutomationTemplates";
import { JourneyTablePaginated } from "../components/automation/JourneyTablePaginated";
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
  const [activeTab, setActiveTab] = useState<AutomationTab>("journeys");
  const [error, setError] = useState<string | null>(null);
  const [showNewJourney, setShowNewJourney] = useState(false);
  const [journeyRefreshToken, setJourneyRefreshToken] = useState(0);
  const { toasts, push } = useToasts();

  async function handleCreateJourney(name: string, keywords: string[]) {
    if (!tenantId) return;
    const created = await api.createCampaign(tenantId, name, keywords);
    setShowNewJourney(false);
    push("Journey created");
    navigate(`/dashboard/${tenantId}/automation/journeys/${created.id}`);
  }

  async function handleUseTemplate(template: AutomationTemplate) {
    if (!tenantId) return;
    try {
      const created = await api.createCampaign(tenantId, template.name, template.keywords);
      const { milestones: presetMilestones, ...replyConfig } = template.preset;
      await api.updateReplyConfig(tenantId, created.id, { ...replyConfig, keywords: template.keywords });
      if (presetMilestones) await api.setMilestones(tenantId, created.id, presetMilestones);
      push(`${template.name} preset created`);
      navigate(`/dashboard/${tenantId}/automation/journeys/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create journey from preset");
    }
  }

  if (!tenantId) return null;

  return (
    <div className="flex flex-col px-4 py-3.5 md:min-h-[calc(100vh-56px)] md:px-6 md:py-3.5">
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
          <JourneyTablePaginated
            tenantId={tenantId}
            refreshToken={journeyRefreshToken}
            onSelect={(campaignId) => navigate(`/dashboard/${tenantId}/automation/journeys/${campaignId}`)}
            onNewJourney={() => setShowNewJourney(true)}
          />
        </div>
      )}

      {showNewJourney && <NewJourneyDialog onClose={() => setShowNewJourney(false)} onCreate={handleCreateJourney} />}
      <ToastStack toasts={toasts} />
    </div>
  );
}
