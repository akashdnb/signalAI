import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useState } from "react";
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
import { ChevronDownIcon } from "./icons";

interface MilestoneDraft {
  goalDescription: string;
  captureFields: string[];
}

interface SettingsDraft {
  name: string;
  description: string;
  enabled: boolean;
  triggerSource: TriggerSource;
  keywords: string[];
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
    keywords: [...campaign.keywords],
    replyMode: campaign.replyMode,
    defaultReplyTemplate: campaign.defaultReplyTemplate,
    replyChannel: campaign.replyChannel,
    ctaLink: campaign.ctaLink ?? "",
    tone: campaign.tone,
    language: campaign.language,
    useKnowledgeBase: campaign.useKnowledgeBase,
  };
}

function isValidHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function validateDraft(draft: SettingsDraft): string[] {
  const errors: string[] = [];
  if (!draft.name.trim()) errors.push("Automation name can't be blank.");
  if (draft.keywords.length === 0) errors.push("Add at least one word or phrase to match.");
  if (draft.replyMode === "ai_generated" && !draft.defaultReplyTemplate.trim()) {
    errors.push("A fallback reply template is required so AI mode can fail closed.");
  }
  if (!draft.defaultReplyTemplate.trim()) errors.push("Default reply template can't be blank.");
  if (draft.ctaLink.trim() && !isValidHttpsUrl(draft.ctaLink.trim())) {
    errors.push("CTA link must be a valid HTTPS URL to render as an Instagram button or card.");
  }
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

/**
 * Settings sections start expanded on desktop and remain true accordions on
 * mobile. Using an explicit button/state pair keeps click and keyboard
 * behaviour consistent instead of trying to reveal closed <details> content
 * with CSS (which left sections hidden and their headings inert in Chromium).
 */
function Card({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const contentId = useId();
  const [expanded, setExpanded] = useState(
    () =>
      defaultOpen ||
      (typeof window !== "undefined" &&
        window.matchMedia("(min-width: 768px)").matches),
  );

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const handleBreakpointChange = (event: MediaQueryListEvent) => {
      // Keep settings discoverable on desktop; restore the mobile defaults
      // when the viewport switches back to a narrow layout.
      setExpanded(event.matches || defaultOpen);
    };

    media.addEventListener("change", handleBreakpointChange);
    return () => media.removeEventListener("change", handleBreakpointChange);
  }, [defaultOpen]);

  return (
    <section className="accordion-card card">
      <button
        type="button"
        className="accordion-card-trigger flex min-h-11 w-full items-center justify-between text-left text-[15px] font-semibold text-ink md:mb-3"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((current) => !current)}
      >
        <span>{title}</span>
        <span aria-hidden="true">
          <ChevronDownIcon className="accordion-chevron h-5 w-5 text-subtle md:hidden" />
        </span>
      </button>
      <div
        id={contentId}
        className="accordion-card-content mt-3 md:mt-0"
        hidden={!expanded}
      >
        {children}
      </div>
    </section>
  );
}

function OptionCard({
  checked,
  title,
  subtitle,
  onSelect,
}: {
  checked: boolean;
  title: string;
  subtitle?: string;
  onSelect: () => void;
}) {
  return (
    <label
      className={`mb-0 flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 ${
        checked ? "border-accent bg-chip" : "border-line bg-card"
      }`}
    >
      <input type="radio" checked={checked} onChange={onSelect} className="mt-0.5 !w-auto" />
      <span>
        <span className="block text-sm font-medium text-ink">{title}</span>
        {subtitle && <span className="block text-xs text-subtle">{subtitle}</span>}
      </span>
    </label>
  );
}

