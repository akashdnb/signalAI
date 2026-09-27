import { useEffect, useState } from "react";
import { api } from "../api";

/**
 * Phase 2C Client Guardrails: brand voice, forbidden topics, and
 * escalation triggers, configured per tenant and layered on top of Phase
 * 1's Global Guardrails — see server/src/lib/guardrails.ts for why this
 * can only NARROW the platform-owned checks, never override or disable
 * them. This panel is a plain settings form; the narrowing-only guarantee
 * lives entirely server-side.
 */
export function GuardrailsConfigPanel({ tenantId }: { tenantId: string }) {
  const [loaded, setLoaded] = useState(false);
  const [brandVoice, setBrandVoice] = useState("");
  const [forbiddenTopics, setForbiddenTopics] = useState<string[]>([]);
  const [escalationTriggers, setEscalationTriggers] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getGuardrailsConfig(tenantId)
      .then((config) => {
        if (cancelled) return;
        setBrandVoice(config.brandVoice ?? "");
        setForbiddenTopics(config.forbiddenTopics);
        setEscalationTriggers(config.escalationTriggers);
        setLoaded(true);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load guardrails config");
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const config = await api.updateGuardrailsConfig(tenantId, {
        brandVoice: brandVoice.trim() ? brandVoice : null,
        forbiddenTopics: forbiddenTopics.filter((t) => t.trim()),
        escalationTriggers: escalationTriggers.filter((t) => t.trim()),
      });
      setBrandVoice(config.brandVoice ?? "");
      setForbiddenTopics(config.forbiddenTopics);
      setEscalationTriggers(config.escalationTriggers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save guardrails config");
    } finally {
      setSaving(false);
    }
  }

  function renderStringListEditor(
    label: string,
    hint: string,
    items: string[],
    setItems: (items: string[]) => void,
  ) {
    return (
      <>
        <h4>{label}</h4>
        <p className="muted small">{hint}</p>
        {items.map((item, i) => (
          <div key={i} className="milestone-row">
            <input
              type="text"
              value={item}
              onChange={(e) => {
                const next = [...items];
                next[i] = e.target.value;
                setItems(next);
              }}
            />
            <button
              type="button"
              className="btn-secondary btn-small"
              onClick={() => setItems(items.filter((_, idx) => idx !== i))}
            >
              Remove
            </button>
          </div>
        ))}
        <button type="button" className="btn-secondary btn-small" onClick={() => setItems([...items, ""])}>
          Add
        </button>
      </>
    );
  }

  return (
    <section className="card">
      <h2>Client Guardrails</h2>
      <p className="muted small">
        These narrow the platform's own safety checks for this tenant only — they can make replies more restrictive,
        never less.
      </p>
      {error && <div className="banner banner-error">{error}</div>}
      {!loaded ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <label>
            Brand voice
            <textarea
              value={brandVoice}
              onChange={(e) => setBrandVoice(e.target.value)}
              rows={3}
              placeholder="e.g. Friendly and casual, never corporate-sounding."
            />
          </label>

          {renderStringListEditor(
            "Forbidden topics",
            "A reply mentioning any of these is rejected and the fail-closed reply is used instead.",
            forbiddenTopics,
            setForbiddenTopics,
          )}

          {renderStringListEditor(
            "Escalation triggers",
            "A customer message containing any of these hands the conversation to a human immediately.",
            escalationTriggers,
            setEscalationTriggers,
          )}

          <button className="btn-primary btn-small" onClick={handleSave} disabled={saving} style={{ marginTop: "1rem" }}>
            {saving ? "Saving…" : "Save"}
          </button>
        </>
      )}
    </section>
  );
}
