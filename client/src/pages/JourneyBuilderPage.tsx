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
      const current = await api.getCampaign(tenantId, campaignId);
      setCampaign(current);
    } catch (err) {
      setCampaign(null);
      setError(err instanceof ApiError ? err.message : "Failed to load journey");
    } finally {
      setLoading(false);
    }
  }, [tenantId, campaignId]);

  useEffect(() => {
    void loadCampaign();
  }, [loadCampaign]);

  if (!tenantId || !campaignId) return null;

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-56px)] items-center justify-center px-4">
        <span className="text-sm text-subtle">Loading journey…</span>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="flex min-h-[calc(100vh-56px)] flex-col items-center justify-center gap-3 px-4 text-center">
        <h1 className="m-0 text-lg font-semibold text-ink">Journey not found</h1>
        <p className="muted m-0">{error ?? "This journey is no longer available."}</p>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => navigate(`/dashboard/${tenantId}/automation`)}
        >
          Back to Journeys
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-56px)] flex-col px-3 py-3 md:px-4 md:py-3">
      <JourneyBuilder
        tenantId={tenantId}
        campaign={campaign}
        onChanged={loadCampaign}
        onBack={() => navigate(`/dashboard/${tenantId}/automation`)}
      />
    </div>
  );
}