function KeywordChips({ keywords, onChange }: { keywords: string[]; onChange: (next: string[]) => void }) {
  const [adding, setAdding] = useState(false);
  const [draftValue, setDraftValue] = useState("");

  function commit() {
    const value = draftValue.trim();
    if (value && !keywords.includes(value)) onChange([...keywords, value]);
    setDraftValue("");
    setAdding(false);
  }

  return (
    <div>
      <div className="mb-1 text-sm">Words or phrases</div>
      <div className="mb-2 flex flex-wrap gap-2">
        {keywords.map((k) => (
          <span className="tag-chip" key={k}>
            {k}
            <button type="button" aria-label={`Remove ${k}`} onClick={() => onChange(keywords.filter((x) => x !== k))}>
              ×
            </button>
          </span>
        ))}
      </div>
      {adding ? (
        <div className="flex flex-col gap-2 rounded-xl border border-line p-3 sm:flex-row sm:items-center">
          <input
            type="text"
            value={draftValue}
            onChange={(e) => setDraftValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              }
            }}
            placeholder="Add a word or phrase"
            autoFocus
            style={{ marginTop: 0 }}
          />
          <div className="flex gap-2">
            <button type="button" className="btn-secondary btn-small min-h-11 flex-1 sm:flex-none" onClick={() => setAdding(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary btn-small min-h-11 flex-1 sm:flex-none" onClick={commit} disabled={!draftValue.trim()}>
              Add
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn-secondary btn-small min-h-11" onClick={() => setAdding(true)}>
          + Add phrase
        </button>
      )}
    </div>
  );
}

export interface CampaignEditorHandle {
  isDirty: boolean;
  save: () => Promise<boolean>;
  discard: () => void;
}

