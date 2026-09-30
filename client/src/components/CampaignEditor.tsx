import { useEffect, useState } from "react";
import {
  api,
  LANGUAGE_LABEL,
  TONE_LABEL,
  type Campaign,
  type CampaignLanguage,
  type CampaignTone,
  type FieldDefinition,
  type FieldDefinitionValueType,
  type Milestone,
  type ObservedMedia,
  type ReplyChannel,
  type TriggerSource,
} from "../api";

interface MilestoneDraft {
  goalDescription: string;
  captureFields: string[];
}

interface SettingsDraft {
  name: string;
  description: string;
  enabled: boolean;
  triggerSource: TriggerSource;
  keywords: string;
  replyMode: Campaign["replyMode"];
  defaultReplyTemplate: string;
  replyChannel: ReplyChannel;
  ctaLink: string;
  tone: CampaignTone;
  language: CampaignLanguage;
  useKnowledgeBase: boolean;
}

function draftFromCampaign(campaign: Campaign): SettingsDraft {
  return {
    name: campaign.name,
    description: campaign.description ?? "",
    enabled: campaign.enabled,
    triggerSource: campaign.triggerSource,
    keywords: campaign.keywords.join(", "),
    replyMode: campaign.replyMode,
    defaultReplyTemplate: campaign.defaultReplyTemplate,
    replyChannel: campaign.replyChannel,
    ctaLink: campaign.ctaLink ?? "",
    tone: campaign.tone,
    language: campaign.language,
    useKnowledgeBase: campaign.useKnowledgeBase,
  };
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function validateDraft(draft: SettingsDraft): string[] {
  const errors: string[] = [];
  if (!draft.name.trim()) errors.push("Journey name can't be blank.");
  if (draft.keywords.split(",").map((k) => k.trim()).filter(Boolean).length === 0) {
    errors.push("Add at least one trigger keyword.");
  }
  if (draft.replyMode === "ai_generated" && !draft.defaultReplyTemplate.trim()) {
    errors.push("A fallback reply template is required so AI mode can fail closed.");
  }
  if (!draft.defaultReplyTemplate.trim()) errors.push("Default reply template can't be blank.");
  if (draft.ctaLink.trim() && !isValidUrl(draft.ctaLink.trim())) errors.push("CTA link must be a valid URL.");
  return errors;
}

const VALUE_TYPES: { value: FieldDefinitionValueType; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "country", label: "Country" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "text", label: "Text" },
];

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <h3 className="m-0 mb-3 text-[15px] font-semibold text-ink">{title}</h3>
      {children}
    </section>
  );
}

