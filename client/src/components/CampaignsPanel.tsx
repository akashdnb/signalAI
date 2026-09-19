import { useEffect, useState } from "react";
import { api, type Campaign } from "../api";
import { CampaignEditor } from "./CampaignEditor";

export function CampaignsPanel({ tenantId }: { tenantId: string }) {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newKeywords, setNewKeywords] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    try {
      const list = await api.listCampaigns(tenantId);
      setCampaigns(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load campaigns");
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const keywords = newKeywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    if (!newName.trim() || keywords.length === 0) return;

    try {
      const created = await api.createCampaign(tenantId, newName.trim(), keywords);
      setNewName("");
      setNewKeywords("");
      await reload();
      setSelectedId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create campaign");
    }
  }

  async function handleToggleEnabled(campaign: Campaign) {
    try {
      await api.setCampaignEnabled(tenantId, campaign.id, !campaign.enabled);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update campaign");
    }
  }

  const selected = campaigns?.find((c) => c.id === selectedId) ?? null;

  return (
    <section className="card">
      <h2>Campaigns</h2>
      {error && <div className="banner banner-error">{error}</div>}

      <form onSubmit={handleCreate} className="inline-form">
        <input
          type="text"
          placeholder="Campaign name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <input
          type="text"
          placeholder="Keywords (comma-separated, e.g. LINK, price)"
          value={newKeywords}
          onChange={(e) => setNewKeywords(e.target.value)}
        />
        <button type="submit" className="btn-primary" disabled={!newName.trim() || !newKeywords.trim()}>
          Add campaign
        </button>
      </form>

      {campaigns === null ? (
        <p className="muted">Loading…</p>
      ) : campaigns.length === 0 ? (
        <p className="muted">No campaigns yet — add one above to start auto-replying to comments.</p>
      ) : (
        <ul className="list">
          {campaigns.map((c) => (
            <li key={c.id} className="list-item">
              <button className="list-item-button" onClick={() => setSelectedId(selectedId === c.id ? null : c.id)}>
                <strong>{c.name}</strong>
                <span className="muted"> — {c.keywords.join(", ")}</span>
                <span className={c.enabled ? "pill pill-ok" : "pill"}>{c.enabled ? "enabled" : "disabled"}</span>
              </button>
              <button className="btn-secondary btn-small" onClick={() => handleToggleEnabled(c)}>
                {c.enabled ? "Disable" : "Enable"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <CampaignEditor
          tenantId={tenantId}
          campaign={selected}
          onChanged={reload}
        />
      )}
    </section>
  );
}