/** Automation Details subsection: one unified draft with an explicit Save/Discard bar (section 13), collapsible on mobile (section 13-15 of the mobile fix). Milestones/post-targeting keep their own immediate-save widgets, matching the reference's own per-widget save buttons. */
export const CampaignEditor = forwardRef<CampaignEditorHandle, { tenantId: string; campaign: Campaign; onChanged: () => void; onDirtyChange?: (dirty: boolean) => void }>(
  function CampaignEditor({ tenantId, campaign, onChanged, onDirtyChange }, ref) {
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

    useEffect(() => {
      onDirtyChange?.(isDirty);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isDirty]);

    // Reply variations — kept as its own immediate-save widget (matches the
    // reference's own "Save variations" button inside the Reply Settings card).
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
    const [targetAllPosts, setTargetAllPosts] = useState(campaign.targetMediaIds.length === 0);
    const [savingTargetMedia, setSavingTargetMedia] = useState(false);
    const [targetMediaError, setTargetMediaError] = useState<string | null>(null);
    const [addUrl, setAddUrl] = useState("");
    const [addingUrl, setAddingUrl] = useState(false);
    const [addUrlError, setAddUrlError] = useState<string | null>(null);

    useEffect(() => {
      setTargetMediaIds(campaign.targetMediaIds);
      setTargetAllPosts(campaign.targetMediaIds.length === 0);
    }, [campaign]);

    // Instagram can render a card when a selected target has a usable
    // thumbnail and both the journey title and sample copy fit Meta's
    // 80-character limits. Otherwise a valid HTTPS CTA becomes a button,
    // with very long copy falling back to plain text.
    const previewMedia = !targetAllPosts
      ? targetMediaIds
          .map((id) => observedMedia.find((media) => media.mediaId === id))
          .find((media) => Boolean(media?.thumbnailUrl))
      : undefined;
    const previewTitle = draft.name.trim() || "Your journey";
    const previewBody = draft.defaultReplyTemplate.trim() || "Here's the information you asked for.";
    const previewCtaUrl = draft.ctaLink.trim();
    const previewCtaReady = Boolean(previewCtaUrl) && isValidHttpsUrl(previewCtaUrl);
    const previewMode: "card" | "button" | "text" = !previewCtaReady
      ? "text"
      : previewMedia?.thumbnailUrl && previewTitle.length <= 80 && previewBody.length <= 80
        ? "card"
        : previewBody.length <= 640
          ? "button"
          : "text";

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

    const handleSaveChanges = useCallback(async (): Promise<boolean> => {
      const foundErrors = validateDraft(draft);
      setErrors(foundErrors);
      if (foundErrors.length > 0) return false;

      setSaving(true);
      try {
        await api.updateReplyConfig(tenantId, campaign.id, {
          name: draft.name.trim(),
          description: draft.description.trim() || null,
          triggerSource: draft.triggerSource,
          keywords: draft.keywords,
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
        return true;
      } catch (err) {
        setErrors([err instanceof Error ? err.message : "Failed to save changes"]);
        return false;
      } finally {
        setSaving(false);
      }
    }, [draft, tenantId, campaign, onChanged]);

    const handleDiscard = useCallback(() => {
      setDraft(draftFromCampaign(campaign));
      setErrors([]);
    }, [campaign]);

    useImperativeHandle(
      ref,
      () => ({ isDirty, save: handleSaveChanges, discard: handleDiscard }),
      [isDirty, handleSaveChanges, handleDiscard],
    );

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
        await api.setCampaignTargetMedia(tenantId, campaign.id, targetAllPosts ? [] : targetMediaIds);
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
        setMilestoneError(err instanceof Error ? err.message : "Couldn't save goals");
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
      } catch (err) {
        setNewFieldError(err instanceof Error ? err.message : "Failed to create field");
      } finally {
        setCreatingField(false);
      }
    }

    return (
      <div className="campaign-editor-page flex w-full flex-col gap-3 pb-4 md:gap-4">
        <Card title="Name and status" defaultOpen>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-[1fr_200px]">
            <div>
              <label>
                Automation name
                <input type="text" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </label>
              <label>
                Description
                <textarea
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  rows={2}
                  placeholder="What should this automation help with?"
                />
              </label>
            </div>
            <div>
              <div className="mb-1 text-sm">Reply status</div>
              <label className="flex min-h-11 items-center gap-2 rounded-xl border border-line px-3.5">
                <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} className="!w-auto" />
                {draft.enabled ? "Enabled" : "Paused"}
              </label>
              <p className="muted m-0 mt-1 text-xs leading-5">
                {campaign.published
                  ? "Saving this setting takes effect immediately for the live automation."
                  : "This draft won't reply until published. Publishing turns replies on."}
              </p>
            </div>
          </div>
        </Card>

        <Card title="When should it start?" defaultOpen>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <OptionCard
              checked={draft.triggerSource === "comment"}
              title="Comments only"
              subtitle="A word or phrase in a public comment"
              onSelect={() => setDraft({ ...draft, triggerSource: "comment" })}
            />
            <OptionCard
              checked={draft.triggerSource === "message"}
              title="Direct messages only"
              subtitle="A word or phrase in a direct message"
              onSelect={() => setDraft({ ...draft, triggerSource: "message" })}
            />
            <OptionCard checked={draft.triggerSource === "both"} title="Both" onSelect={() => setDraft({ ...draft, triggerSource: "both" })} />
          </div>

          <div className="mt-3">
            <KeywordChips keywords={draft.keywords} onChange={(keywords) => setDraft({ ...draft, keywords })} />
          </div>
        </Card>

        <Card title="How should it reply?" defaultOpen>
          <div className="mb-1 text-sm">Reply style</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <OptionCard checked={draft.replyMode === "ai_generated"} title="AI writes the reply" onSelect={() => setDraft({ ...draft, replyMode: "ai_generated" })} />
            <OptionCard checked={draft.replyMode === "rule_based"} title="Use a prewritten reply" onSelect={() => setDraft({ ...draft, replyMode: "rule_based" })} />
          </div>

          <label className="mt-2">
            Backup reply (used if SignalAI can't provide an AI reply)
            <textarea
              value={draft.defaultReplyTemplate}
              onChange={(e) => setDraft({ ...draft, defaultReplyTemplate: e.target.value })}
              rows={2}
            />
          </label>

          <div className="mb-1 mt-3 text-sm">Reply variations (optional)</div>
          <p className="muted small">One is picked at random instead of always using the default template above.</p>
          {replyTemplates.map((t, i) => (
            <div key={i} className="mb-2 flex flex-col gap-2 rounded-xl border border-line p-3 sm:flex-row sm:items-center sm:rounded-none sm:border-0 sm:p-0">
              <input
                type="text"
                placeholder={`Variation ${i + 1}`}
                value={t}
                onChange={(e) => {
                  const next = [...replyTemplates];
                  next[i] = e.target.value;
                  setReplyTemplates(next);
                }}
                style={{ marginTop: 0 }}
              />
              <button
                type="button"
                className="btn-secondary btn-small min-h-11 self-end sm:self-auto"
                onClick={() => setReplyTemplates(replyTemplates.filter((_, idx) => idx !== i))}
              >
                Remove
              </button>
            </div>
          ))}
          <div className="button-row">
            <button type="button" className="btn-secondary btn-small min-h-11" onClick={() => setReplyTemplates([...replyTemplates, ""])}>
              + Add variation
            </button>
            <button className="btn-primary btn-small min-h-11" onClick={saveReplyTemplates} disabled={savingReplyTemplates}>
              {savingReplyTemplates ? "Saving…" : "Save variations"}
            </button>
          </div>
          {replyTemplatesError && <div className="banner banner-error">{replyTemplatesError}</div>}

          <div className="mb-1 mt-2 text-sm">Reply Channel</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <OptionCard
              checked={draft.replyChannel === "dm"}
              title="Direct message only"
              subtitle="Private reply sent to the commenter"
              onSelect={() => setDraft({ ...draft, replyChannel: "dm" })}
            />
            <OptionCard
              checked={draft.replyChannel === "comment"}
              title="Public comment only"
              subtitle="Public response under the comment"
              onSelect={() => setDraft({ ...draft, replyChannel: "comment" })}
            />
            <OptionCard checked={draft.replyChannel === "both"} title="Both" onSelect={() => setDraft({ ...draft, replyChannel: "both" })} />
          </div>

          <label className="block">
            CTA Link (optional)
            <input
              type="url"
              aria-label="CTA link (HTTPS URL)"
              value={draft.ctaLink}
              onChange={(e) => setDraft({ ...draft, ctaLink: e.target.value })}
              placeholder="https://example.com/brochure"
            />
            <span className="muted small mt-1 block leading-5">
              An HTTPS link becomes an Instagram button. If a selected post has a thumbnail and the message fits the card limits, Instagram can show an image card instead.
            </span>
          </label>

          <div className="mt-4 rounded-xl border border-line bg-canvas/40 p-3.5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-ink">Instagram message preview</div>
                <p className="muted m-0 mt-0.5 text-xs">Sample uses the default reply; individual journey message steps can change the copy.</p>
              </div>
              <span className="pill" style={{ marginLeft: 0 }}>
                {previewMode === "card" ? "Image card" : previewMode === "button" ? "Button" : "Text only"}
              </span>
            </div>

            <div className="max-w-[340px] overflow-hidden rounded-2xl border border-line bg-card shadow-sm">
              {previewMode === "card" && previewMedia?.thumbnailUrl && (
                <img
                  src={previewMedia.thumbnailUrl}
                  alt=""
                  className="aspect-[1.6/1] w-full object-cover"
                />
              )}
              <div className="p-3.5">
                {previewMode === "card" && (
                  <div className="mb-1.5 text-sm font-semibold text-ink">{previewTitle}</div>
                )}
                <p className="m-0 whitespace-pre-wrap break-words text-sm leading-5 text-ink">{previewBody}</p>
                {(previewMode === "card" || previewMode === "button") && (
                  <a
                    href={previewCtaUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 flex min-h-10 items-center justify-center rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white no-underline"
                  >
                    View details ↗
                  </a>
                )}
              </div>
            </div>

            {previewCtaUrl && !previewCtaReady && (
              <p className="muted m-0 mt-2 text-xs" role="status">
                Interactive Instagram CTAs require a valid HTTPS URL. This value will not render as a button or card.
              </p>
            )}
            {previewCtaReady && previewMode === "text" && (
              <p className="muted m-0 mt-2 text-xs" role="status">
                This sample is too long for an Instagram CTA template, so it will be sent as plain text.
              </p>
            )}
            {previewCtaReady && previewMode === "button" && previewMedia?.thumbnailUrl && (
              <p className="muted m-0 mt-2 text-xs" role="status">
                The title and sample copy must each be 80 characters or fewer for the image-card layout. The current sample uses a button instead.
              </p>
            )}
            {!targetAllPosts && !previewMedia?.thumbnailUrl && (
              <p className="muted m-0 mt-2 text-xs">
                Choose a selected post with a thumbnail to preview the image-card layout.
              </p>
            )}
          </div>
        </Card>

        <Card title="AI reply preferences" defaultOpen={false}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label>
              Tone
              <select value={draft.tone} onChange={(e) => setDraft({ ...draft, tone: e.target.value as CampaignTone })}>
                {(Object.keys(TONE_LABEL) as CampaignTone[]).map((t) => (
                  <option key={t} value={t}>
                    {TONE_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Language
              <select value={draft.language} onChange={(e) => setDraft({ ...draft, language: e.target.value as CampaignLanguage })}>
                {(Object.keys(LANGUAGE_LABEL) as CampaignLanguage[]).map((l) => (
                  <option key={l} value={l}>
                    {LANGUAGE_LABEL[l]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-3 rounded-xl border border-line px-3.5 py-3">
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" checked={draft.useKnowledgeBase} onChange={(e) => setDraft({ ...draft, useKnowledgeBase: e.target.checked })} className="!w-auto" />
              <span className="text-sm font-medium text-ink">Use my business information</span>
            </label>
            <p className="muted small mt-1">
              {draft.useKnowledgeBase
                ? "SignalAI can use your uploaded documents, FAQs and pricing information when replying."
                : "AI replies will not use your uploaded documents."}
            </p>
          </div>
        </Card>

        {errors.length > 0 && (
          <div className="banner banner-error">
            {errors.map((e) => (
              <div key={e}>{e}</div>
            ))}
          </div>
        )}

        <div
          className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-end gap-2 border-t border-line bg-card px-4 py-3 shadow-sm md:sticky md:inset-x-auto md:z-auto md:-mx-1 md:rounded-xl md:border md:px-4 md:shadow-sm"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
        >
          {savedFlash && <span className="mr-auto text-sm text-ok-ink">Saved</span>}
          {isDirty && !savedFlash && <span className="mr-auto text-sm text-subtle">Unsaved changes</span>}
          <button type="button" className="btn-secondary min-h-11" onClick={handleDiscard} disabled={!isDirty || saving}>
            Discard
          </button>
          <button type="button" className="btn-primary min-h-11" onClick={handleSaveChanges} disabled={!isDirty || saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>

        <Card title="Which posts should it respond to?" defaultOpen={false}>
          <p className="muted small mt-0">Choose which posts and Reels can start this automation.</p>
          <OptionCard checked={targetAllPosts} title="All posts and Reels" onSelect={() => setTargetAllPosts(true)} />
          <OptionCard checked={!targetAllPosts} title="Selected posts" onSelect={() => setTargetAllPosts(false)} />

          {!targetAllPosts && (
            <>
              <form onSubmit={addPostByUrl} className="inline-form mt-2">
                <input type="text" aria-label="Post or Reel URL" placeholder="Paste a post or Reel URL to add it" value={addUrl} onChange={(e) => setAddUrl(e.target.value)} />
                <button type="submit" className="btn-secondary min-h-11" disabled={!addUrl.trim() || addingUrl}>
                  {addingUrl ? "Adding…" : "+ Add post"}
                </button>
              </form>
              {addUrlError && <div className="banner banner-error">{addUrlError}</div>}

              {observedMedia.length === 0 ? (
                <p className="muted">No posts yet — they'll show up here once someone comments, or add one by URL above.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {observedMedia.map((m) => (
                    <label
                      key={m.mediaId}
                      className={`flex items-start gap-3 rounded-xl border p-3 ${targetMediaIds.includes(m.mediaId) ? "border-accent bg-chip" : "border-line"}`}
                    >
                      <input
                        type="checkbox"
                        checked={targetMediaIds.includes(m.mediaId)}
                        onChange={() => toggleTargetMedia(m.mediaId)}
                        className="mt-1 !w-auto"
                      />
                      {m.thumbnailUrl ? (
                        <img src={m.thumbnailUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                      ) : (
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-chip text-xs text-subtle">—</span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-ink">{m.caption ? m.caption.split("\n")[0]!.slice(0, 80) : m.mediaId}</span>
                        <span className="muted small block">
                          {m.commentCount > 0 ? `${m.commentCount} comment${m.commentCount === 1 ? "" : "s"}` : "added by URL, no comments yet"}
                        </span>
                        {m.permalink && (
                          <a href={m.permalink} target="_blank" rel="noreferrer" className="link-button text-xs" onClick={(e) => e.stopPropagation()}>
                            View ↗
                          </a>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </>
          )}
          {targetMediaError && <div className="banner banner-error">{targetMediaError}</div>}
          <button type="button" className="btn-primary min-h-11 mt-2" onClick={saveTargetMedia} disabled={savingTargetMedia}>
            {savingTargetMedia ? "Saving…" : "Save post targeting"}
          </button>
        </Card>

        <Card title="Conversation goals" defaultOpen={false}>
          <p className="muted small mt-0">Add the goals you want to complete as the conversation progresses. You can also arrange them on the Flow tab.</p>
          {milestones.map((m, i) => {
            const availableFields = fieldDefinitions.filter((fd) => !m.captureFields.includes(fd.fieldKey));
            return (
              <div key={i} className="card" style={{ marginBottom: "0.75rem" }}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="pill pill-ok" style={{ marginLeft: 0, flexShrink: 0 }}>
                    Step {i + 1}
                  </span>
                </div>
                <input
                  type="text"
                  aria-label={`Goal ${i + 1} description`}
                  placeholder={`Goal ${i + 1}, e.g. "capture their email"`}
                  value={m.goalDescription}
                  onChange={(e) => {
                    const next = [...milestones];
                    next[i] = { ...next[i]!, goalDescription: e.target.value };
                    setMilestones(next);
                  }}
                />

                <div style={{ margin: "0.5rem 0" }}>
                  {m.captureFields.length === 0 ? (
                    <span className="muted small">No details selected for this goal yet.</span>
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
                    aria-label={`Details to collect for goal ${i + 1}`}
                    value=""
                    onChange={(e) => {
                      if (!e.target.value) return;
                      const next = [...milestones];
                      next[i] = { ...next[i]!, captureFields: [...next[i]!.captureFields, e.target.value] };
                      setMilestones(next);
                    }}
                  >
                    <option value="">+ Add detail to collect…</option>
                    {availableFields.map((fd) => (
                      <option key={fd.fieldKey} value={fd.fieldKey}>
                        {fd.label}
                      </option>
                    ))}
                  </select>
                )}

                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" aria-label={newFieldRow === i ? `Cancel adding a field for goal ${i + 1}` : `Add a new field for goal ${i + 1}`} className="btn-secondary btn-small min-h-11" onClick={() => toggleNewFieldRow(i)}>
                    {newFieldRow === i ? "Cancel" : "+ New field"}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-small min-h-11"
                    onClick={() => setMilestones(milestones.filter((_, idx) => idx !== i))}
                    disabled={milestones.length === 1}
                    aria-label={`Remove goal ${i + 1}`}
                  >
                    Remove
                  </button>
                </div>
                {newFieldRow === i && (
                  <form onSubmit={(e) => createFieldForRow(i, e)} className="inline-form mt-2">
                    <input type="text" aria-label="Field key" placeholder="Key, e.g. budget" value={newFieldKey} onChange={(e) => setNewFieldKey(e.target.value)} />
                    <input type="text" aria-label="Field label" placeholder="Label, e.g. Budget" value={newFieldLabel} onChange={(e) => setNewFieldLabel(e.target.value)} />
                    <select aria-label="Field type" value={newFieldType} onChange={(e) => setNewFieldType(e.target.value as FieldDefinitionValueType)}>
                      {VALUE_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="btn-primary btn-small min-h-11" disabled={!newFieldKey.trim() || !newFieldLabel.trim() || creatingField}>
                      {creatingField ? "Adding…" : "Add field"}
                    </button>
                  </form>
                )}
                {newFieldRow === i && newFieldError && <div className="banner banner-error">{newFieldError}</div>}
              </div>
            );
          })}
          <button type="button" className="btn-secondary btn-small min-h-11" onClick={() => setMilestones([...milestones, { goalDescription: "", captureFields: [] }])}>
            + Add goal
          </button>
          {milestoneError && <div className="banner banner-error">{milestoneError}</div>}
          <button type="button" className="btn-primary min-h-11" onClick={saveMilestones} disabled={savingMilestones} style={{ marginLeft: "0.5rem" }}>
            {savingMilestones ? "Saving…" : "Save goals"}
          </button>
        </Card>


        {/* Keeps the last section reachable above the fixed mobile save bar. */}
        <div className="h-20 md:hidden" aria-hidden="true" />
      </div>
    );
  },
);