/** Automation Details subsection (R8 card-based rebuild): everything except milestones/post-targeting uses one unified draft with an explicit Save/Discard bar (section 13) instead of autosaving each field. */
export function CampaignEditor({
  tenantId,
  campaign,
  onChanged,
}: {
  tenantId: string;
  campaign: Campaign;
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState<SettingsDraft>(() => draftFromCampaign(campaign));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setDraft(draftFromCampaign(campaign));
    setErrors([]);
  }, [campaign]);

  const baseline = draftFromCampaign(campaign);
  const isDirty = JSON.stringify(draft) !== JSON.stringify(baseline);

  // Reply variations — Phase 2A "Multiple DM Variations", kept as its own
  // immediate-save widget (matches the reference's own "Save variations"
  // button inside the Reply Settings card) rather than folded into the
  // unified draft below.
  const [replyTemplates, setReplyTemplates] = useState<string[]>(campaign.replyTemplates);
  const [savingReplyTemplates, setSavingReplyTemplates] = useState(false);
  const [replyTemplatesError, setReplyTemplatesError] = useState<string | null>(null);

  useEffect(() => {
    setReplyTemplates(campaign.replyTemplates);
  }, [campaign]);

  const [milestones, setMilestones] = useState<MilestoneDraft[]>([]);
  const [savingMilestones, setSavingMilestones] = useState(false);
  const [milestoneError, setMilestoneError] = useState<string | null>(null);

  const [fieldDefinitions, setFieldDefinitions] = useState<FieldDefinition[]>([]);
  const [newFieldRow, setNewFieldRow] = useState<number | null>(null);
  const [newFieldKey, setNewFieldKey] = useState("");
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldType, setNewFieldType] = useState<FieldDefinitionValueType>("text");
  const [creatingField, setCreatingField] = useState(false);
  const [newFieldError, setNewFieldError] = useState<string | null>(null);

  const [observedMedia, setObservedMedia] = useState<ObservedMedia[]>([]);
  const [targetMediaIds, setTargetMediaIds] = useState<string[]>(campaign.targetMediaIds);
  const [savingTargetMedia, setSavingTargetMedia] = useState(false);
  const [targetMediaError, setTargetMediaError] = useState<string | null>(null);
  const [addUrl, setAddUrl] = useState("");
  const [addingUrl, setAddingUrl] = useState(false);
  const [addUrlError, setAddUrlError] = useState<string | null>(null);

  useEffect(() => {
    setTargetMediaIds(campaign.targetMediaIds);
  }, [campaign]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [ms, media, defs] = await Promise.all([
          api.listMilestones(tenantId, campaign.id),
          api.listObservedMedia(tenantId),
          api.listFieldDefinitions(tenantId),
        ]);
        if (cancelled) return;
        setMilestones(
          ms.length > 0
            ? ms.map((m: Milestone) => ({ goalDescription: m.goalDescription, captureFields: m.captureFields }))
            : [{ goalDescription: "", captureFields: [] }],
        );
        setObservedMedia(media);
        setFieldDefinitions(defs);
      } catch {
        if (!cancelled) setMilestones([{ goalDescription: "", captureFields: [] }]);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [tenantId, campaign.id]);

  async function handleSaveChanges() {
    const foundErrors = validateDraft(draft);
    setErrors(foundErrors);
    if (foundErrors.length > 0) return;

    setSaving(true);
    try {
      await api.updateReplyConfig(tenantId, campaign.id, {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        triggerSource: draft.triggerSource,
        keywords: draft.keywords.split(",").map((k) => k.trim()).filter(Boolean),
        replyMode: draft.replyMode,
        defaultReplyTemplate: draft.defaultReplyTemplate,
        replyChannel: draft.replyChannel,
        ctaLink: draft.ctaLink.trim() || null,
        tone: draft.tone,
        language: draft.language,
        useKnowledgeBase: draft.useKnowledgeBase,
      });
      if (draft.enabled !== campaign.enabled) {
        await api.setCampaignEnabled(tenantId, campaign.id, draft.enabled);
      }
      onChanged();
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
    } catch (err) {
      setErrors([err instanceof Error ? err.message : "Failed to save changes"]);
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    setDraft(baseline);
    setErrors([]);
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
          ...(m.captureFields.length > 0 ? { captureFields: m.captureFields } : {}),
        }));
      if (payload.length === 0) {
        setMilestoneError("Add at least one milestone goal.");
        return;
      }
      await api.setMilestones(tenantId, campaign.id, payload);
      onChanged();
    } catch (err) {
      setMilestoneError(err instanceof Error ? err.message : "Failed to save milestones");
    } finally {
      setSavingMilestones(false);
    }
  }

  function toggleNewFieldRow(i: number) {
    setNewFieldError(null);
    setNewFieldKey("");
    setNewFieldLabel("");
    setNewFieldType("text");
    setNewFieldRow((prev) => (prev === i ? null : i));
  }

  async function createFieldForRow(i: number, e: React.FormEvent) {
    e.preventDefault();
    if (!newFieldKey.trim() || !newFieldLabel.trim()) return;
    setCreatingField(true);
    setNewFieldError(null);
    try {
      const created = await api.createFieldDefinition(tenantId, {
        fieldKey: newFieldKey.trim(),
        label: newFieldLabel.trim(),
        valueType: newFieldType,
      });
      setFieldDefinitions((prev) => [...prev, created]);
      setMilestones((prev) => {
        const next = [...prev];
        const row = next[i]!;
        next[i] = { ...row, captureFields: [...row.captureFields, created.fieldKey] };
        return next;
      });
      setNewFieldRow(null);
      setNewFieldKey("");
      setNewFieldLabel("");
      setNewFieldType("text");
    } catch (err) {
      setNewFieldError(err instanceof Error ? err.message : "Failed to create field");
    } finally {
      setCreatingField(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      <Card title="Basic Information">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-[1fr_200px]">
          <div>
            <label>
              Journey Name
              <input type="text" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <label>
              Description
              <textarea
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                rows={2}
                placeholder="What this journey is for"
              />
            </label>
          </div>
          <div>
            <div className="mb-1 text-sm">Status</div>
            <label className="radio-row">
              <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
              {draft.enabled ? "Active" : "Inactive"}
            </label>
          </div>
        </div>
      </Card>

      <Card title="Trigger Settings">
        <label className="radio-row">
          <input
            type="radio"
            checked={draft.triggerSource === "comment"}
            onChange={() => setDraft({ ...draft, triggerSource: "comment" })}
          />
          Comments only (a keyword in a public comment)
        </label>
        <label className="radio-row">
          <input
            type="radio"
            checked={draft.triggerSource === "message"}
            onChange={() => setDraft({ ...draft, triggerSource: "message" })}
          />
          Direct messages only (a keyword in a DM)
        </label>
        <label className="radio-row">
          <input
            type="radio"
            checked={draft.triggerSource === "both"}
            onChange={() => setDraft({ ...draft, triggerSource: "both" })}
          />
          Both
        </label>
        <label>
          Keywords (comma separated)
          <textarea value={draft.keywords} onChange={(e) => setDraft({ ...draft, keywords: e.target.value })} rows={2} />
        </label>
      </Card>

      <Card title="Reply Settings">
        <label className="radio-row">
          <input type="radio" checked={draft.replyMode === "rule_based"} onChange={() => setDraft({ ...draft, replyMode: "rule_based" })} />
          Rule-based (fixed template)
        </label>
        <label className="radio-row">
          <input type="radio" checked={draft.replyMode === "ai_generated"} onChange={() => setDraft({ ...draft, replyMode: "ai_generated" })} />
          AI-generated
        </label>

        <label>
          Default reply template (used for rule-based, and as the fail-closed fallback for AI)
          <textarea
            value={draft.defaultReplyTemplate}
            onChange={(e) => setDraft({ ...draft, defaultReplyTemplate: e.target.value })}
            rows={2}
          />
        </label>

        <div className="mb-1 mt-3 text-sm">Reply variations (optional)</div>
        <p className="muted small">One is picked at random instead of always using the default template above.</p>
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
            <button type="button" className="btn-secondary btn-small" onClick={() => setReplyTemplates(replyTemplates.filter((_, idx) => idx !== i))}>
              Remove
            </button>
          </div>
        ))}
        <div className="button-row">
          <button type="button" className="btn-secondary btn-small" onClick={() => setReplyTemplates([...replyTemplates, ""])}>
            + Add variation
          </button>
          <button className="btn-primary btn-small" onClick={saveReplyTemplates} disabled={savingReplyTemplates}>
            {savingReplyTemplates ? "Saving…" : "Save variations"}
          </button>
        </div>
        {replyTemplatesError && <div className="banner banner-error">{replyTemplatesError}</div>}

        <div className="mb-1 mt-2 text-sm">Reply Channel</div>
        <label className="radio-row">
          <input type="radio" checked={draft.replyChannel === "dm"} onChange={() => setDraft({ ...draft, replyChannel: "dm" })} />
          Direct message only (private, sent to the commenter)
        </label>
        <label className="radio-row">
          <input type="radio" checked={draft.replyChannel === "comment"} onChange={() => setDraft({ ...draft, replyChannel: "comment" })} />
          Public comment reply only (posted publicly under the comment)
        </label>
        <label className="radio-row">
          <input type="radio" checked={draft.replyChannel === "both"} onChange={() => setDraft({ ...draft, replyChannel: "both" })} />
          Both
        </label>

        <label>
          CTA Link (optional)
          <input type="text" value={draft.ctaLink} onChange={(e) => setDraft({ ...draft, ctaLink: e.target.value })} placeholder="https://example.com/brochure" />
          <span className="muted small">This link is available to reference in your reply template.</span>
        </label>
      </Card>

      <Card title="AI Behaviour">
        <div className="flex flex-wrap gap-4">
          <label style={{ flex: "1 1 160px" }}>
            Tone
            <select value={draft.tone} onChange={(e) => setDraft({ ...draft, tone: e.target.value as CampaignTone })}>
              {(Object.keys(TONE_LABEL) as CampaignTone[]).map((t) => (
                <option key={t} value={t}>
                  {TONE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label style={{ flex: "1 1 160px" }}>
            Language
            <select value={draft.language} onChange={(e) => setDraft({ ...draft, language: e.target.value as CampaignLanguage })}>
              {(Object.keys(LANGUAGE_LABEL) as CampaignLanguage[]).map((l) => (
                <option key={l} value={l}>
                  {LANGUAGE_LABEL[l]}
                </option>
              ))}
            </select>
          </label>
          <label className="radio-row" style={{ flex: "1 1 200px", alignSelf: "flex-end" }}>
            <input type="checkbox" checked={draft.useKnowledgeBase} onChange={(e) => setDraft({ ...draft, useKnowledgeBase: e.target.checked })} />
            Use Knowledge Base
          </label>
        </div>
        <p className="muted small">Grounds AI replies in your uploaded documents (Knowledge Base nav item).</p>
      </Card>

      {errors.length > 0 && (
        <div className="banner banner-error">
          {errors.map((e) => (
            <div key={e}>{e}</div>
          ))}
        </div>
      )}

      <div className="sticky bottom-0 -mx-1 flex items-center justify-end gap-2 rounded-xl border border-line bg-card px-4 py-3 shadow-sm">
        {savedFlash && <span className="mr-auto text-sm text-ok-ink">Saved</span>}
        {isDirty && !savedFlash && <span className="mr-auto text-sm text-subtle">Unsaved changes</span>}
        <button type="button" className="btn-secondary" onClick={handleDiscard} disabled={!isDirty || saving}>
          Discard changes
        </button>
        <button type="button" className="btn-primary" onClick={handleSaveChanges} disabled={!isDirty || saving}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>

      <Card title="Post Targeting">
        <p className="muted small">
          Pick which post(s) trigger this campaign. Leave nothing checked to match every post.
        </p>

        <form onSubmit={addPostByUrl} className="inline-form">
          <input type="text" placeholder="Paste a post or Reel URL to add it" value={addUrl} onChange={(e) => setAddUrl(e.target.value)} />
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
                  <input type="checkbox" checked={targetMediaIds.includes(m.mediaId)} onChange={() => toggleTargetMedia(m.mediaId)} />
                  {m.thumbnailUrl && (
                    <img src={m.thumbnailUrl} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} />
                  )}
                  <span>{m.caption ? m.caption.split("\n")[0]!.slice(0, 80) : m.mediaId}</span>
                  <span className="muted">
                    {" — "}
                    {m.commentCount > 0 ? `${m.commentCount} comment${m.commentCount === 1 ? "" : "s"}` : "added by URL, no comments yet"}
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
      </Card>

      <Card title="Milestones">
        <p className="muted small">Ordered conversation goals — reorder or edit these from the Builder tab's canvas too.</p>
        {milestones.map((m, i) => {
          const availableFields = fieldDefinitions.filter((fd) => !m.captureFields.includes(fd.fieldKey));
          return (
            <div key={i} className="card" style={{ marginBottom: "0.75rem" }}>
              <div className="milestone-row">
                <span className="pill pill-ok" style={{ marginLeft: 0, flexShrink: 0 }}>
                  Step {i + 1}
                </span>
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
                <button type="button" className="btn-secondary btn-small" onClick={() => toggleNewFieldRow(i)}>
                  {newFieldRow === i ? "Cancel" : "+ New field"}
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-small"
                  onClick={() => setMilestones(milestones.filter((_, idx) => idx !== i))}
                  disabled={milestones.length === 1}
                >
                  Remove
                </button>
              </div>

              <div style={{ margin: "0.5rem 0" }}>
                {m.captureFields.length === 0 ? (
                  <span className="muted small">No fields captured by this goal yet.</span>
                ) : (
                  m.captureFields.map((fieldKey) => (
                    <span className="tag-chip" key={fieldKey}>
                      {fieldDefinitions.find((fd) => fd.fieldKey === fieldKey)?.label ?? fieldKey}
                      <button
                        type="button"
                        aria-label={`Remove field ${fieldKey}`}
                        onClick={() => {
                          const next = [...milestones];
                          next[i] = { ...next[i]!, captureFields: next[i]!.captureFields.filter((k) => k !== fieldKey) };
                          setMilestones(next);
                        }}
                      >
                        ×
                      </button>
                    </span>
                  ))
                )}
              </div>
              {availableFields.length > 0 && (
                <select
                  value=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const next = [...milestones];
                    next[i] = { ...next[i]!, captureFields: [...next[i]!.captureFields, e.target.value] };
                    setMilestones(next);
                  }}
                >
                  <option value="">+ Add field to capture…</option>
                  {availableFields.map((fd) => (
                    <option key={fd.fieldKey} value={fd.fieldKey}>
                      {fd.label}
                    </option>
                  ))}
                </select>
              )}
              {newFieldRow === i && (
                <form onSubmit={(e) => createFieldForRow(i, e)} className="inline-form">
                  <input type="text" placeholder="Key, e.g. email" value={newFieldKey} onChange={(e) => setNewFieldKey(e.target.value)} />
                  <input type="text" placeholder="Label, e.g. Email address" value={newFieldLabel} onChange={(e) => setNewFieldLabel(e.target.value)} />
                  <select value={newFieldType} onChange={(e) => setNewFieldType(e.target.value as FieldDefinitionValueType)}>
                    {VALUE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="btn-primary btn-small" disabled={!newFieldKey.trim() || !newFieldLabel.trim() || creatingField}>
                    {creatingField ? "Adding…" : "Add field"}
                  </button>
                </form>
              )}
              {newFieldRow === i && newFieldError && <div className="banner banner-error">{newFieldError}</div>}
            </div>
          );
        })}
        <button type="button" className="btn-secondary btn-small" onClick={() => setMilestones([...milestones, { goalDescription: "", captureFields: [] }])}>
          Add milestone
        </button>
        {milestoneError && <div className="banner banner-error">{milestoneError}</div>}
        <button className="btn-primary" onClick={saveMilestones} disabled={savingMilestones} style={{ marginLeft: "0.5rem" }}>
          {savingMilestones ? "Saving…" : "Save milestones"}
        </button>
      </Card>

      <Card title="Danger Zone">
        <p className="muted small">
          Deleting a journey isn't supported yet — disable it instead (toggle Status above) to stop it from replying.
        </p>
        <button type="button" className="btn-secondary" disabled title="Not available yet">
          Delete journey
        </button>
      </Card>
    </div>
  );
}
