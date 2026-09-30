import { useState } from "react";
import { Modal } from "../Modal";

export function NewJourneyDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string, keywords: string[]) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [keywords, setKeywords] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsedKeywords = keywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    if (!name.trim() || parsedKeywords.length === 0) return;

    setSaving(true);
    setError(null);
    try {
      await onCreate(name.trim(), parsedKeywords);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create journey");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New Journey" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <label>
          Journey name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Property Enquiry"
            autoFocus
          />
        </label>
        <label>
          Trigger keywords (comma separated)
          <textarea
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            rows={2}
            placeholder="price, details, brochure, site visit"
          />
        </label>
        {error && <div className="banner banner-error">{error}</div>}
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={!name.trim() || !keywords.trim() || saving}>
            {saving ? "Creating…" : "Create Journey"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
