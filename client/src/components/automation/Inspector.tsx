import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
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

export interface InspectorHandle {
  save: () => Promise<boolean>;
  discard: () => void;
  dirty: boolean;
  saving: boolean;
  canSave: boolean;
}

type EditorActions = InspectorHandle;

/**
 * Sends current editor state to the dialog without creating a render loop.
 * The ref always points to the latest save/discard closures.
 */
function useEditorActions(
  actions: EditorActions,
  onActionsChange?: (actions: EditorActions) => void,
) {
  const latest = useRef(actions);
  latest.current = actions;

  useEffect(() => {
    const bridge: EditorActions = {
      save: () => latest.current.save(),
      discard: () => latest.current.discard(),
      get dirty() {
        return latest.current.dirty;
      },
      get saving() {
        return latest.current.saving;
      },
      get canSave() {
        return latest.current.canSave;
      },
    };

    onActionsChange?.(bridge);
  }, [actions.dirty, actions.saving, actions.canSave, onActionsChange]);
}

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
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-chip text-accent">
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
    <nav className="w-[128px] shrink-0 border-r border-line pr-3">
      <div className="space-y-1">
        {items.map((item) => {
          const selected = active === item.key;

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onChange(item.key)}
              className={`flex min-h-10 w-full items-center rounded-lg px-3 text-left text-[12px] transition-colors ${
                selected
                  ? "bg-chip font-semibold text-accent"
                  : "text-subtle hover:bg-chip hover:text-ink"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function TriggerEditor({
  tenantId,
  campaign,
  onCampaignChanged,
  onActionsChange,
}: {
  tenantId: string;
  campaign: Campaign;
  onCampaignChanged: () => Promise<void> | void;
  onActionsChange?: (actions: EditorActions) => void;
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

  const original = useMemo<{
    baseType: "comment" | "message";
    alsoDm: boolean;
    keywords: string;
  }>(
    () => ({
      baseType:
        campaign.triggerSource === "message" ? "message" : "comment",
      alsoDm: campaign.triggerSource === "both",
      keywords: campaign.keywords.join(", "),
    }),
    [campaign],
  );

  const dirty =
    baseType !== original.baseType ||
    alsoDm !== original.alsoDm ||
    keywords !== original.keywords;

  const discard = () => {
    setBaseType(original.baseType);
    setAlsoDm(original.alsoDm);
    setKeywords(original.keywords);
    setStoryReplies(false);
    setCaseInsensitive(true);
    setError(null);
  };

  const save = async (): Promise<boolean> => {
    const parsedKeywords = keywords
      .split(",")
      .map((keyword) => keyword.trim())
      .filter(Boolean);

    if (parsedKeywords.length === 0) {
      setError("Add at least one keyword.");
      return false;
    }

    const triggerSource: TriggerSource =
      baseType === "message"
        ? "message"
        : alsoDm
          ? "both"
          : "comment";

    setSaving(true);
    setError(null);

    try {
      await api.updateReplyConfig(tenantId, campaign.id, {
        triggerSource,
        keywords: parsedKeywords,
      });
      await onCampaignChanged();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save trigger");
      return false;
    } finally {
      setSaving(false);
    }
  };

  useEditorActions(
    {
      save,
      discard,
      dirty,
      saving,
      canSave: true,
    },
    onActionsChange,
  );

  return (
    <div className="flex gap-6">
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
              description="Choose when this journey should start."
            />

            <div className="mt-6 space-y-5">
              <fieldset className="m-0 border-0 p-0">
                <legend className="text-[11px] font-semibold text-ink">
                  Trigger type
                </legend>

                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {[
                    { value: "message" as const, label: "Direct message" },
                    { value: "comment" as const, label: "Comment on post" },
                  ].map((option) => {
                    const selected = baseType === option.value;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 text-left text-[12px] ${
                          selected
                            ? "border-accent/40 bg-chip text-ink"
                            : "border-line bg-card text-subtle"
                        }`}
                        onClick={() => setBaseType(option.value)}
                      >
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                            selected ? "border-accent" : "border-line"
                          }`}
                        >
                          {selected && (
                            <span className="h-2.5 w-2.5 rounded-full bg-accent" />
                          )}
                        </span>
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <label className="block">
                <span className="text-[11px] font-semibold text-ink">
                  Keywords{" "}
                  <span className="font-normal text-subtle">
                    (comma separated)
                  </span>
                </span>
                <textarea
                  value={keywords}
                  onChange={(event) => setKeywords(event.target.value)}
                  rows={3}
                  placeholder="details, signalAI, demo"
                  className="!mt-1.5 !min-h-[84px] !text-[13px]"
                />
              </label>

              <div className="space-y-3">
                <label className="flex items-start gap-2 text-[11px] leading-4 text-subtle">
                  <input
                    type="checkbox"
                    checked={storyReplies}
                    onChange={(event) =>
                      setStoryReplies(event.target.checked)
                    }
                  />
                  <span>Also trigger on story replies</span>
                </label>

                <label className="flex items-start gap-2 text-[11px] leading-4 text-subtle">
                  <input
                    type="checkbox"
                    checked={caseInsensitive}
                    onChange={(event) =>
                      setCaseInsensitive(event.target.checked)
                    }
                  />
                  <span>Case insensitive matching</span>
                </label>

                {baseType === "comment" && (
                  <label className="flex items-start gap-2 text-[11px] leading-4 text-subtle">
                    <input
                      type="checkbox"
                      checked={alsoDm}
                      onChange={(event) =>
                        setAlsoDm(event.target.checked)
                      }
                    />
                    <span>Also trigger on direct messages</span>
                  </label>
                )}
              </div>

              {error && <div className="banner banner-error">{error}</div>}
            </div>
          </>
        ) : (
          <>
            <h3 className="m-0 text-[15px] font-semibold text-ink">
              {tab === "advanced" ? "Advanced" : "AI Settings"}
            </h3>
            <p className="muted m-0 mt-2 max-w-md text-[12px] leading-5">
              Additional trigger controls will appear here as they become
              available.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function MessageEditor({
  tenantId,
  campaign,
  onCampaignChanged,
  onActionsChange,
}: {
  tenantId: string;
  campaign: Campaign;
  onCampaignChanged: () => Promise<void> | void;
  onActionsChange?: (actions: EditorActions) => void;
}) {
  const [tab, setTab] = useState("basic");
  const [message, setMessage] = useState(campaign.defaultReplyTemplate);
  const [tone, setTone] = useState<CampaignTone>(campaign.tone);
  const [useKnowledgeBase, setUseKnowledgeBase] = useState(
    campaign.useKnowledgeBase,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setMessage(campaign.defaultReplyTemplate);
    setTone(campaign.tone);
    setUseKnowledgeBase(campaign.useKnowledgeBase);
  }, [campaign]);

  const original = useMemo(
    () => ({
      message: campaign.defaultReplyTemplate,
      tone: campaign.tone,
      useKnowledgeBase: campaign.useKnowledgeBase,
    }),
    [campaign],
  );

  const dirty =
    message !== original.message ||
    tone !== original.tone ||
    useKnowledgeBase !== original.useKnowledgeBase;

  const discard = () => {
    setMessage(original.message);
    setTone(original.tone);
    setUseKnowledgeBase(original.useKnowledgeBase);
    setError(null);
  };

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

  const save = async (): Promise<boolean> => {
    setSaving(true);
    setError(null);

    try {
      await api.updateReplyConfig(tenantId, campaign.id, {
        defaultReplyTemplate: message,
        tone,
        useKnowledgeBase,
      });
      await onCampaignChanged();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save message");
      return false;
    } finally {
      setSaving(false);
    }
  };

  useEditorActions(
    {
      save,
      discard,
      dirty,
      saving,
      canSave: true,
    },
    onActionsChange,
  );

  return (
    <div className="flex gap-6">
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
              description="Configure the response sent after this step."
            />

            <div className="mt-6 space-y-5">
              <label className="block">
                <span className="text-[11px] font-semibold text-ink">
                  Message
                </span>
                <textarea
                  ref={textareaRef}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={6}
                  placeholder="Write the reply you want leads to receive."
                  className="!mt-1.5 !min-h-[128px] !text-[13px]"
                />
              </label>

              <button
                type="button"
                className="btn-secondary btn-small"
                onClick={insertVariable}
              >
                {"{ }"} Insert variable
              </button>

              <label className="block">
                <span className="text-[11px] font-semibold text-ink">
                  AI behavior
                </span>
                <select
                  value={tone}
                  onChange={(event) =>
                    setTone(event.target.value as CampaignTone)
                  }
                  className="!mt-1.5"
                >
                  {(Object.keys(TONE_LABEL) as CampaignTone[]).map((toneKey) => (
                    <option key={toneKey} value={toneKey}>
                      {TONE_LABEL[toneKey]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-start gap-2 text-[11px] leading-4 text-subtle">
                <input
                  type="checkbox"
                  checked={useKnowledgeBase}
                  onChange={(event) =>
                    setUseKnowledgeBase(event.target.checked)
                  }
                />
                <span>Use knowledge base for context</span>
              </label>
            </div>
          </>
        ) : (
          <>
            <h3 className="m-0 text-[15px] font-semibold text-ink">
              AI Settings
            </h3>
            <p className="muted m-0 mt-2 max-w-md text-[12px] leading-5">
              Configure tone and knowledge context from the Basic tab.
            </p>
          </>
        )}

        {error && <div className="banner banner-error mt-5">{error}</div>}
      </div>
    </div>
  );
}

function GoalEditor({
  tenantId,
  milestone,
  index,
  fieldDefinitions,
  onFieldDefinitionsChanged,
  onSaveMilestone,
  onActionsChange,
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
  onActionsChange?: (actions: EditorActions) => void;
}) {
  const [tab, setTab] = useState("basic");
  const [goalDescription, setGoalDescription] = useState(
    milestone.goalDescription,
  );
  const [captureFields, setCaptureFields] = useState<string[]>(
    milestone.captureFields,
  );
  const [showNewField, setShowNewField] = useState(false);
  const [newFieldKey, setNewFieldKey] = useState("");
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldType, setNewFieldType] =
    useState<FieldDefinitionValueType>("text");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setGoalDescription(milestone.goalDescription);
    setCaptureFields(milestone.captureFields);
  }, [milestone]);

  const original = useMemo(
    () => ({
      goalDescription: milestone.goalDescription,
      captureFields: milestone.captureFields,
    }),
    [milestone],
  );

  const dirty =
    goalDescription !== original.goalDescription ||
    JSON.stringify(captureFields) !== JSON.stringify(original.captureFields);

  const discard = () => {
    setGoalDescription(original.goalDescription);
    setCaptureFields([...original.captureFields]);
    setError(null);
    setShowNewField(false);
  };

  const save = async (): Promise<boolean> => {
    const nextGoal = goalDescription.trim();

    if (!nextGoal) {
      setError("Goal title cannot be empty.");
      return false;
    }

    setSaving(true);
    setError(null);

    try {
      await onSaveMilestone(index, {
        goalDescription: nextGoal,
        captureFields,
      });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save goal");
      return false;
    } finally {
      setSaving(false);
    }
  };

  useEditorActions(
    {
      save,
      discard,
      dirty,
      saving,
      canSave: true,
    },
    onActionsChange,
  );

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
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create field");
    }
  }

  const fieldByKey = useMemo(
    () =>
      new Map(fieldDefinitions.map((field) => [field.fieldKey, field])),
    [fieldDefinitions],
  );

  const availableFields = fieldDefinitions.filter(
    (field) => !captureFields.includes(field.fieldKey),
  );

  return (
    <div className="flex gap-6">
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
          <div className="max-w-[590px]">
            <div className="space-y-5">
              <label className="block">
                <span className="text-[11px] font-semibold text-ink">
                  Goal title
                </span>
                <input
                  value={goalDescription}
                  onChange={(event) =>
                    setGoalDescription(event.target.value)
                  }
                  className="!mt-1.5 !w-full !text-[13px]"
                  aria-label="Goal title"
                />
              </label>

              <div>
                <span className="text-[11px] font-semibold text-ink">
                  Description
                </span>
                <p className="muted m-0 mt-1.5 text-[12px] leading-5">
                  Conversational goal the AI works toward.
                </p>
              </div>
            </div>
          </div>
        )}

        {tab === "capture" && (
          <div className="max-w-[620px]">
            <div>
              <h3 className="m-0 text-[15px] font-semibold text-ink">
                Captured fields
              </h3>
              <p className="muted m-0 mt-1 text-[11px]">
                Structured values this goal should capture.
              </p>
            </div>

            <div className="mt-4 space-y-3">
              {captureFields.length === 0 ? (
                <div className="rounded-xl border border-dashed border-line px-4 py-7 text-center">
                  <p className="m-0 text-[12px] font-medium text-ink">
                    No captured fields yet
                  </p>
                  <p className="muted m-0 mt-1 text-[11px]">
                    Add a field when this goal needs structured information.
                  </p>
                </div>
              ) : (
                captureFields.map((fieldKey) => {
                  const field = fieldByKey.get(fieldKey);

                  return (
                    <div
                      key={fieldKey}
                      className="rounded-xl border border-line bg-card px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="break-words text-[12px] font-semibold text-ink">
                            {fieldKey}
                          </div>
                          <div className="mt-1 break-words text-[11px] leading-4 text-subtle">
                            {field?.label ?? fieldKey}
                          </div>

                          {field && (
                            <span className="mt-2 inline-flex rounded-md bg-chip px-2 py-1 text-[10px] font-medium text-subtle">
                              {field.valueType}
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-medium text-subtle hover:bg-chip hover:text-ink"
                          onClick={() =>
                            setCaptureFields((fields) =>
                              fields.filter((item) => item !== fieldKey),
                            )
                          }
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })
              )}

              {availableFields.length > 0 && (
                <select
                  value=""
                  onChange={(event) => {
                    if (!event.target.value) return;
                    setCaptureFields((fields) => [
                      ...fields,
                      event.target.value,
                    ]);
                  }}
                  className="!text-[12px]"
                  aria-label="Add captured field"
                >
                  <option value="">+ Add field</option>
                  {availableFields.map((field) => (
                    <option key={field.fieldKey} value={field.fieldKey}>
                      {field.label} ({field.fieldKey})
                    </option>
                  ))}
                </select>
              )}

              <button
                type="button"
                className="btn-secondary btn-small"
                onClick={() => setShowNewField((value) => !value)}
              >
                {showNewField ? "Cancel" : "+ Create field"}
              </button>

              {showNewField && (
                <form
                  onSubmit={handleCreateField}
                  className="rounded-xl border border-line bg-canvas/50 p-3.5"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label>
                      Field key
                      <input
                        value={newFieldKey}
                        onChange={(event) =>
                          setNewFieldKey(event.target.value)
                        }
                        placeholder="automation_interest"
                      />
                    </label>

                    <label>
                      Label
                      <input
                        value={newFieldLabel}
                        onChange={(event) =>
                          setNewFieldLabel(event.target.value)
                        }
                        placeholder="Automation interest"
                      />
                    </label>
                  </div>

                  <label className="mt-3 block">
                    Value type
                    <select
                      value={newFieldType}
                      onChange={(event) =>
                        setNewFieldType(
                          event.target.value as FieldDefinitionValueType,
                        )
                      }
                    >
                      {VALUE_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    type="submit"
                    className="btn-primary btn-small mt-3"
                    disabled={!newFieldKey.trim() || !newFieldLabel.trim()}
                  >
                    Add field
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {tab === "validation" && (
          <div className="max-w-[620px]">
            <h3 className="m-0 text-[15px] font-semibold text-ink">
              Validation
            </h3>
            <p className="muted m-0 mt-2 text-[12px] leading-5">
              No validation rules are configured for this goal.
            </p>
          </div>
        )}

        {tab === "success" && (
          <div className="max-w-[620px]">
            <h3 className="m-0 text-[15px] font-semibold text-ink">
              Success Message
            </h3>
            <p className="muted m-0 mt-2 text-[12px] leading-5">
              No success message is configured for this goal.
            </p>
          </div>
        )}

        {error && <div className="banner banner-error mt-5">{error}</div>}
      </div>
    </div>
  );
}

function ActionPanel({
  campaign,
  action,
}: {
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

        <div className="mt-6 rounded-xl border border-line bg-canvas/50 px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-subtle">
            CTA link
          </div>
          <div className="mt-1 break-all text-[12px] text-ink">
            {campaign.ctaLink ?? "Not configured"}
          </div>
        </div>
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

      <div className="mt-6 rounded-xl border border-line bg-canvas/50 px-4 py-3 text-[12px] leading-5 text-subtle">
        Handoff pauses automation so a teammate can continue the conversation.
      </div>
    </div>
  );
}

export const Inspector = forwardRef<
  InspectorHandle,
  {
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
    onActionsChange?: (actions: InspectorHandle) => void;
  }
>(
  (
    {
      tenantId,
      campaign,
      milestones,
      fieldDefinitions,
      selectedNode,
      onCampaignChanged,
      onSaveMilestone,
      onFieldDefinitionsChanged,
      onActionsChange,
    },
    ref,
  ) => {
    const emptyActions: InspectorHandle = {
      save: async () => true,
      discard: () => undefined,
      dirty: false,
      saving: false,
      canSave: false,
    };

    const [actions, setActions] = useState<InspectorHandle>(emptyActions);

    useEffect(() => {
      onActionsChange?.(actions);
    }, [actions, onActionsChange]);

    useImperativeHandle(ref, () => actions, [actions]);

    if (selectedNode.type === "trigger") {
      return (
        <TriggerEditor
          tenantId={tenantId}
          campaign={campaign}
          onCampaignChanged={onCampaignChanged}
          onActionsChange={setActions}
        />
      );
    }

    if (selectedNode.type === "message") {
      return (
        <MessageEditor
          tenantId={tenantId}
          campaign={campaign}
          onCampaignChanged={onCampaignChanged}
          onActionsChange={setActions}
        />
      );
    }

    if (selectedNode.type === "milestone") {
      const milestone = milestones[selectedNode.milestoneIndex];

      if (!milestone) {
        return (
          <div className="rounded-xl border border-line bg-canvas/50 px-4 py-5 text-sm text-subtle">
            This goal is no longer available.
          </div>
        );
      }

      return (
        <GoalEditor
          tenantId={tenantId}
          milestone={milestone}
          index={selectedNode.milestoneIndex}
          fieldDefinitions={fieldDefinitions}
          onFieldDefinitionsChanged={onFieldDefinitionsChanged}
          onSaveMilestone={onSaveMilestone}
          onActionsChange={setActions}
        />
      );
    }

    useEditorActions(emptyActions, onActionsChange);

    return <ActionPanel campaign={campaign} action={selectedNode.action} />;
  },
);

Inspector.displayName = "Inspector";
