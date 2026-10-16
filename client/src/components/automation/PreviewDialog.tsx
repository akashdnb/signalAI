import { useState } from "react";
import { api, type Campaign, type PreviewResult } from "../../api";
import { BottomSheet } from "../BottomSheet";

export function PreviewDialog({
  tenantId,
  campaign,
  hasUnsavedChanges = false,
  savedVersion,
  onClose,
}: {
  tenantId: string;
  campaign: Campaign;
  hasUnsavedChanges?: boolean;
  savedVersion: number | null;
  onClose: () => void;
}) {
  const [sampleText, setSampleText] = useState("");
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function runPreview(e: React.FormEvent) {
    e.preventDefault();
    if (!sampleText.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api.preview(tenantId, campaign.id, sampleText.trim());
      setResult(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate preview");
    } finally {
      setLoading(false);
    }
  }

  return (
    <BottomSheet title="Preview conversation" onClose={onClose} maxWidth={520}>
      <p className="muted small mt-0">
        Preview uses saved reply settings for <strong className="text-ink">{campaign.name}</strong>
        {savedVersion === null ? "." : ` (builder v${savedVersion}).`} It doesn't save, publish, or send an Instagram message.
      </p>
      {hasUnsavedChanges && (
        <div className="banner banner-error mb-3" role="status">
          You have unsaved changes. This preview does not include them; save the journey before checking the latest draft.
        </div>
      )}

      <div className="mb-3 rounded-xl bg-chip p-3">
        <div className="text-xs font-medium text-subtle">User</div>
        <div className="mt-1 text-sm text-ink">{sampleText.trim() || "How much is a 3 BHK?"}</div>
      </div>

      <form onSubmit={runPreview} className="inline-form">
        <input
          type="text"
          value={sampleText}
          onChange={(e) => setSampleText(e.target.value)}
          placeholder="Type a sample comment or DM…"
        />
        <button type="submit" className="btn-primary" disabled={loading || !sampleText.trim()}>
          {loading ? "Generating…" : "Send"}
        </button>
      </form>

      {error && <div className="banner banner-error">{error}</div>}

      {result && (
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-line p-3">
            <div className="text-xs font-semibold text-subtle">SignalAI (rule-based)</div>
            <p className="m-0 mt-1 text-sm text-ink">{result.ruleBased.text}</p>
          </div>
          <div className="rounded-xl border border-accent-soft bg-chip p-3">
            <div className="text-xs font-semibold text-accent">SignalAI (AI-generated)</div>
            <p className="m-0 mt-1 text-sm text-ink">{result.aiGenerated.text}</p>
            {result.aiGenerated.fellBackReason && (
              <p className="muted small mt-1">Fell back to rule-based: {result.aiGenerated.fellBackReason}</p>
            )}
            {result.aiGenerated.requiresHumanHandoff && (
              <div className="banner banner-error mt-2">This would hand the conversation off to a human.</div>
            )}
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
