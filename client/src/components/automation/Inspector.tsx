import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  TONE_LABEL,
  type Campaign,
  type CampaignTone,
  type FieldDefinition,
  type FieldDefinitionValueType,
  type Milestone,
  type TriggerSource,
} from "../../api";
import { BotIcon, HandshakeIcon, InstagramMarkIcon, SendIcon } from "../icons";
import type { SelectedNode } from "./BuilderCanvas";

const VALUE_TYPES: { value: FieldDefinitionValueType; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "country", label: "Country" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "text", label: "Text" },
];

function InspectorHeader({ icon: Icon, title, description }: { icon: typeof BotIcon; title: string; description: string }) {
  return (
    <div className="mb-4 flex items-start gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-chip text-accent">
        <Icon className="h-4.5 w-4.5" />
      </span>
      <div>
        <h3 className="m-0 text-base font-semibold text-ink">{title}</h3>
        <p className="muted small m-0 mt-0.5">{description}</p>
      </div>
    </div>
  );
}

function TriggerPanel({ tenantId, campaign, onCampaignChanged }: { tenantId: string; campaign: Campaign; onCampaignChanged: () => void }) {
  const [baseType, setBaseType] = useState<"comment" | "message">(campaign.triggerSource === "message" ? "message" : "comment");
  const [alsoDm, setAlsoDm] = useState(campaign.triggerSource === "both");
  const [keywords, setKeywords] = useState(campaign.keywords.join(", "));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBaseType(campaign.triggerSource === "message" ? "message" : "comment");
    setAlsoDm(campaign.triggerSource === "both");
    setKeywords(campaign.keywords.join(", "));
  }, [campaign]);

  async function handleSave() {
    const parsedKeywords = keywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    if (parsedKeywords.length === 0) {
      setError("Add at least one keyword.");
      return;
    }
    const triggerSource: TriggerSource = baseType === "message" ? "message" : alsoDm ? "both" : "comment";
    setSaving(true);
    setError(null);
    try {
      await api.updateReplyConfig(tenantId, campaign.id, { triggerSource, keywords: parsedKeywords });
      onCampaignChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save trigger");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <InspectorHeader
        icon={InstagramMarkIcon}
        title="Trigger"
        description="Starts the journey when someone comments on your post or sends a DM."
      />

      <label>
        Trigger Type
        <select value={baseType} onChange={(e) => setBaseType(e.target.value as "comment" | "message")}>
          <option value="comment">Comment on post or Reel</option>
          <option value="message">Direct message</option>
        </select>
      </label>

      <label>
        Keywords (comma separated)
        <textarea value={keywords} onChange={(e) => setKeywords(e.target.value)} rows={3} />
      </label>

      <label className="radio-row" style={{ opacity: baseType === "message" ? 0.5 : 1 }}>
        <input
          type="checkbox"
          checked={baseType === "message" ? true : alsoDm}
          disabled={baseType === "message"}
          onChange={(e) => setAlsoDm(e.target.checked)}
        />
        Also trigger on direct messages
      </label>

      {error && <div className="banner banner-error">{error}</div>}
      <button type="button" className="btn-primary btn-small" onClick={handleSave} disabled={saving}>
        {saving ? "Saving…" : "Save trigger"}
      </button>
    </div>
  );
}

