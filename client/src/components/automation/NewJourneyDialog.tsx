import { useState } from "react";
import type { TriggerSource } from "../../api";
import { BottomSheet } from "../BottomSheet";

export function NewJourneyDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string, keywords: string[], triggerSource: TriggerSource) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [keywords, setKeywords] = useState("");
  const [triggerSource, setTriggerSource] = useState<TriggerSource>("comment");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsedKeywords = keywords.split(",").map((k) => k.trim()).filter(Boolean);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || parsedKeywords.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await onCreate(name.trim(), parsedKeywords, triggerSource);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create automation");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet title="Create an automation" onClose={onClose} closeDisabled={saving}>
      <form onSubmit={handleSubmit}>
        <div className="mb-5 rounded-xl border border-accent/20 bg-accent/5 p-3.5">
          <p className="m-0 text-sm font-semibold text-ink">What should happen?</p>
          <p className="muted m-0 mt-1 text-xs leading-5">This creates a draft only. You can review and test it before anything goes live.</p>
        </div>
        <label>
          Automation name
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Property enquiry" autoFocus required />
        </label>
        <label>
          Where should it start?
          <select
            value={triggerSource}
            onChange={(event) => setTriggerSource(event.target.value as TriggerSource)}
          >
            <option value="comment">When someone comments on a post or Reel</option>
            <option value="message">When someone sends a direct message</option>
            <option value="both">When someone comments or sends a direct message</option>
          </select>
        </label>
        <label>
          Words or phrases that should start it
          <textarea
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            rows={2}
            placeholder="price, details, brochure, site visit"
            aria-describedby="automation-keywords-help"
            required
          />
          <span id="automation-keywords-help" className="muted mt-1 block text-xs">
            Separate multiple phrases with commas. You can change these later.
          </span>
          {keywords.trim().length > 0 && parsedKeywords.length === 0 && (
            <span className="mt-1 block text-xs text-danger-ink" role="status">
              Enter at least one word or phrase, not just commas.
            </span>
          )}
        </label>
        {error && <div className="banner banner-error" role="alert">{error}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={!name.trim() || parsedKeywords.length === 0 || saving}>
            {saving ? "Creating…" : "Create draft"}
          </button>
        </div>
      </form>
    </BottomSheet>
  );
}
