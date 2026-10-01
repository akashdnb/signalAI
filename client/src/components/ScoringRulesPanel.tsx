import { useEffect, useMemo, useState } from "react";
import {
  api,
  type Campaign,
  type Milestone,
  type ScoringRule,
  type ScoringRuleDefinition,
  type ScoringRuleField,
  type ScoringRuleOperator,
} from "../api";

const FIELDS: { value: ScoringRuleField; label: string }[] = [
  { value: "budget_value", label: "Budget" },
  { value: "intent", label: "Intent" },
  { value: "need", label: "Need" },
  { value: "location", label: "Location" },
];

type RuleType = "field_compare" | "milestone_completed";

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

/** campaignId/goalDescription for a milestone id — lets describeRule render a real name instead of a bare UUID. React already escapes this text; it's never inserted as HTML. */
type MilestoneLookup = Record<string, { campaignName: string; goalDescription: string }>;

function describeRule(rule: ScoringRule, milestoneLookup: MilestoneLookup): string {
  const d = rule.definition;
  if (d.kind === "milestone_completed") {
    const found = milestoneLookup[d.milestoneId];
    if (!found) return "Milestone completed (no longer available)";
    return `${found.campaignName} · Completed "${found.goalDescription}"`;
  }
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
 * is creator-facing, not developer-facing). Editing an existing rule's
 * condition stays delete + recreate — no in-place editor, per the current
 * roadmap scope.
 */
export function ScoringRulesPanel({ tenantId }: { tenantId: string }) {
  const [rules, setRules] = useState<ScoringRule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  // campaignId -> that campaign's active milestones, lazily loaded — also
  // accumulated into milestoneLookup below so an EXISTING milestone rule
  // (from any campaign, not just the one currently selected in the form)
  // still renders a human-readable description.
  const [milestonesByCampaign, setMilestonesByCampaign] = useState<Record<string, Milestone[]>>({});
  const [milestonesError, setMilestonesError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [ruleType, setRuleType] = useState<RuleType>("field_compare");
  const [field, setField] = useState<ScoringRuleField>("budget_value");
  const [operator, setOperator] = useState<ScoringRuleOperator>("gte");
  const [value, setValue] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [milestoneId, setMilestoneId] = useState("");
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
    api
      .listCampaigns(tenantId)
      .then((c) => {
        if (!cancelled) setCampaigns(c);
      })
      .catch((err) => {
        if (!cancelled) setMilestonesError(err instanceof Error ? err.message : "Failed to load campaigns");
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  // Loads every campaign's milestones once campaigns are known — needed so
  // describeRule can label an already-created milestone rule by name even
  // when that campaign isn't the one currently selected in the form below.
  useEffect(() => {
    if (!campaigns) return;
    let cancelled = false;
    Promise.all(
      campaigns.map((c) =>
        api
          .listMilestones(tenantId, c.id)
          .then((ms) => [c.id, ms] as const)
          .catch(() => [c.id, []] as const),
      ),
    ).then((entries) => {
      if (cancelled) return;
      setMilestonesByCampaign(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [tenantId, campaigns]);

  const milestoneLookup: MilestoneLookup = useMemo(() => {
    const lookup: MilestoneLookup = {};
    for (const campaign of campaigns ?? []) {
      for (const milestone of milestonesByCampaign[campaign.id] ?? []) {
        lookup[milestone.id] = { campaignName: campaign.name, goalDescription: milestone.goalDescription };
      }
    }
    return lookup;
  }, [campaigns, milestonesByCampaign]);

  const milestonesForSelectedCampaign = campaignId ? (milestonesByCampaign[campaignId] ?? []) : [];

  function handleFieldChange(next: ScoringRuleField) {
    setField(next);
    const allowed = operatorsFor(next).map((o) => o.value);
    if (!allowed.includes(operator)) setOperator(allowed[0]!);
  }

  function handleCampaignChange(next: string) {
    setCampaignId(next);
    setMilestoneId(""); // reset — the previous selection belonged to a different campaign's milestone list
  }

  function handleRuleTypeChange(next: RuleType) {
    setRuleType(next);
    setCampaignId("");
    setMilestoneId("");
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const parsedPoints = Number(points);
    if (!name.trim() || !Number.isInteger(parsedPoints)) return;

    let definition: ScoringRuleDefinition;
    if (ruleType === "milestone_completed") {
      if (!milestoneId) return;
      definition = { kind: "milestone_completed", milestoneId };
    } else {
      if (operator !== "exists" && !value.trim()) return;
      const isNumericField = field === "budget_value";
      definition =
        operator === "exists"
          ? { kind: "field_compare", field, operator }
          : { kind: "field_compare", field, operator, value: isNumericField ? Number(value) : value.trim() };
    }

    setSaving(true);
    setError(null);
    try {
      const created = await api.createScoringRule(tenantId, { name: name.trim(), definition, points: parsedPoints });
      setRules((prev) => [...(prev ?? []), created]);
      setName("");
      setValue("");
      setMilestoneId("");
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

  const needsValue = ruleType === "field_compare" && operator !== "exists";
  const canSubmit =
    !saving &&
    !!name.trim() &&
    (ruleType === "field_compare" ? !needsValue || !!value.trim() : !!milestoneId);

  return (
    <section className="card">
      <h2>Custom Scoring Rules</h2>
      <p className="muted small">
        Extra points added to or subtracted from a lead's score (Lead Intelligence) when a condition matches — on top
        of the built-in intent/need/budget/location/engagement scoring. Editing an existing rule isn't supported yet
        — remove it and add a new one instead.
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
                    <td>{describeRule(r, milestoneLookup)}</td>
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
              Rule type
              <select value={ruleType} onChange={(e) => handleRuleTypeChange(e.target.value as RuleType)}>
                <option value="field_compare">Field condition</option>
                <option value="milestone_completed">Milestone completed</option>
              </select>
            </label>

            {ruleType === "field_compare" ? (
              <>
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
              </>
            ) : (
              <>
                {milestonesError && <div className="banner banner-error">{milestonesError}</div>}
                <label>
                  Campaign
                  <select value={campaignId} onChange={(e) => handleCampaignChange(e.target.value)}>
                    <option value="">
                      {campaigns === null ? "Loading…" : campaigns.length === 0 ? "No campaigns yet" : "Select a campaign…"}
                    </option>
                    {(campaigns ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Milestone
                  <select value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)} disabled={!campaignId}>
                    <option value="">
                      {!campaignId
                        ? "Select a campaign first"
                        : milestonesForSelectedCampaign.length === 0
                          ? "This campaign has no milestones"
                          : "Select a milestone…"}
                    </option>
                    {milestonesForSelectedCampaign.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.goalDescription}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}

            <label>
              Points (−100 to 100)
              <input type="number" min={-100} max={100} step={1} value={points} onChange={(e) => setPoints(e.target.value)} />
            </label>
            <button type="submit" className="btn-primary btn-small" disabled={!canSubmit}>
              {saving ? "Adding…" : "Add rule"}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