function MessagePanel({ tenantId, campaign, onCampaignChanged }: { tenantId: string; campaign: Campaign; onCampaignChanged: () => void }) {
  const [message, setMessage] = useState(campaign.defaultReplyTemplate);
  const [tone, setTone] = useState<CampaignTone>(campaign.tone);
  const [useKnowledgeBase, setUseKnowledgeBase] = useState(campaign.useKnowledgeBase);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setMessage(campaign.defaultReplyTemplate);
    setTone(campaign.tone);
    setUseKnowledgeBase(campaign.useKnowledgeBase);
  }, [campaign]);

  function insertVariable() {
    const el = textareaRef.current;
    if (!el) {
      setMessage((m) => `${m}{name}`);
      return;
    }
    const start = el.selectionStart ?? message.length;
    const end = el.selectionEnd ?? message.length;
    const next = `${message.slice(0, start)}{name}${message.slice(end)}`;
    setMessage(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + 6, start + 6);
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await api.updateReplyConfig(tenantId, campaign.id, {
        defaultReplyTemplate: message,
        tone,
        useKnowledgeBase,
      });
      onCampaignChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save message");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <InspectorHeader
        icon={BotIcon}
        title={campaign.replyMode === "ai_generated" ? "AI Message" : "Reply Message"}
        description="The first reply sent once the trigger matches."
      />

      <label>
        Message
        <textarea ref={textareaRef} value={message} onChange={(e) => setMessage(e.target.value)} rows={4} />
      </label>
      <button type="button" className="btn-secondary btn-small" onClick={insertVariable} style={{ marginBottom: "0.9rem" }}>
        {"{ }"} Insert Variable
      </button>

      <label>
        AI Behavior
        <select value={tone} onChange={(e) => setTone(e.target.value as CampaignTone)}>
          {(Object.keys(TONE_LABEL) as CampaignTone[]).map((t) => (
            <option key={t} value={t}>
              {TONE_LABEL[t]}
            </option>
          ))}
        </select>
      </label>

      <label className="radio-row">
        <input type="checkbox" checked={useKnowledgeBase} onChange={(e) => setUseKnowledgeBase(e.target.checked)} />
        Use knowledge base for context
      </label>

      {error && <div className="banner banner-error">{error}</div>}
      <button type="button" className="btn-primary btn-small" onClick={handleSave} disabled={saving}>
        {saving ? "Saving…" : "Save message"}
      </button>
    </div>
  );
}

