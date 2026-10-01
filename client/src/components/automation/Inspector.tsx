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
import {
  BotIcon,
  HandshakeIcon,
  InstagramMarkIcon,
  SendIcon,
} from "../icons";
import type { SelectedNode } from "./BuilderCanvas";

const VALUE_TYPES: { value: FieldDefinitionValueType; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "country", label: "Country" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "text", label: "Text" },
];

function PanelHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof BotIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-chip text-accent">
        <Icon className="h-4.5 w-4.5" />
      </span>

      <div className="min-w-0">
        <h3 className="m-0 text-[15px] font-semibold text-ink">{title}</h3>
        <p className="muted m-0 mt-1 text-[11px] leading-4">{description}</p>
      </div>
    </div>
  );
}

function SectionTabs({
  items,
  active,
  onChange,
}: {
  items: { key: string; label: string }[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="w-[122px] shrink-0 space-y-1 border-r border-line pr-3">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onChange(item.key)}
          className={`flex min-h-9 w-full items-center rounded-lg px-2.5 text-left text-[12px] ${
            active === item.key
              ? "bg-chip font-semibold text-accent"
              : "text-subtle hover:bg-chip hover:text-ink"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function TriggerPanel({
  tenantId,
  campaign,
  onCampaignChanged,
}: {
  tenantId: string;
  campaign: Campaign;
  onCampaignChanged: () => Promise<void> | void;
}) {
  const [tab, setTab] = useState("basic");
  const [baseType, setBaseType] = useState<"comment" | "message">(
    campaign.triggerSource === "message" ? "message" : "comment",
  );
  const [alsoDm, setAlsoDm] = useState(campaign.triggerSource === "both");
  const [keywords, setKeywords] = useState(campaign.keywords.join(", "));
  const [storyReplies, setStoryReplies] = useState(false);
  const [caseInsensitive, setCaseInsensitive] = useState(true);
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
      .map((keyword) => keyword.trim())
      .filter(Boolean);

    if (parsedKeywords.length === 0) {
      setError("Add at least one keyword.");
      return;
    }

    const triggerSource: TriggerSource =
      baseType === "message" ? "message" : alsoDm ? "both" : "comment";

    setSaving(true);
    setError(null);

    try {
      await api.updateReplyConfig(tenantId, campaign.id, {
        triggerSource,
        keywords: parsedKeywords,
      });
      await onCampaignChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save trigger");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex gap-5">
      <SectionTabs
        items={[
          { key: "basic", label: "Basic" },
          { key: "advanced", label: "Advanced" },
          { key: "ai", label: "AI Settings" },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="min-w-0 flex-1">
        {tab === "basic" ? (
          <>
            <PanelHeader
              icon={InstagramMarkIcon}
              title="Trigger"
              description="Starts the journey when someone comments or sends a DM."
            />

            <div className="mt-5 space-y-4">
              <div>
                <div className="text-[11px] font-semibold text-ink">Trigger type</div>

                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 text-left text-[12px] ${
                      baseType === "message"
                        ? "border-accent bg-chip text-ink"
                        : "border-line bg-card text-subtle"
                    }`}
                    onClick={() => setBaseType("message")}
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-full border border-accent">
                      {baseType === "message" && (
                        <span className="h-2.5 w-2.5 rounded-full bg-accent" />
                      )}
                    </span>
                    Direct message
                  </button>

                  <button
                    type="button"
                    className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 text-left text-[12px] ${
                      baseType === "comment"
                        ? "border-accent bg-chip text-ink"
                        : "border-line bg-card text-subtle"
                    }`}
                    onClick={() => setBaseType("comment")}
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-full border border-line">
                      {baseType === "comment" && (
                        <span className="h-2.5 w-2.5 rounded-full bg-accent" />
                      )}
                    </span>
                    Comment on post
                  </button>
                </div>
              </div>

              <label>
                <span className="text-[11px] font-semibold text-ink">
                  Keywords (comma separated)
                </span>
                <textarea
                  value={keywords}
                  onChange={(event) => setKeywords(event.target.value)}
                  rows={3}
                  className="!mt-1.5 !text-[12px]"
                />
              </label>

              <label className="flex items-center gap-2 !mb-0 text-[11px] text-subtle">
                <input
                  type="checkbox"
                  checked={storyReplies}
                  onChange={(event) => setStoryReplies(event.target.checked)}
                />
                Also trigger on story replies
              </label>

              <label className="flex items-center gap-2 !mb-0 text-[11px] text-subtle">
                <input
                  type="checkbox"
                  checked={caseInsensitive}
                  onChange={(event) => setCaseInsensitive(event.target.checked)}
                />
                Case insensitive matching
              </label>

              {baseType === "comment" && (
                <label className="flex items-center gap-2 !mb-0 text-[11px] text-subtle">
                  <input
                    type="checkbox"
                    checked={alsoDm}
                    onChange={(event) => setAlsoDm(event.target.checked)}
                  />
                  Also trigger on direct messages
                </label>
              )}

              {error && <div className="banner banner-error !mb-0">{error}</div>}

              <button
                type="button"
                className="btn-primary"
                onClick={() => void handleSave()}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </>
        ) : (
          <div>
            <h3 className="m-0 text-[15px] font-semibold text-ink">
              {tab === "advanced" ? "Advanced trigger settings" : "AI settings"}
            </h3>
            <p className="muted mt-2 text-[12px]">
              These controls are reserved for the next automation settings pass.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function MessagePanel({
  tenantId,
  campaign,
  onCampaignChanged,
}: {
  tenantId: string;
  campaign: Campaign;
  onCampaignChanged: () => Promise<void> | void;
}) {
  const [tab, setTab] = useState("basic");
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
      setMessage((value) => `${value}{name}`);
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
      await onCampaignChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save message");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex gap-5">
      <SectionTabs
        items={[
          { key: "basic", label: "Basic" },
          { key: "ai", label: "AI Settings" },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="min-w-0 flex-1">
        {tab === "basic" ? (
          <>
            <PanelHeader
              icon={BotIcon}
              title={campaign.replyMode === "ai_generated" ? "AI Reply" : "Reply Message"}
              description="The first reply sent once the trigger matches."
            />

            <div className="mt-5">
              <label>
                <span className="text-[11px] font-semibold text-ink">Message</span>
                <textarea
                  ref={textareaRef}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={5}
                  className="!mt-1.5 !text-[12px]"
                />
              </label>

              <button
                type="button"
                className="btn-secondary btn-small mb-4"
                onClick={insertVariable}
              >
                {"{ }"} Insert Variable
              </button>

              <label>
                <span className="text-[11px] font-semibold text-ink">AI Behavior</span>
                <select
                  value={tone}
                  onChange={(event) => setTone(event.target.value as CampaignTone)}
                >
                  {(Object.keys(TONE_LABEL) as CampaignTone[]).map((toneKey) => (
                    <option key={toneKey} value={toneKey}>
                      {TONE_LABEL[toneKey]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-2 text-[11px] text-subtle">
                <input
                  type="checkbox"
                  checked={useKnowledgeBase}
                  onChange={(event) => setUseKnowledgeBase(event.target.checked)}
                />
                Use knowledge base for context
              </label>

              {error && <div className="banner banner-error">{error}</div>}

              <button
                type="button"
                className="btn-primary"
                onClick={() => void handleSave()}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </>
        ) : (
          <div>
            <h3 className="m-0 text-[15px] font-semibold text-ink">AI Settings</h3>
            <p className="muted mt-2 text-[12px]">
              Tune tone and knowledge context from the Basic section.
            </p>
          </div>
        )}
      </div>
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
  onSaveMilestone: (
    index: number,
    updates: { goalDescription: string; captureFields: string[] },
  ) => Promise<void>;
}) {
  const [tab, setTab] = useState("basic");
  const [goalDescription, setGoalDescription] = useState(milestone.goalDescription);
  const [captureFields, setCaptureFields] = useState<string[]>(milestone.captureFields);
  const [description, setDescription] = useState("");
  const [showNewField, setShowNewField] = useState(false);
  const [newFieldKey, setNewFieldKey] = useState("");
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldType, setNewFieldType] = useState<FieldDefinitionValueType>("text");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setGoalDescription(milestone.goalDescription);
    setCaptureFields(milestone.captureFields);
    setDescription("");
  }, [milestone]);

  const availableFields = fieldDefinitions.filter(
    (field) => !captureFields.includes(field.fieldKey),
  );

  async function handleSave() {
    if (!goalDescription.trim()) {
      setError("Goal can't be empty.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await onSaveMilestone(index, {
        goalDescription: goalDescription.trim(),
        captureFields,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save goal");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateField(event: React.FormEvent) {
    event.preventDefault();

    if (!newFieldKey.trim() || !newFieldLabel.trim()) return;

    try {
      const created = await api.createFieldDefinition(tenantId, {
        fieldKey: newFieldKey.trim(),
        label: newFieldLabel.trim(),
        valueType: newFieldType,
      });

      onFieldDefinitionsChanged([...fieldDefinitions, created]);
      setCaptureFields((fields) => [...fields, created.fieldKey]);
      setShowNewField(false);
      setNewFieldKey("");
      setNewFieldLabel("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create field");
    }
  }

  return (
    <div className="flex gap-5">
      <SectionTabs
        items={[
          { key: "basic", label: "Basic" },
          { key: "capture", label: "Capture Fields" },
          { key: "validation", label: "Validation" },
          { key: "success", label: "Success Message" },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="min-w-0 flex-1">
        {tab === "basic" && (
          <>
            <PanelHeader
              icon={BotIcon}
              title={`Goal ${index + 1}`}
              description="A conversational goal the AI works toward."
            />

            <div className="mt-5">
              <label>
                <span className="text-[11px] font-semibold text-ink">Goal title</span>
                <input
                  value={goalDescription}
                  onChange={(event) => setGoalDescription(event.target.value)}
                  className="!mt-1.5 !text-[12px]"
                />
              </label>

              <label>
                <span className="text-[11px] font-semibold text-ink">
                  Description (optional)
                </span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={3}
                  placeholder="Describe what this goal should accomplish."
                  className="!mt-1.5 !text-[12px]"
                />
              </label>

              <p className="muted m-0 mb-4 text-[10px]">
                The current journey model stores one goal description; the title above is the persisted goal text.
              </p>

              {error && <div className="banner banner-error">{error}</div>}

              <button
                type="button"
                className="btn-primary"
                onClick={() => void handleSave()}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </>
        )}

        {tab === "capture" && (
          <div>
            <h3 className="m-0 text-[15px] font-semibold text-ink">Capture Fields</h3>
            <p className="muted m-0 mt-1 text-[11px]">
              Decide which structured values this goal captures.
            </p>

            <div className="mt-4 space-y-2">
              {captureFields.map((fieldKey) => (
                <div
                  key={fieldKey}
                  className="flex items-center justify-between rounded-lg border border-line px-3 py-2"
                >
                  <span className="text-[12px] text-ink">
                    {fieldDefinitions.find((field) => field.fieldKey === fieldKey)?.label ?? fieldKey}
                  </span>
                  <button
                    type="button"
                    className="text-subtle hover:text-ink"
                    onClick={() =>
                      setCaptureFields((fields) =>
                        fields.filter((field) => field !== fieldKey),
                      )
                    }
                  >
                    ×
                  </button>
                </div>
              ))}

              {availableFields.length > 0 && (
                <select
                  value=""
                  onChange={(event) => {
                    if (!event.target.value) return;
                    setCaptureFields((fields) => [...fields, event.target.value]);
                  }}
                >
                  <option value="">+ Add field to capture…</option>
                  {availableFields.map((field) => (
                    <option key={field.fieldKey} value={field.fieldKey}>
                      {field.label}
                    </option>
                  ))}
                </select>
              )}

              <button
                type="button"
                className="btn-secondary btn-small"
                onClick={() => setShowNewField((value) => !value)}
              >
                {showNewField ? "Cancel" : "+ Add field"}
              </button>

              {showNewField && (
                <form onSubmit={handleCreateField} className="space-y-2">
                  <input
                    value={newFieldKey}
                    onChange={(event) => setNewFieldKey(event.target.value)}
                    placeholder="Key, e.g. budget"
                    className="!text-[12px]"
                  />
                  <input
                    value={newFieldLabel}
                    onChange={(event) => setNewFieldLabel(event.target.value)}
                    placeholder="Label, e.g. Budget"
                    className="!text-[12px]"
                  />
                  <select
                    value={newFieldType}
                    onChange={(event) =>
                      setNewFieldType(event.target.value as FieldDefinitionValueType)
                    }
                  >
                    {VALUE_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="btn-primary btn-small"
                    disabled={!newFieldKey.trim() || !newFieldLabel.trim()}
                  >
                    Add field
                  </button>
                </form>
              )}

              {error && <div className="banner banner-error">{error}</div>}

              <button
                type="button"
                className="btn-primary mt-3"
                onClick={() => void handleSave()}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        )}

        {(tab === "validation" || tab === "success") && (
          <div>
            <h3 className="m-0 text-[15px] font-semibold text-ink">
              {tab === "validation" ? "Validation" : "Success Message"}
            </h3>
            <p className="muted m-0 mt-2 text-[12px]">
              This configuration surface is reserved for the next milestone engine pass.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ActionPanel({
  tenantId,
  campaign,
  action,
}: {
  tenantId: string;
  campaign: Campaign;
  action: "handoff" | "link";
}) {
  if (action === "link") {
    return (
      <div>
        <PanelHeader
          icon={SendIcon}
          title="Send Link"
          description="Sends the campaign CTA link as a reply."
        />
        <p className="mt-5 text-[12px]">
          Link:{" "}
          <a href={campaign.ctaLink ?? undefined} target="_blank" rel="noreferrer">
            {campaign.ctaLink ?? "Not configured"}
          </a>
        </p>
        <p className="muted text-[11px]">
          Edit this in the{" "}
          <Link to={`/dashboard/${tenantId}/automation/journeys/${campaign.id}`}>
            journey details
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div>
      <PanelHeader
        icon={HandshakeIcon}
        title="Handoff to Human"
        description="Pauses the AI when a teammate should take over."
      />
      <p className="muted mt-5 text-[12px] leading-5">
        Handoff happens automatically when the AI cannot confidently continue.
      </p>
      <Link
        to={`/dashboard/${tenantId}/settings`}
        className="text-[11px] font-medium text-accent"
      >
        Configure guardrails in Settings →
      </Link>
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
  onCampaignChanged: () => Promise<void> | void;
  onSaveMilestone: (
    index: number,
    updates: { goalDescription: string; captureFields: string[] },
  ) => Promise<void>;
  onFieldDefinitionsChanged: (defs: FieldDefinition[]) => void;
}) {
  if (selectedNode.type === "trigger") {
    return (
      <TriggerPanel
        tenantId={tenantId}
        campaign={campaign}
        onCampaignChanged={onCampaignChanged}
      />
    );
  }

  if (selectedNode.type === "message") {
    return (
      <MessagePanel
        tenantId={tenantId}
        campaign={campaign}
        onCampaignChanged={onCampaignChanged}
      />
    );
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

  return (
    <ActionPanel
      tenantId={tenantId}
      campaign={campaign}
      action={selectedNode.action}
    />
  );
}
