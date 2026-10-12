import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, api } from "../api";
import { AutomationHeader } from "../components/automation/AutomationHeader";
import { AutomationTabs, type AutomationTab } from "../components/automation/AutomationTabs";
import { AutomationTemplates, type AutomationTemplate } from "../components/automation/AutomationTemplates";
import { JourneyTablePaginated } from "../components/automation/JourneyTablePaginated";
import { NewJourneyDialog } from "../components/automation/NewJourneyDialog";
import { ToastStack, useToasts } from "../components/Toast";

export function AutomationPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<AutomationTab>("journeys");
  const [error, setError] = useState<string | null>(null);
  const [showNewJourney, setShowNewJourney] = useState(false);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [templateDraftIds, setTemplateDraftIds] = useState<Record<string, string>>({});
  const { toasts, push } = useToasts();

  async function handleCreateJourney(name: string, keywords: string[]) {
    if (!tenantId) return;
    const created = await api.createCampaign(tenantId, name, keywords, { enabled: false });
    setShowNewJourney(false);
    push("Draft created. Review it before publishing.");
    navigate(`/dashboard/${tenantId}/automation/journeys/${created.id}`);
  }

  async function handleUseTemplate(template: AutomationTemplate) {
    if (!tenantId || creatingTemplate) return;
    setCreatingTemplate(true);
    setError(null);
    let campaignId = templateDraftIds[template.id];
    try {
      if (!campaignId) {
        const created = await api.createCampaign(tenantId, template.name, template.keywords, { enabled: false });
        campaignId = created.id;
        setTemplateDraftIds((current) => ({ ...current, [template.id]: campaignId! }));
      }
      const { milestones: presetMilestones, ...replyConfig } = template.preset;
      await api.updateReplyConfig(tenantId, campaignId, { ...replyConfig, keywords: template.keywords });
      if (presetMilestones) await api.setMilestones(tenantId, campaignId, presetMilestones);
      setTemplateDraftIds((current) => {
        const next = { ...current };
        delete next[template.id];
        return next;
      });
      push(`${template.name} draft created. Review it before publishing.`);
      navigate(`/dashboard/${tenantId}/automation/journeys/${campaignId}`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to create automation draft";
      setError(message);
      throw new Error(message);
    } finally {
      setCreatingTemplate(false);
    }
  }

  if (!tenantId) return null;

  return (
    <div className="flex flex-col px-4 py-3.5 md:min-h-[calc(100vh-56px)] md:px-6 md:py-3.5">
      <AutomationHeader />
      <AutomationTabs active={activeTab} onChange={setActiveTab} />
      {error && <div className="banner banner-error mt-4" role="alert">{error}</div>}
      {activeTab === "templates" ? (
        <AutomationTemplates onUse={handleUseTemplate} />
      ) : (
        <div id="automation-tabpanel" role="tabpanel" aria-labelledby="automation-tab-journeys" tabIndex={0} className="min-w-0 flex-1">
          <div className="mt-5 rounded-2xl border border-accent/15 bg-gradient-to-r from-accent/5 via-card to-card p-4 md:p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <p className="m-0 text-[15px] font-semibold text-ink">Start with the outcome you want</p>
                <p className="muted m-0 mt-1 max-w-2xl text-xs leading-5">Pick a ready-made automation and customize only the parts that matter. Your changes stay in draft until you explicitly publish.</p>
              </div>
              <button type="button" className="btn-primary shrink-0" onClick={() => setActiveTab("templates")}>Choose a template</button>
            </div>
          </div>
          <JourneyTablePaginated tenantId={tenantId} onSelect={(campaignId) => navigate(`/dashboard/${tenantId}/automation/journeys/${campaignId}`)} onNewJourney={() => setShowNewJourney(true)} />
        </div>
      )}
      {showNewJourney && <NewJourneyDialog onClose={() => setShowNewJourney(false)} onCreate={handleCreateJourney} />}
      <ToastStack toasts={toasts} />
    </div>
  );
}
