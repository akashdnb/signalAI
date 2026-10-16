import { useEffect, useState } from "react";
import { api } from "../api";

type GuardrailSection = "ai-behavior" | "forbidden-topics" | "escalation";

function useGuardrailsConfig(tenantId: string) {
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

  async function save() {
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

  return {
    loaded,
    brandVoice,
    setBrandVoice,
    forbiddenTopics,
    setForbiddenTopics,
    escalationTriggers,
    setEscalationTriggers,
    saving,
    error,
    save,
  };
}

/** A single textarea editing a comma-separated string list, matching the preview's "Topic list"/"Escalation triggers" fields (plain text, not a repeatable add/remove list). */
function CommaListEditor({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const [text, setText] = useState(() => value.join(", "));
  useEffect(() => setText(value.join(", ")), [value]);
  return (
    <textarea
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(
          e.target.value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        );
      }}
      rows={4}
    />
  );
}

/**
 * Phase 2C Client Guardrails: brand voice, forbidden topics, and escalation
 * triggers, configured per tenant and layered on top of Phase 1's Global
 * Guardrails — see server/src/lib/guardrails.ts for why this can only
 * NARROW the platform-owned checks, never override or disable them.
 *
 * Split across three Settings sub-nav pages (`section`) to match the
 * preview's literal IA. All three still share one tenant-wide config and
 * one real save endpoint — each page's Save button submits the full current
 * config, it just only shows and edits one field per page.
 */
export function GuardrailsConfigPanel({ tenantId, section }: { tenantId: string; section: GuardrailSection }) {
  const g = useGuardrailsConfig(tenantId);

  if (!g.loaded) {
    return <section className="card">{g.error ? <div className="banner banner-error">{g.error}</div> : <p className="muted">Loading…</p>}</section>;
  }

  if (section === "ai-behavior") {
    return (
      <section className="card">
        <h2>AI behavior</h2>
        <p className="muted small">How the assistant responds when context is incomplete or uncertain.</p>
        {g.error && <div className="banner banner-error">{g.error}</div>}
        <label className="mt-3 block">
          <span className="mb-1 block text-sm font-medium text-ink">Instructions</span>
          <textarea
            value={g.brandVoice}
            onChange={(e) => g.setBrandVoice(e.target.value)}
            rows={5}
            placeholder="e.g. Friendly and casual, never corporate-sounding."
          />
        </label>
        <p className="muted small mt-2">Never invent facts, prices, availability, or guarantees.</p>
        <button type="button" className="btn-primary btn-small mt-3" onClick={g.save} disabled={g.saving}>
          {g.saving ? "Saving…" : "Save AI behavior"}
        </button>
      </section>
    );
  }

  if (section === "forbidden-topics") {
    return (
      <section className="card">
        <h2>Forbidden topics</h2>
        <p className="muted small">Topics where the assistant should refuse, defer, or escalate.</p>
        {g.error && <div className="banner banner-error">{g.error}</div>}
        <label className="mt-3 block">
          <span className="mb-1 block text-sm font-medium text-ink">Topic list</span>
          <CommaListEditor value={g.forbiddenTopics} onChange={g.setForbiddenTopics} />
        </label>
        <button type="button" className="btn-primary btn-small mt-3" onClick={g.save} disabled={g.saving}>
          {g.saving ? "Saving…" : "Save forbidden topics"}
        </button>
      </section>
    );
  }

  return (
    <section className="card">
      <h2>Escalation rules</h2>
      <p className="muted small">Situations that require human attention.</p>
      {g.error && <div className="banner banner-error">{g.error}</div>}
      <label className="mt-3 block">
        <span className="mb-1 block text-sm font-medium text-ink">Escalation triggers</span>
        <CommaListEditor value={g.escalationTriggers} onChange={g.setEscalationTriggers} />
      </label>
      <div className="mt-3 rounded-lg border border-warn-line bg-warn px-4 py-3 text-sm text-warn-ink">
        <strong>Ownership matters.</strong> A human handoff should assign a teammate or appear in an unassigned work queue.
      </div>
      <button type="button" className="btn-primary btn-small mt-3" onClick={g.save} disabled={g.saving}>
        {g.saving ? "Saving…" : "Save escalation rules"}
      </button>
    </section>
  );
}
