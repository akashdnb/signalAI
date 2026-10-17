import { useCallback, useEffect, useSyncExternalStore, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ApiError, api, type Campaign } from "../api";
import {
  getJourneyAccountReadiness,
  subscribeJourneyAccountReadiness,
  type JourneyAccountReadiness,
} from "../components/JourneyAccountsPanel";
import { JourneyBuilder } from "../components/automation/JourneyBuilder";
import "../styles/journey-builder-parity.css";

export function JourneyBuilderPage() {
  const { tenantId, campaignId } = useParams<{ tenantId: string; campaignId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const startOnSetup = searchParams.get("tab") === "setup";

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const readinessTenantId = tenantId ?? "";
  const readinessCampaignId = campaignId ?? "";
  const subscribeReadiness = useCallback(
    (listener: () => void) => subscribeJourneyAccountReadiness(readinessTenantId, readinessCampaignId, listener),
    [readinessTenantId, readinessCampaignId],
  );
  const getReadiness = useCallback(
    () => getJourneyAccountReadiness(readinessTenantId, readinessCampaignId),
    [readinessTenantId, readinessCampaignId],
  );
  const accountReadiness: JourneyAccountReadiness = useSyncExternalStore(
    subscribeReadiness,
    getReadiness,
    getReadiness,
  );

  const loadCampaign = useCallback(async () => {
    if (!tenantId || !campaignId) return;

    setLoading(true);
    setError(null);

    try {
      const current = await api.getCampaign(tenantId, campaignId);
      setCampaign(current);
    } catch (err) {
      setCampaign(null);
      setError(err instanceof ApiError ? err.message : "Failed to load automation");
    } finally {
      setLoading(false);
    }
  }, [tenantId, campaignId]);

  const refreshCampaign = useCallback(async () => {
    if (!tenantId || !campaignId) return;

    try {
      const current = await api.getCampaign(tenantId, campaignId);
      setCampaign(current);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to refresh automation");
    }
  }, [tenantId, campaignId]);

  useEffect(() => {
    void loadCampaign();
  }, [loadCampaign]);

  if (!tenantId || !campaignId) return null;

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-56px)] items-center justify-center px-4">
        <span className="text-sm text-subtle">Loading automation…</span>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="flex min-h-[calc(100vh-56px)] flex-col items-center justify-center gap-3 px-4 text-center">
        <h1 className="m-0 text-lg font-semibold text-ink">Automation not found</h1>
        <p className="muted m-0">{error ?? "This automation is no longer available."}</p>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => navigate(`/dashboard/${tenantId}/automation`)}
        >
          Back to automations
        </button>
      </div>
    );
  }

  return (
    <div className="page-journey-builder flex min-h-[calc(100vh-56px)] flex-col px-3 py-3 md:px-4 md:py-3">
      <JourneyBuilder
        tenantId={tenantId}
        campaign={campaign}
        accountReadiness={accountReadiness}
        startOnSetup={startOnSetup}
        onChanged={refreshCampaign}
        onBack={() => navigate(`/dashboard/${tenantId}/automation`)}
      />
    </div>
  );
}