function MilestonePanel({
  tenantId,
  milestone,
  index,
  fieldDefinitions,
  onFieldDefinitionsChanged,
  onSaveMilestone,
}: {
  tenantId: string;
  milestone: Milestone;
  index: number;
  fieldDefinitions: FieldDefinition[];
  onFieldDefinitionsChanged: (defs: FieldDefinition[]) => void;
  onSaveMilestone: (index: number, updates: { goalDescription: string; captureFields: string[] }) => Promise<void>;
}) {
  const [goalDescription, setGoalDescription] = useState(milestone.goalDescription);
  const [captureFields, setCaptureFields] = useState<string[]>(milestone.captureFields);
  const [showNewField, setShowNewField] = useState(false);
  const [newFieldKey, setNewFieldKey] = useState("");
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldType, setNewFieldType] = useState<FieldDefinitionValueType>("text");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setGoalDescription(milestone.goalDescription);
    setCaptureFields(milestone.captureFields);
  }, [milestone]);

  const availableFields = fieldDefinitions.filter((fd) => !captureFields.includes(fd.fieldKey));

  async function handleSave() {
    if (!goalDescription.trim()) {
      setError("Goal can't be empty.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSaveMilestone(index, { goalDescription: goalDescription.trim(), captureFields });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save milestone");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateField(e: React.FormEvent) {
    e.preventDefault();
    if (!newFieldKey.trim() || !newFieldLabel.trim()) return;
    try {
      const created = await api.createFieldDefinition(tenantId, {
        fieldKey: newFieldKey.trim(),
        label: newFieldLabel.trim(),
        valueType: newFieldType,
      });
      onFieldDefinitionsChanged([...fieldDefinitions, created]);
      setCaptureFields((prev) => [...prev, created.fieldKey]);
      setShowNewField(false);
      setNewFieldKey("");
      setNewFieldLabel("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create field");
    }
  }

  return (
    <div>
      <InspectorHeader
        icon={BotIcon}
        title={`Milestone ${index + 1}`}
        description="A conversational goal the AI works toward, in order."
      />

      <label>
        Goal
        <input type="text" value={goalDescription} onChange={(e) => setGoalDescription(e.target.value)} />
      </label>

      <div className="mb-1 text-sm">Captured fields</div>
      <div style={{ marginBottom: "0.6rem" }}>
        {captureFields.length === 0 ? (
          <span className="muted small">Nothing captured by this goal yet.</span>
        ) : (
          captureFields.map((fieldKey) => (
            <span className="tag-chip" key={fieldKey}>
              {fieldDefinitions.find((fd) => fd.fieldKey === fieldKey)?.label ?? fieldKey}
              <button type="button" aria-label={`Remove ${fieldKey}`} onClick={() => setCaptureFields((prev) => prev.filter((k) => k !== fieldKey))}>
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
            setCaptureFields((prev) => [...prev, e.target.value]);
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

      <button type="button" className="btn-secondary btn-small" onClick={() => setShowNewField((v) => !v)} style={{ margin: "0.5rem 0" }}>
        {showNewField ? "Cancel" : "+ New field"}
      </button>
      {showNewField && (
        <form onSubmit={handleCreateField} className="inline-form">
          <input type="text" placeholder="Key, e.g. budget" value={newFieldKey} onChange={(e) => setNewFieldKey(e.target.value)} />
          <input type="text" placeholder="Label, e.g. Budget" value={newFieldLabel} onChange={(e) => setNewFieldLabel(e.target.value)} />
          <select value={newFieldType} onChange={(e) => setNewFieldType(e.target.value as FieldDefinitionValueType)}>
            {VALUE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-primary btn-small" disabled={!newFieldKey.trim() || !newFieldLabel.trim()}>
            Add field
          </button>
        </form>
      )}

      {error && <div className="banner banner-error">{error}</div>}
      <button type="button" className="btn-primary btn-small" onClick={handleSave} disabled={saving}>
        {saving ? "Saving…" : "Save milestone"}
      </button>
    </div>
  );
}

function ActionPanel({ tenantId, campaign, action }: { tenantId: string; campaign: Campaign; action: "handoff" | "link" }) {
  if (action === "link") {
    return (
      <div>
        <InspectorHeader icon={SendIcon} title="Send Link" description="Sends the campaign's CTA link as a reply." />
        <p className="small">
          Link: <a href={campaign.ctaLink ?? undefined} target="_blank" rel="noreferrer">{campaign.ctaLink}</a>
        </p>
        <p className="muted small">
          Edit this in the <Link to={`/dashboard/${tenantId}/automation`}>Details tab</Link>'s "CTA link" field.
        </p>
      </div>
    );
  }
  return (
    <div>
      <InspectorHeader icon={HandshakeIcon} title="Handoff to Human" description="Pauses the AI for this lead so a teammate can take over." />
      <p className="small">
        This happens automatically whenever the AI detects it can't confidently continue — e.g. an escalation trigger,
        or a question outside the knowledge base.
      </p>
      <p className="muted small">
        Escalation triggers are configured in <Link to={`/dashboard/${tenantId}/settings`}>Settings → Guardrails</Link>.
      </p>
    </div>
  );
}

export function Inspector({
  tenantId,
  campaign,
  milestones,
  fieldDefinitions,
  selectedNode,
  onCampaignChanged,
  onSaveMilestone,
  onFieldDefinitionsChanged,
}: {
  tenantId: string;
  campaign: Campaign;
  milestones: Milestone[];
  fieldDefinitions: FieldDefinition[];
  selectedNode: SelectedNode;
  onCampaignChanged: () => void;
  onSaveMilestone: (index: number, updates: { goalDescription: string; captureFields: string[] }) => Promise<void>;
  onFieldDefinitionsChanged: (defs: FieldDefinition[]) => void;
}) {
  if (selectedNode.type === "trigger") {
    return <TriggerPanel tenantId={tenantId} campaign={campaign} onCampaignChanged={onCampaignChanged} />;
  }
  if (selectedNode.type === "message") {
    return <MessagePanel tenantId={tenantId} campaign={campaign} onCampaignChanged={onCampaignChanged} />;
  }
  if (selectedNode.type === "milestone") {
    const milestone = milestones[selectedNode.milestoneIndex];
    if (!milestone) return null;
    return (
      <MilestonePanel
        tenantId={tenantId}
        milestone={milestone}
        index={selectedNode.milestoneIndex}
        fieldDefinitions={fieldDefinitions}
        onFieldDefinitionsChanged={onFieldDefinitionsChanged}
        onSaveMilestone={onSaveMilestone}
      />
    );
  }
  return <ActionPanel tenantId={tenantId} campaign={campaign} action={selectedNode.action} />;
}
