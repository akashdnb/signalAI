import { useEffect, useState } from "react";
import { api, type FieldDefinition, type FieldDefinitionValueType } from "../api";

const VALUE_TYPES: { value: FieldDefinitionValueType; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "country", label: "Country" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "text", label: "Text" },
];

/**
 * Tenant-level registry of reusable typed fields (key/label/value type),
 * shared across campaigns' milestones instead of freeform ad-hoc text every
 * time. See CampaignEditor.tsx's milestone editor for where these get
 * consumed (and where new ones can also be registered on the fly).
 */
export function FieldDefinitionsPanel({ tenantId }: { tenantId: string }) {
  const [definitions, setDefinitions] = useState<FieldDefinition[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<FieldDefinitionValueType>("text");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .listFieldDefinitions(tenantId)
      .then((defs) => {
        if (!cancelled) setDefinitions(defs);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load field definitions");
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newKey.trim() || !newLabel.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const created = await api.createFieldDefinition(tenantId, {
        fieldKey: newKey.trim(),
        label: newLabel.trim(),
        valueType: newType,
      });
      setDefinitions((prev) => [...(prev ?? []), created]);
      setNewKey("");
      setNewLabel("");
      setNewType("text");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create field");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await api.deleteFieldDefinition(tenantId, id);
      setDefinitions((prev) => (prev ?? []).filter((d) => d.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete field");
    }
  }

  return (
    <section className="card">
      <h2>Field Definitions</h2>
      <p className="muted small">
        Reusable typed fields (e.g. email, phone) that milestones across your campaigns can capture, instead of
        freeform text every time.
      </p>
      {error && <div className="banner banner-error">{error}</div>}
      {definitions === null ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          {definitions.length === 0 ? (
            <p className="muted">No field definitions yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Label</th>
                  <th>Type</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {definitions.map((d) => (
                  <tr key={d.id}>
                    <td>{d.fieldKey}</td>
                    <td>{d.label}</td>
                    <td>{VALUE_TYPES.find((t) => t.value === d.valueType)?.label ?? d.valueType}</td>
                    <td>
                      <button type="button" className="btn-secondary btn-small" onClick={() => handleDelete(d.id)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <form onSubmit={handleCreate} className="inline-form" style={{ marginTop: "1rem" }}>
            <input
              type="text"
              placeholder="Key, e.g. email"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
            />
            <input
              type="text"
              placeholder="Label, e.g. Email address"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
            <select value={newType} onChange={(e) => setNewType(e.target.value as FieldDefinitionValueType)}>
              {VALUE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <button type="submit" className="btn-primary btn-small" disabled={!newKey.trim() || !newLabel.trim() || creating}>
              {creating ? "Adding…" : "Add field"}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
