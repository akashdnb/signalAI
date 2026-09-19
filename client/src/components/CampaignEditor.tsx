import { useEffect, useState } from "react";
import { api, type Campaign, type Dropoff, type Milestone, type PreviewResult } from "../api";

interface MilestoneDraft {
  goalDescription: string;
  captureField: string;
}

export function CampaignEditor({
  tenantId,
  campaign,
  onChanged,
}: {
  tenantId: string;
  campaign: Campaign;
  onChanged: () => void;
}) {
  const [replyMode, setReplyMode] = useState(campaign.replyMode);
  const [ctaLink, setCtaLink] = useState(campaign.ctaLink ?? "");
  const [defaultReplyTemplate, setDefaultReplyTemplate] = useState(campaign.defaultReplyTemplate);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  const [milestones, setMilestones] = useState<MilestoneDraft[]>([]);
  const [savingMilestones, setSavingMilestones] = useState(false);
  const [milestoneError, setMilestoneError] = useState<string | null>(null);

  const [dropoff, setDropoff] = useState<Dropoff[] | null>(null);

  const [sampleText, setSampleText] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    setReplyMode(campaign.replyMode);
    setCtaLink(campaign.ctaLink ?? "");
    setDefaultReplyTemplate(campaign.defaultReplyTemplate);
  }, [campaign]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [ms, d] = await Promise.all([
          api.listMilestones(tenantId, campaign.id),
          api.getDropoff(tenantId, campaign.id),
        ]);
        if (cancelled) return;
        setMilestones(
          ms.length > 0
            ? ms.map((m: Milestone) => ({ goalDescription: m.goalDescription, captureField: m.captureField ?? "" }))
            : [{ goalDescription: "", captureField: "" }],
        );
        setDropoff(d);
      } catch {
        if (!cancelled) setMilestones([{ goalDescription: "", captureField: "" }]);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [tenantId, campaign.id]);

  async function saveReplyConfig() {
    setSavingConfig(true);
    setConfigError(null);
    try {
      await api.updateReplyConfig(tenantId, campaign.id, {
        replyMode,
        ctaLink: ctaLink.trim() || null,
        defaultReplyTemplate,
      });
      onChanged();
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingConfig(false);
    }
  }

  async function saveMilestones() {
    setSavingMilestones(true);
    setMilestoneError(null);
    try {
      const payload = milestones
        .filter((m) => m.goalDescription.trim())
        .map((m) => ({
          goalDescription: m.goalDescription.trim(),
          ...(m.captureField.trim() ? { captureField: m.captureField.trim() } : {}),
        }));
      if (payload.length === 0) {
        setMilestoneError("Add at least one milestone goal.");
        return;
      }
      await api.setMilestones(tenantId, campaign.id, payload);
      const d = await api.getDropoff(tenantId, campaign.id);
      setDropoff(d);
    } catch (err) {
      setMilestoneError(err instanceof Error ? err.message : "Failed to save milestones");
    } finally {
      setSavingMilestones(false);
    }
  }

  async function runPreview() {
    if (!sampleText.trim()) return;
    setPreviewing(true);
    setPreviewError(null);
    try {
      const result = await api.preview(tenantId, campaign.id, sampleText.trim());
      setPreview(result);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Failed to generate preview");
    } finally {
      setPreviewing(false);
    }
  }

  return (
    <div className="editor">
      <h3>{campaign.name}</h3>

      <div className="field-group">
        <h4>Reply mode</h4>
        <label className="radio-row">
          <input
            type="radio"
            checked={replyMode === "rule_based"}
            onChange={() => setReplyMode("rule_based")}
          />
          Rule-based (fixed template)
        </label>
        <label className="radio-row">
          <input
            type="radio"
            checked={replyMode === "ai_generated"}
            onChange={() => setReplyMode("ai_generated")}
          />
          AI-generated
        </label>

        <label>
          Default reply template (used for rule-based, and as the fail-closed fallback for AI)
          <textarea
            value={defaultReplyTemplate}
            onChange={(e) => setDefaultReplyTemplate(e.target.value)}
            rows={2}
          />
        </label>
        <label>
          CTA link (optional)
          <input type="text" value={ctaLink} onChange={(e) => setCtaLink(e.target.value)} placeholder="https://…" />
        </label>

        {configError && <div className="banner banner-error">{configError}</div>}
        <button className="btn-primary" onClick={saveReplyConfig} disabled={savingConfig}>
          {savingConfig ? "Saving…" : "Save reply settings"}
        </button>
      </div>

      <div className="field-group">
        <h4>Milestones (conversation goals, in order)</h4>
        {milestones.map((m, i) => (
          <div key={i} className="milestone-row">
            <input
              type="text"
              placeholder={`Goal ${i + 1}, e.g. "capture their email"`}
              value={m.goalDescription}
              onChange={(e) => {
                const next = [...milestones];
                next[i] = { ...next[i]!, goalDescription: e.target.value };
                setMilestones(next);
              }}
            />
            <input
              type="text"
              placeholder="capture field (optional, e.g. email)"
              value={m.captureField}
              onChange={(e) => {
                const next = [...milestones];
                next[i] = { ...next[i]!, captureField: e.target.value };
                setMilestones(next);
              }}
            />
            <button
              type="button"
              className="btn-secondary btn-small"
              onClick={() => setMilestones(milestones.filter((_, idx) => idx !== i))}
              disabled={milestones.length === 1}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn-secondary btn-small"
          onClick={() => setMilestones([...milestones, { goalDescription: "", captureField: "" }])}
        >
          Add milestone
        </button>
        {milestoneError && <div className="banner banner-error">{milestoneError}</div>}
        <button className="btn-primary" onClick={saveMilestones} disabled={savingMilestones}>
          {savingMilestones ? "Saving…" : "Save milestones"}
        </button>

        {dropoff && dropoff.length > 0 && (
          <table className="table" style={{ marginTop: "1rem" }}>
            <thead>
              <tr>
                <th>#</th>
                <th>Goal</th>
                <th>Leads advanced past this milestone</th>
              </tr>
            </thead>
            <tbody>
              {dropoff.map((d) => (
                <tr key={d.milestoneId}>
                  <td>{d.ordinal + 1}</td>
                  <td>{d.goalDescription}</td>
                  <td>{d.advancedCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="field-group">
        <h4>Preview a reply</h4>
        <label>
          Sample comment
          <input
            type="text"
            value={sampleText}
            onChange={(e) => setSampleText(e.target.value)}
            placeholder="e.g. send me the LINK please!"
          />
        </label>
        <button className="btn-secondary" onClick={runPreview} disabled={previewing || !sampleText.trim()}>
          {previewing ? "Generating…" : "Preview"}
        </button>
        {previewError && <div className="banner banner-error">{previewError}</div>}
        {preview && (
          <div className="preview-grid">
            <div>
              <strong>Rule-based:</strong>
              <p>{preview.ruleBased.text}</p>
            </div>
            <div>
              <strong>AI-generated:</strong>
              <p>{preview.aiGenerated.text}</p>
              {preview.aiGenerated.fellBackReason && (
                <p className="muted small">Fell back to rule-based: {preview.aiGenerated.fellBackReason}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
