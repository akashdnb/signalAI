import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, api, type Campaign } from "../api";
import { JourneyBuilder } from "../components/automation/JourneyBuilder";

export function JourneyBuilderPage() {
  const { tenantId, campaignId } = useParams<{ tenantId: string; campaignId: string }>();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCampaign = useCallback(async () => {
    if (!tenantId || !campaignId) return;
    setLoading(true);
    setError(null);
    try {
      setCampaign(await api.getCampaign(tenantId, campaignId));
    } catch (err) {
      setCampaign(null);
      setError(err instanceof ApiError ? err.message : "Failed to load journey");
    } finally {
      setLoading(false);
    }
  }, [tenantId, campaignId]);

  const refreshCampaign = useCallback(async () => {
    if (!tenantId || !campaignId) return;
    try {
      setCampaign(await api.getCampaign(tenantId, campaignId));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to refresh journey");
    }
  }, [tenantId, campaignId]);

  useEffect(() => { void loadCampaign(); }, [loadCampaign]);

  if (!tenantId || !campaignId) return null;

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-56px)] items-center justify-center px-4" role="status">
        <div className="w-full max-w-md rounded-2xl border border-line bg-card p-5">
          <div className="h-5 w-40 animate-pulse rounded bg-chip" />
          <div className="mt-3 h-10 w-64 animate-pulse rounded bg-chip" />
          <div className="mt-5 h-52 animate-pulse rounded-xl bg-chip" />
          <span className="sr-only">Loading journey…</span>
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="flex min-h-[calc(100vh-56px)] flex-col items-center justify-center gap-3 px-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-err text-err-ink" aria-hidden="true">!</div>
        <h1 className="m-0 text-lg font-semibold text-ink">We couldn't open this journey</h1>
        <p className="muted m-0 max-w-md">{error ?? "This journey is no longer available."} Check the Journeys list and try again.</p>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={() => void loadCampaign()}>Try again</button>
          <button type="button" className="btn-primary" onClick={() => navigate(`/dashboard/${tenantId}/automation`)}>Back to Journeys</button>
        </div>
      </div>
    );
  }

  return (
    <div className="journey-builder-page flex min-h-[calc(100vh-56px)] flex-col px-3 py-3 md:px-4 md:py-3">
      <JourneyBuilder tenantId={tenantId} campaign={campaign} onChanged={refreshCampaign} onBack={() => navigate(`/dashboard/${tenantId}/automation`)} />
    </div>
  );
}
