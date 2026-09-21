import { useEffect, useState } from "react";
import { api, type Campaign, type Dropoff, type Milestone, type ObservedMedia, type PreviewResult, type ReplyChannel, type TriggerSource } from "../api";

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
  const [replyChannel, setReplyChannel] = useState<ReplyChannel>(campaign.replyChannel);
  const [triggerSource, setTriggerSource] = useState<TriggerSource>(campaign.triggerSource);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  const [milestones, setMilestones] = useState<MilestoneDraft[]>([]);
  const [savingMilestones, setSavingMilestones] = useState(false);
  const [milestoneError, setMilestoneError] = useState<string | null>(null);

  // Phase 2A "Multiple DM Variations" — an empty list falls back to
  // defaultReplyTemplate above (see server's replyEngine.ts).
  const [replyTemplates, setReplyTemplates] = useState<string[]>(campaign.replyTemplates);
  const [savingReplyTemplates, setSavingReplyTemplates] = useState(false);
  const [replyTemplatesError, setReplyTemplatesError] = useState<string | null>(null);

  const [dropoff, setDropoff] = useState<Dropoff[] | null>(null);

  const [observedMedia, setObservedMedia] = useState<ObservedMedia[]>([]);
  const [targetMediaIds, setTargetMediaIds] = useState<string[]>(campaign.targetMediaIds);
  const [savingTargetMedia, setSavingTargetMedia] = useState(false);
  const [targetMediaError, setTargetMediaError] = useState<string | null>(null);
  const [addUrl, setAddUrl] = useState("");
  const [addingUrl, setAddingUrl] = useState(false);
  const [addUrlError, setAddUrlError] = useState<string | null>(null);

  const [sampleText, setSampleText] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    setReplyMode(campaign.replyMode);
    setCtaLink(campaign.ctaLink ?? "");
    setDefaultReplyTemplate(campaign.defaultReplyTemplate);
    setReplyChannel(campaign.replyChannel);
    setTriggerSource(campaign.triggerSource);
    setTargetMediaIds(campaign.targetMediaIds);
    setReplyTemplates(campaign.replyTemplates);
  }, [campaign]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [ms, d, media] = await Promise.all([
          api.listMilestones(tenantId, campaign.id),
          api.getDropoff(tenantId, campaign.id),
          api.listObservedMedia(tenantId),
        ]);
        if (cancelled) return;
        setMilestones(
          ms.length > 0
            ? ms.map((m: Milestone) => ({ goalDescription: m.goalDescription, captureField: m.captureField ?? "" }))
            : [{ goalDescription: "", captureField: "" }],
        );
        setDropoff(d);
        setObservedMedia(media);
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
        replyChannel,
        triggerSource,
      });
      onChanged();
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingConfig(false);
    }
  }

  async function saveReplyTemplates() {
    setSavingReplyTemplates(true);
    setReplyTemplatesError(null);
    try {
      const trimmed = replyTemplates.map((t) => t.trim()).filter((t) => t.length > 0);
      await api.setCampaignReplyTemplates(tenantId, campaign.id, trimmed);
      setReplyTemplates(trimmed);
      onChanged();
    } catch (err) {
      setReplyTemplatesError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingReplyTemplates(false);
    }
  }

  function toggleTargetMedia(mediaId: string) {
    setTargetMediaIds((prev) => (prev.includes(mediaId) ? prev.filter((id) => id !== mediaId) : [...prev, mediaId]));
  }

  async function saveTargetMedia() {
    setSavingTargetMedia(true);
    setTargetMediaError(null);
    try {
      await api.setCampaignTargetMedia(tenantId, campaign.id, targetMediaIds);
      onChanged();
    } catch (err) {
      setTargetMediaError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingTargetMedia(false);
    }
  }

  async function addPostByUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!addUrl.trim()) return;
    setAddingUrl(true);
    setAddUrlError(null);
    try {
      const added = await api.addKnownMediaByUrl(tenantId, addUrl.trim());
      setObservedMedia((prev) => [added, ...prev.filter((m) => m.mediaId !== added.mediaId)]);
      // Adding a post is a declaration of intent to target it — check it
      // for this campaign right away; the person still has to hit "Save
      // post targeting" below for that to stick.
      setTargetMediaIds((prev) => (prev.includes(added.mediaId) ? prev : [...prev, added.mediaId]));
      setAddUrl("");
    } catch (err) {
      setAddUrlError(err instanceof Error ? err.message : "Failed to add that post");
    } finally {
      setAddingUrl(false);
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
        <h4>Triggered by</h4>
        <label className="radio-row">
          <input type="radio" checked={triggerSource === "comment"} onChange={() => setTriggerSource("comment")} />
          Comments only (a keyword in a public comment)
        </label>
        <label className="radio-row">
          <input type="radio" checked={triggerSource === "message"} onChange={() => setTriggerSource("message")} />
          Direct messages only (a keyword in a DM)
        </label>
        <label className="radio-row">
          <input type="radio" checked={triggerSource === "both"} onChange={() => setTriggerSource("both")} />
          Both
        </label>
        {(triggerSource === "message" || triggerSource === "both") && targetMediaIds.length > 0 && (
          <p className="muted small">
            Post targeting below only applies to the comment side of this campaign — a DM isn't tied to any post, so
            it'll still match regardless of which posts are checked.
          </p>
        )}

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

        <h4>Reply variations (optional)</h4>
        <p className="muted small">
          Add a few alternate rule-based replies and one is picked at random each time, instead of always using the
          default template above. Leave empty to always use the default.
        </p>
        {replyTemplates.map((t, i) => (
          <div key={i} className="milestone-row">
            <input
              type="text"
              placeholder={`Variation ${i + 1}`}
              value={t}
              onChange={(e) => {
                const next = [...replyTemplates];
                next[i] = e.target.value;
                setReplyTemplates(next);
              }}
            />
            <button
              type="button"
              className="btn-secondary btn-small"
              onClick={() => setReplyTemplates(replyTemplates.filter((_, idx) => idx !== i))}
            >
              Remove
            </button>
          </div>
        ))}
        <button type="button" className="btn-secondary btn-small" onClick={() => setReplyTemplates([...replyTemplates, ""])}>
          Add variation
        </button>
        {replyTemplatesError && <div className="banner banner-error">{replyTemplatesError}</div>}
        <button className="btn-primary btn-small" onClick={saveReplyTemplates} disabled={savingReplyTemplates}>
          {savingReplyTemplates ? "Saving…" : "Save variations"}
        </button>

        <h4>Reply channel</h4>
        <label className="radio-row">
          <input type="radio" checked={replyChannel === "dm"} onChange={() => setReplyChannel("dm")} />
          Direct message only (private, sent to the commenter)
        </label>
        <label className="radio-row">
          <input type="radio" checked={replyChannel === "comment"} onChange={() => setReplyChannel("comment")} />
          Public comment reply only (posted publicly under the comment)
        </label>
        <label className="radio-row">
          <input type="radio" checked={replyChannel === "both"} onChange={() => setReplyChannel("both")} />
          Both
        </label>
        {(replyChannel === "comment" || replyChannel === "both") && (
          <p className="muted small">
            Public comment replies require Meta's <code>instagram_business_manage_comments</code> permission,
            already requested alongside messaging — confirm it's been approved for this app before relying on this.
          </p>
        )}
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
        <h4>Posts this campaign replies to</h4>
        <p className="muted small">
          Pick which post(s) trigger this campaign. Leave nothing checked to match every post — that's the default,
          and how every campaign behaved before post-targeting existed.
        </p>

        <form onSubmit={addPostByUrl} className="inline-form">
          <input
            type="text"
            placeholder="Paste a post or Reel URL to add it"
            value={addUrl}
            onChange={(e) => setAddUrl(e.target.value)}
          />
          <button type="submit" className="btn-secondary" disabled={!addUrl.trim() || addingUrl}>
            {addingUrl ? "Adding…" : "Add post"}
          </button>
        </form>
        {addUrlError && <div className="banner banner-error">{addUrlError}</div>}

        {observedMedia.length === 0 ? (
          <p className="muted">No posts yet — they'll show up here once someone comments, or add one by URL above.</p>
        ) : (
          <ul className="list">
            {observedMedia.map((m) => (
              <li key={m.mediaId} className="list-item">
                <label className="radio-row">
                  <input
                    type="checkbox"
                    checked={targetMediaIds.includes(m.mediaId)}
                    onChange={() => toggleTargetMedia(m.mediaId)}
                  />
                  {m.thumbnailUrl && (
                    <img
                      src={m.thumbnailUrl}
                      alt=""
                      style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4, flexShrink: 0 }}
                    />
                  )}
                  <span>
                    {m.caption ? m.caption.split("\n")[0]!.slice(0, 80) : m.mediaId}
                  </span>
                  <span className="muted">
                    {" — "}
                    {m.commentCount > 0
                      ? `${m.commentCount} comment${m.commentCount === 1 ? "" : "s"}`
                      : "added by URL, no comments yet"}
                  </span>
                  {m.permalink && (
                    <a href={m.permalink} target="_blank" rel="noreferrer" className="link-button" onClick={(e) => e.stopPropagation()}>
                      View ↗
                    </a>
                  )}
                </label>
              </li>
            ))}
          </ul>
        )}
        {targetMediaError && <div className="banner banner-error">{targetMediaError}</div>}
        <button className="btn-primary" onClick={saveTargetMedia} disabled={savingTargetMedia}>
          {savingTargetMedia ? "Saving…" : "Save post targeting"}
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
