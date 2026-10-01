import { useEffect, useState } from "react";
import { api, type ScoringRule, type ScoringRuleDefinition, type ScoringRuleField, type ScoringRuleOperator } from "../api";

const FIELDS: { value: ScoringRuleField; label: string }[] = [
  { value: "budget_value", label: "Budget" },
  { value: "intent", label: "Intent" },
  { value: "need", label: "Need" },
  { value: "location", label: "Location" },
];

// Objective A's validation matrix: budget_value is the only field with
// numeric ordering, so it's the only one offered gte/lte — intent/need/
// location only ever support eq/exists. Keeping this list in sync with the
// server's matrix (db/leadScoringRules.ts) is what keeps the form from
// ever submitting a combination the API would reject anyway.
function operatorsFor(field: ScoringRuleField): { value: ScoringRuleOperator; label: string }[] {
  const base: { value: ScoringRuleOperator; label: string }[] = [
    { value: "exists", label: "is captured" },
    { value: "eq", label: "equals" },
  ];
  if (field === "budget_value") {
    return [...base, { value: "gte", label: "is at least" }, { value: "lte", label: "is at most" }];
  }
  return base;
}

function describeRule(rule: ScoringRule): string {
  const d = rule.definition;
  if (d.kind === "milestone_completed") return "Milestone completed";
  const fieldLabel = FIELDS.find((f) => f.value === d.field)?.label ?? d.field;
  const opLabel = operatorsFor(d.field).find((o) => o.value === d.operator)?.label ?? d.operator;
  if (d.operator === "exists") return `${fieldLabel} ${opLabel}`;
  return `${fieldLabel} ${opLabel} ${d.value}`;
}

/**
 * SLICE C / Objective D's custom-scoring-rule UI: a small structured form
 * over the supported rule shapes (field_compare, milestone_completed) —
 * deliberately not a raw-JSON editor (validateScoringRuleDefinition on the
 * server rejects anything outside this same shape anyway, and this product
 * is creator-facing, not developer-facing).
 */
export function ScoringRulesPanel({ tenantId }: { tenantId: string }) {
  const [rules, setRules] = useState<ScoringRule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [field, setField] = useState<ScoringRuleField>("budget_value");
  const [operator, setOperator] = useState<ScoringRuleOperator>("gte");
  const [value, setValue] = useState("");
  const [points, setPoints] = useState("10");

  useEffect(() => {
    let cancelled = false;
    api
      .listScoringRules(tenantId)
      .then((r) => {
        if (!cancelled) setRules(r);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load scoring rules");
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  function handleFieldChange(next: ScoringRuleField) {
    setField(next);
    const allowed = operatorsFor(next).map((o) => o.value);
    if (!allowed.includes(operator)) setOperator(allowed[0]!);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const parsedPoints = Number(points);
    if (!name.trim() || !Number.isInteger(parsedPoints)) return;
    if (operator !== "exists" && !value.trim()) return;

    setSaving(true);
    setError(null);
    try {
      const isNumericField = field === "budget_value";
      const definition: ScoringRuleDefinition =
        operator === "exists"
          ? { kind: "field_compare", field, operator }
          : {
              kind: "field_compare",
              field,
              operator,
              value: isNumericField ? Number(value) : value.trim(),
            };

      const created = await api.createScoringRule(tenantId, { name: name.trim(), definition, points: parsedPoints });
      setRules((prev) => [...(prev ?? []), created]);
      setName("");
      setValue("");
      setPoints("10");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create scoring rule");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(rule: ScoringRule) {
    setError(null);
    try {
      const updated = await api.updateScoringRule(tenantId, rule.id, { enabled: !rule.enabled });
      setRules((prev) => (prev ?? []).map((r) => (r.id === rule.id ? updated : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update scoring rule");
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await api.deleteScoringRule(tenantId, id);
      setRules((prev) => (prev ?? []).filter((r) => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete scoring rule");
    }
  }

  const needsValue = operator !== "exists";

  return (
    <section className="card">
      <h2>Custom Scoring Rules</h2>
      <p className="muted small">
        Extra points added to or subtracted from a lead's score (Lead Intelligence) when a condition matches — on top
        of the built-in intent/need/budget/location/engagement scoring.
      </p>
      {error && <div className="banner banner-error">{error}</div>}
      {rules === null ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          {rules.length === 0 ? (
            <p className="muted">No custom scoring rules yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Condition</th>
                  <th>Points</th>
                  <th></th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id} style={{ opacity: r.enabled ? 1 : 0.5 }}>
                    <td>{r.name}</td>
                    <td>{describeRule(r)}</td>
                    <td>{r.points >= 0 ? `+${r.points}` : r.points}</td>
                    <td>
                      <button type="button" className="btn-secondary btn-small" onClick={() => handleToggle(r)}>
                        {r.enabled ? "Disable" : "Enable"}
                      </button>
                    </td>
                    <td>
                      <button type="button" className="btn-secondary btn-small" onClick={() => handleDelete(r.id)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <form onSubmit={handleCreate} className="field-group" style={{ marginTop: "1rem" }}>
            <label>
              Rule name
              <input type="text" placeholder="e.g. Big budget bonus" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              Field
              <select value={field} onChange={(e) => handleFieldChange(e.target.value as ScoringRuleField)}>
                {FIELDS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Condition
              <select value={operator} onChange={(e) => setOperator(e.target.value as ScoringRuleOperator)}>
                {operatorsFor(field).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            {needsValue && (
              <label>
                Value
                <input
                  type={field === "budget_value" ? "number" : "text"}
                  placeholder={field === "budget_value" ? "e.g. 10000000" : "e.g. ready_to_buy"}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </label>
            )}
            <label>
              Points (−100 to 100)
              <input type="number" min={-100} max={100} step={1} value={points} onChange={(e) => setPoints(e.target.value)} />
            </label>
            <button
              type="submit"
              className="btn-primary btn-small"
              disabled={saving || !name.trim() || (needsValue && !value.trim())}
            >
              {saving ? "Adding…" : "Add rule"}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
