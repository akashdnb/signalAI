import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  api,
  TONE_LABEL,
  type Campaign,
  type CampaignTone,
  type FieldDefinition,
  type FieldDefinitionValueType,
  type InstagramMessageButton,
  type InstagramMessageCard,
  type InstagramMessagePresentation,
  type InstagramQuickReply,
  type Milestone,
  type TriggerSource,
} from "../../api";
import {
  BotIcon,
  HandshakeIcon,
  InstagramMarkIcon,
  SendIcon,
} from "../icons";
import type { MessageJourneyTarget, SelectedNode } from "./BuilderCanvas";

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
  enabled = true,
) {
  const latest = useRef(actions);
  latest.current = actions;

  useEffect(() => {
    if (!enabled) return;

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
  }, [actions.dirty, actions.saving, actions.canSave, onActionsChange, enabled]);
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
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [orientation, setOrientation] = useState<"horizontal" | "vertical">(
    () => window.matchMedia("(max-width: 767px)").matches ? "horizontal" : "vertical",
  );

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const syncOrientation = (event: MediaQueryList | MediaQueryListEvent) =>
      setOrientation(event.matches ? "horizontal" : "vertical");
    syncOrientation(media);
    media.addEventListener("change", syncOrientation);
    return () => media.removeEventListener("change", syncOrientation);
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (orientation === "vertical" && event.key === "ArrowDown") nextIndex = (index + 1) % items.length;
    if (orientation === "vertical" && event.key === "ArrowUp") nextIndex = (index - 1 + items.length) % items.length;
    if (orientation === "horizontal" && event.key === "ArrowRight") nextIndex = (index + 1) % items.length;
    if (orientation === "horizontal" && event.key === "ArrowLeft") nextIndex = (index - 1 + items.length) % items.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = items.length - 1;

    if (nextIndex !== null) {
      event.preventDefault();
      tabRefs.current[nextIndex]?.focus();
    }
  }

  return (
    <div
      role="tablist"
      aria-label="Editor sections"
      aria-orientation={orientation}
      className={
        orientation === "vertical"
          ? "w-[128px] shrink-0 border-r border-line pr-3"
          : "w-full shrink-0 overflow-x-auto border-b border-line pb-2"
      }
    >
      <div className={orientation === "vertical" ? "space-y-1" : "flex gap-1"}>
        {items.map((item, index) => {
          const selected = active === item.key;

          return (
            <button
              key={item.key}
              ref={(element) => { tabRefs.current[index] = element; }}
              id={`inspector-tab-${item.key}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="inspector-tabpanel"
              tabIndex={selected ? 0 : -1}
              onKeyDown={(event) => handleKeyDown(event, index)}
              onClick={() => onChange(item.key)}
              className={`flex min-h-10 items-center rounded-lg px-3 text-left text-[12px] transition-colors ${
                orientation === "vertical" ? "w-full" : "w-auto shrink-0"
              } ${
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
    </div>
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
    <div className="flex flex-col gap-4 md:flex-row md:gap-6">
      <SectionTabs
        items={[
          { key: "basic", label: "Basic" },
          { key: "advanced", label: "Advanced" },
          { key: "ai", label: "AI Settings" },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div
        id="inspector-tabpanel"
        role="tabpanel"
        aria-labelledby={`inspector-tab-${tab}`}
        tabIndex={0}
        className="min-w-0 flex-1"
      >
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

const JOURNEY_NODE_PAYLOAD_PREFIX = "signalai:node:";
type MessagePresentationKind = "text" | "buttons" | "card" | "gallery" | "quick_replies";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function initialPresentationFromData(
  data: Record<string, unknown> | undefined,
): InstagramMessagePresentation | undefined {
  const richMessage = data?.richMessage;
  if (!isPlainRecord(richMessage) || !isPlainRecord(richMessage.presentation)) return undefined;
  const presentation = richMessage.presentation;
  if (
    presentation.type === "text" ||
    presentation.type === "buttons" ||
    presentation.type === "card" ||
    presentation.type === "gallery" ||
    presentation.type === "quick_replies"
  ) {
    return presentation as unknown as InstagramMessagePresentation;
  }
  return undefined;
}

function initialButtons(presentation: InstagramMessagePresentation | undefined): InstagramMessageButton[] {
  if (presentation?.type === "buttons") return presentation.buttons.map((button) => ({ ...button }));
  return [{ type: "web_url", title: "View details", url: "" }];
}

function initialCards(presentation: InstagramMessagePresentation | undefined, kind: "card" | "gallery"): InstagramMessageCard[] {
  if (presentation?.type === "card") return [{ ...presentation.card, buttons: presentation.card.buttons?.map((button) => ({ ...button })) ?? [] }];
  if (presentation?.type === "gallery") return presentation.cards.map((card) => ({ ...card, buttons: card.buttons?.map((button) => ({ ...button })) ?? [] }));
  const defaults: InstagramMessageCard[] = [{ title: "Your offer", subtitle: "", imageUrl: "", buttons: [] }];
  if (kind === "gallery") defaults.push({ title: "Another option", subtitle: "", imageUrl: "", buttons: [] });
  return defaults;
}

function initialQuickReplies(presentation: InstagramMessagePresentation | undefined): InstagramQuickReply[] {
  if (presentation?.type === "quick_replies") return presentation.replies.map((reply) => ({ ...reply }));
  return [
    { title: "Pricing", payload: "" },
    { title: "More information", payload: "" },
  ];
}

function normalizeEditorCard(card: InstagramMessageCard): InstagramMessageCard {
  const buttons = card.buttons ?? [];
  return {
    title: card.title,
    ...(card.subtitle ? { subtitle: card.subtitle } : {}),
    ...(card.imageUrl?.trim() ? { imageUrl: card.imageUrl } : {}),
    ...(buttons.length ? { buttons } : {}),
  };
}

function normalizeEditorPresentation(
  presentation: InstagramMessagePresentation | undefined,
): InstagramMessagePresentation | undefined {
  if (!presentation || presentation.type === "text") return undefined;
  if (presentation.type === "card") {
    return { type: "card", card: normalizeEditorCard(presentation.card) };
  }
  if (presentation.type === "gallery") {
    return { type: "gallery", cards: presentation.cards.map(normalizeEditorCard) };
  }
  if (presentation.type === "buttons") {
    return { type: "buttons", buttons: presentation.buttons.map((button) => ({ ...button })) };
  }
  return { type: "quick_replies", replies: presentation.replies.map((reply) => ({ ...reply })) };
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:" && new URL(value).hostname.length > 0;
  } catch {
    return false;
  }
}

function selectedTarget(payload: string): string {
  return payload.startsWith(JOURNEY_NODE_PAYLOAD_PREFIX)
    ? payload.slice(JOURNEY_NODE_PAYLOAD_PREFIX.length)
    : "";
}

function messagePresentationProblem(
  kind: MessagePresentationKind,
  text: string,
  buttons: InstagramMessageButton[],
  cards: InstagramMessageCard[],
  quickReplies: InstagramQuickReply[],
  targets: MessageJourneyTarget[],
): string | null {
  const targetIds = new Set(targets.map((target) => target.id));
  const checkButtons = (items: InstagramMessageButton[], required: boolean): string | null => {
    if (items.length > 3) return "Instagram allows up to 3 buttons per message or card.";
    if (required && items.length === 0) return "Add at least one button.";
    for (const button of items) {
      if (!button.title.trim()) return "Every button needs a label.";
      if (button.title.trim().length > 20) return "Button labels must be 20 characters or fewer.";
      if (button.type === "web_url") {
        if (!isHttpsUrl(button.url.trim())) return "Website buttons need a valid HTTPS URL.";
      } else {
        const targetId = selectedTarget(button.payload);
        if (!targetIds.has(targetId)) return "Choose a connected journey step for every journey button.";
      }
    }
    return null;
  };
  const checkCard = (card: InstagramMessageCard): string | null => {
    if (!card.title.trim()) return "Every card needs a title.";
    if (card.title.trim().length > 80) return "Card titles must be 80 characters or fewer.";
    if ((card.subtitle ?? "").trim().length > 80) return "Card subtitles must be 80 characters or fewer.";
    if (card.imageUrl?.trim() && !isHttpsUrl(card.imageUrl.trim())) return "Card images need a valid HTTPS URL.";
    return checkButtons(card.buttons ?? [], false);
  };

  if (kind === "text") return null;
  if (kind === "buttons") {
    if (!text.trim()) return "Add message text before adding buttons.";
    if (text.length > 640) return "Button templates support up to 640 characters of text.";
    return checkButtons(buttons, true);
  }
  if (kind === "quick_replies") {
    if (!text.trim()) return "Add message text before adding quick replies.";
    if (text.length > 640) return "Quick-reply messages support up to 640 characters of text.";
    if (quickReplies.length === 0) return "Add at least one quick reply.";
    if (quickReplies.length > 13) return "Instagram allows up to 13 quick replies.";
    for (const reply of quickReplies) {
      if (!reply.title.trim()) return "Every quick reply needs a label.";
      if (reply.title.trim().length > 20) return "Quick-reply labels must be 20 characters or fewer.";
      if (!targetIds.has(selectedTarget(reply.payload))) return "Choose a connected journey step for every quick reply.";
    }
    return null;
  }
  if (kind === "card") {
    const card = cards[0];
    return card ? checkCard(card) : "Add a card.";
  }
  if (cards.length === 0) return "Add at least one card to the gallery.";
  if (cards.length > 10) return "Instagram galleries can contain up to 10 cards.";
  for (const card of cards) {
    const problem = checkCard(card);
    if (problem) return problem;
  }
  return null;
}

function MessageButtonEditor({
  button,
  targets,
  onChange,
  onRemove,
}: {
  button: InstagramMessageButton;
  targets: MessageJourneyTarget[];
  onChange: (button: InstagramMessageButton) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid gap-2 rounded-xl border border-line bg-canvas/50 p-3">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)_auto]">
        <label className="block min-w-0">
          <span className="text-[10px] font-semibold text-subtle">Button label</span>
          <input
            value={button.title}
            maxLength={80}
            onChange={(event) => onChange({ ...button, title: event.target.value })}
            placeholder="View details"
            className="!mt-1 !text-[12px]"
          />
        </label>
        <label className="block min-w-0">
          <span className="text-[10px] font-semibold text-subtle">Action</span>
          <select
            value={button.type}
            onChange={(event) => {
              if (event.target.value === "web_url") {
                onChange({ type: "web_url", title: button.title, url: "" });
              } else {
                onChange({ type: "postback", title: button.title, payload: "" });
              }
            }}
            className="!mt-1 !text-[12px]"
          >
            <option value="web_url">Open website</option>
            <option value="postback">Continue journey</option>
          </select>
        </label>
        <button type="button" className="btn-secondary btn-small self-end" onClick={onRemove}>
          Remove
        </button>
      </div>
      {button.type === "web_url" ? (
        <label className="block">
          <span className="text-[10px] font-semibold text-subtle">HTTPS URL</span>
          <input
            type="url"
            value={button.url}
            onChange={(event) => onChange({ ...button, url: event.target.value })}
            placeholder="https://example.com/product"
            className="!mt-1 !text-[12px]"
          />
        </label>
      ) : (
        <label className="block">
          <span className="text-[10px] font-semibold text-subtle">Journey destination</span>
          <select
            value={selectedTarget(button.payload)}
            onChange={(event) => onChange({
              ...button,
              payload: event.target.value ? JOURNEY_NODE_PAYLOAD_PREFIX + event.target.value : "",
            })}
            className="!mt-1 !text-[12px]"
          >
            <option value="">Choose connected step…</option>
            {targets.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}
          </select>
          {targets.length === 0 && (
            <span className="muted mt-1 block text-[10px]">Connect this message to a next step in the journey first.</span>
          )}
        </label>
      )}
    </div>
  );
}

function MessageCardEditor({
  card,
  index,
  targets,
  canRemove,
  onChange,
  onRemove,
}: {
  card: InstagramMessageCard;
  index: number;
  targets: MessageJourneyTarget[];
  canRemove: boolean;
  onChange: (card: InstagramMessageCard) => void;
  onRemove: () => void;
}) {
  const cardButtons = card.buttons ?? [];
  return (
    <section className="space-y-3 rounded-xl border border-line p-3.5">
      <div className="flex items-center justify-between gap-3">
        <h4 className="m-0 text-[12px] font-semibold text-ink">Card {index + 1}</h4>
        {canRemove && <button type="button" className="text-[11px] font-medium text-subtle hover:text-ink" onClick={onRemove}>Remove card</button>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-[10px] font-semibold text-subtle">Title</span>
          <input value={card.title} maxLength={80} onChange={(event) => onChange({ ...card, title: event.target.value })} className="!mt-1 !text-[12px]" placeholder="Product or offer name" />
        </label>
        <label className="block">
          <span className="text-[10px] font-semibold text-subtle">Image URL (optional)</span>
          <input type="url" value={card.imageUrl ?? ""} onChange={(event) => onChange({ ...card, imageUrl: event.target.value })} className="!mt-1 !text-[12px]" placeholder="https://cdn.example.com/image.jpg" />
        </label>
      </div>
      <label className="block">
        <span className="text-[10px] font-semibold text-subtle">Subtitle (optional)</span>
        <textarea value={card.subtitle ?? ""} rows={2} maxLength={80} onChange={(event) => onChange({ ...card, subtitle: event.target.value })} className="!mt-1 !min-h-[64px] !text-[12px]" placeholder="Briefly explain this option" />
      </label>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold text-ink">Card actions</span>
          <button
            type="button"
            className="btn-secondary btn-small"
            disabled={cardButtons.length >= 3}
            onClick={() => onChange({ ...card, buttons: [...cardButtons, { type: "web_url", title: "View details", url: "" }] })}
          >+ Add action</button>
        </div>
        {cardButtons.map((button, buttonIndex) => (
          <MessageButtonEditor
            key={buttonIndex}
            button={button}
            targets={targets}
            onChange={(next) => onChange({ ...card, buttons: cardButtons.map((item, i) => i === buttonIndex ? next : item) })}
            onRemove={() => onChange({ ...card, buttons: cardButtons.filter((_, i) => i !== buttonIndex) })}
          />
        ))}
      </div>
    </section>
  );
}

function MessageEditor({
  tenantId,
  campaign,
  onCampaignChanged,
  onActionsChange,
  selectedNode,
  onSaveMessageConfiguration,
}: {
  tenantId: string;
  campaign: Campaign;
  onCampaignChanged: () => Promise<void> | void;
  onActionsChange?: (actions: EditorActions) => void;
  selectedNode: Extract<SelectedNode, { type: "message" }>;
  onSaveMessageConfiguration: (config: {
    text: string;
    presentation?: InstagramMessagePresentation;
  }) => boolean;
}) {
  const initialPresentation = initialPresentationFromData(selectedNode.data);
  const initialMessage =
    (initialPresentation?.type === "card" || initialPresentation?.type === "gallery") ||
    typeof selectedNode.data?.text !== "string"
      ? campaign.defaultReplyTemplate
      : selectedNode.data.text;
  const [tab, setTab] = useState("basic");
  const [message, setMessage] = useState(initialMessage);
  const [tone, setTone] = useState<CampaignTone>(campaign.tone);
  const [useKnowledgeBase, setUseKnowledgeBase] = useState(campaign.useKnowledgeBase);
  const [presentationType, setPresentationType] = useState<MessagePresentationKind>(initialPresentation?.type ?? "text");
  const [buttons, setButtons] = useState<InstagramMessageButton[]>(() => initialButtons(initialPresentation));
  const [cards, setCards] = useState<InstagramMessageCard[]>(() => initialCards(initialPresentation, initialPresentation?.type === "gallery" ? "gallery" : "card"));
  const [quickReplies, setQuickReplies] = useState<InstagramQuickReply[]>(() => initialQuickReplies(initialPresentation));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const targets = selectedNode.outgoingTargets ?? [];

  useEffect(() => {
    setMessage(initialMessage);
    setTone(campaign.tone);
    setUseKnowledgeBase(campaign.useKnowledgeBase);
    setPresentationType(initialPresentation?.type ?? "text");
    setButtons(initialButtons(initialPresentation));
    setCards(initialCards(initialPresentation, initialPresentation?.type === "gallery" ? "gallery" : "card"));
    setQuickReplies(initialQuickReplies(initialPresentation));
    setError(null);
  }, [campaign, initialMessage, initialPresentation]);

  const original = useMemo(
    () => ({
      campaignMessage: campaign.defaultReplyTemplate,
      graphMessage: initialMessage,
      tone: campaign.tone,
      useKnowledgeBase: campaign.useKnowledgeBase,
    }),
    [campaign, initialMessage],
  );

  const presentation = useMemo<InstagramMessagePresentation | undefined>(() => {
    switch (presentationType) {
      case "buttons": return normalizeEditorPresentation({ type: "buttons", buttons });
      case "card": return normalizeEditorPresentation({ type: "card", card: cards[0] ?? { title: "" } });
      case "gallery": return normalizeEditorPresentation({ type: "gallery", cards });
      case "quick_replies": return normalizeEditorPresentation({ type: "quick_replies", replies: quickReplies });
      default: return undefined;
    }
  }, [buttons, cards, presentationType, quickReplies]);

  const validationProblem = messagePresentationProblem(
    presentationType,
    message,
    buttons,
    presentationType === "card" ? cards.slice(0, 1) : cards,
    quickReplies,
    targets,
  );

  const presentationDirty =
    JSON.stringify(normalizeEditorPresentation(presentation)) !== JSON.stringify(
      normalizeEditorPresentation(initialPresentation),
    );
  const campaignUpdates = {
    ...(message !== original.graphMessage && message !== original.campaignMessage
      ? { defaultReplyTemplate: message }
      : {}),
    ...(tone !== original.tone ? { tone } : {}),
    ...(useKnowledgeBase !== original.useKnowledgeBase ? { useKnowledgeBase } : {}),
  };
  const campaignDirty = Object.keys(campaignUpdates).length > 0;
  const dirty =
    message !== original.graphMessage ||
    tone !== original.tone ||
    useKnowledgeBase !== original.useKnowledgeBase ||
    presentationDirty;

  const discard = () => {
    setMessage(original.graphMessage);
    setTone(original.tone);
    setUseKnowledgeBase(original.useKnowledgeBase);
    setPresentationType(initialPresentation?.type ?? "text");
    setButtons(initialButtons(initialPresentation));
    setCards(initialCards(initialPresentation, initialPresentation?.type === "gallery" ? "gallery" : "card"));
    setQuickReplies(initialQuickReplies(initialPresentation));
    setError(null);
  };

  function insertVariable() {
    const el = textareaRef.current;
    if (!el) {
      setMessage((value) => value + "{name}");
      return;
    }
    const start = el.selectionStart ?? message.length;
    const end = el.selectionEnd ?? message.length;
    const next = message.slice(0, start) + "{name}" + message.slice(end);
    setMessage(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + 6, start + 6);
    });
  }

  const save = async (): Promise<boolean> => {
    if (validationProblem) {
      setError(validationProblem);
      return false;
    }

    setSaving(true);
    setError(null);
    try {
      if (campaignDirty) {
        await api.updateReplyConfig(tenantId, campaign.id, campaignUpdates);
      }

      const messageText = presentationType === "card" || presentationType === "gallery" ? "" : message;
      const saved = onSaveMessageConfiguration({
        text: messageText,
        ...(presentation ? { presentation } : {}),
      });
      if (!saved) {
        setError("Couldn't update the journey draft. Close this dialog and retry.");
        return false;
      }

      if (campaignDirty) await onCampaignChanged();
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
      canSave: !saving && !validationProblem,
    },
    onActionsChange,
  );

  const changeKind = (next: MessagePresentationKind) => {
    setPresentationType(next);
    setError(null);
  };

  return (
    <div className="flex min-w-0 flex-col gap-5 md:flex-row">
      <SectionTabs
        items={[
          { key: "basic", label: "Message" },
          { key: "presentation", label: "Instagram layout" },
          { key: "ai", label: "AI Settings" },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="min-w-0 flex-1">
        {tab === "basic" && (
          <>
            <PanelHeader
              icon={BotIcon}
              title={campaign.replyMode === "ai_generated" ? "AI Reply" : "Reply Message"}
              description="Write the response for this step. Interactive layouts can route a selection to a connected journey step."
            />
            {presentationType !== "card" && presentationType !== "gallery" ? (
              <div className="mt-5 space-y-4">
                <label className="block">
                  <span className="text-[11px] font-semibold text-ink">Message</span>
                  <textarea
                    ref={textareaRef}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    rows={5}
                    placeholder="Write the reply your leads will receive."
                    className="!mt-1.5 !min-h-[120px] !text-[13px]"
                  />
                </label>
                <button type="button" className="btn-secondary btn-small" onClick={insertVariable}>
                  {"{ }"} Insert variable
                </button>
              </div>
            ) : (
              <div className="mt-5 rounded-xl border border-line bg-canvas/50 p-3 text-[12px] leading-5 text-subtle">
                Cards and galleries use each card's title and subtitle instead of a separate message caption.
              </div>
            )}
          </>
        )}

        {tab === "presentation" && (
          <div className="space-y-4">
            <div>
              <h3 className="m-0 text-[15px] font-semibold text-ink">Instagram message layout</h3>
              <p className="muted m-0 mt-1 text-[11px] leading-4">Choose the native Instagram presentation for this journey step.</p>
            </div>
            <label className="block max-w-sm">
              <span className="text-[11px] font-semibold text-ink">Layout</span>
              <select value={presentationType} onChange={(event) => changeKind(event.target.value as MessagePresentationKind)} className="!mt-1.5">
                <option value="text">Plain text</option>
                <option value="buttons">Text + buttons</option>
                <option value="card">Single card</option>
                <option value="gallery">Gallery / carousel</option>
                <option value="quick_replies">Quick replies</option>
              </select>
            </label>

            {presentationType === "buttons" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-ink">Buttons</span>
                  <button type="button" className="btn-secondary btn-small" disabled={buttons.length >= 3} onClick={() => setButtons((items) => [...items, { type: "web_url", title: "", url: "" }])}>+ Add button</button>
                </div>
                {buttons.map((button, index) => (
                  <MessageButtonEditor
                    key={index}
                    button={button}
                    targets={targets}
                    onChange={(next) => setButtons((items) => items.map((item, i) => i === index ? next : item))}
                    onRemove={() => setButtons((items) => items.filter((_, i) => i !== index))}
                  />
                ))}
              </div>
            )}

            {(presentationType === "card" || presentationType === "gallery") && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-ink">{presentationType === "gallery" ? "Gallery cards" : "Card content"}</span>
                  {presentationType === "gallery" && (
                    <button type="button" className="btn-secondary btn-small" disabled={cards.length >= 10} onClick={() => setCards((items) => [...items, { title: "New option", subtitle: "", imageUrl: "", buttons: [] }])}>+ Add card</button>
                  )}
                </div>
                {(presentationType === "gallery" ? cards : cards.slice(0, 1)).map((card, index) => (
                  <MessageCardEditor
                    key={index}
                    card={card}
                    index={index}
                    targets={targets}
                    canRemove={presentationType === "gallery" && cards.length > 1}
                    onChange={(next) => setCards((items) => items.map((item, i) => i === index ? next : item))}
                    onRemove={() => setCards((items) => items.filter((_, i) => i !== index))}
                  />
                ))}
                {presentationType === "gallery" && cards.length < 2 && (
                  <p className="muted m-0 text-[10px]">Add a second card to create a carousel.</p>
                )}
              </div>
            )}

            {presentationType === "quick_replies" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-ink">Quick replies</span>
                  <button type="button" className="btn-secondary btn-small" disabled={quickReplies.length >= 13} onClick={() => setQuickReplies((items) => [...items, { title: "", payload: "" }])}>+ Add quick reply</button>
                </div>
                {quickReplies.map((reply, index) => (
                  <div key={index} className="grid gap-2 rounded-xl border border-line bg-canvas/50 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                    <label className="block min-w-0">
                      <span className="text-[10px] font-semibold text-subtle">Label</span>
                      <input value={reply.title} maxLength={20} onChange={(event) => setQuickReplies((items) => items.map((item, i) => i === index ? { ...item, title: event.target.value } : item))} placeholder="Pricing" className="!mt-1 !text-[12px]" />
                    </label>
                    <label className="block min-w-0">
                      <span className="text-[10px] font-semibold text-subtle">Journey destination</span>
                      <select value={selectedTarget(reply.payload)} onChange={(event) => setQuickReplies((items) => items.map((item, i) => i === index ? { ...item, payload: event.target.value ? JOURNEY_NODE_PAYLOAD_PREFIX + event.target.value : "" } : item))} className="!mt-1 !text-[12px]">
                        <option value="">Choose connected step…</option>
                        {targets.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}
                      </select>
                    </label>
                    <button type="button" className="btn-secondary btn-small self-end" onClick={() => setQuickReplies((items) => items.filter((_, i) => i !== index))}>Remove</button>
                  </div>
                ))}
                {targets.length === 0 && <p className="muted m-0 text-[10px]">Connect the message node to a next step before assigning quick replies.</p>}
              </div>
            )}

            {validationProblem && (
              <div role="status" className="rounded-lg border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-3 py-2 text-[11px] leading-4 text-ink">
                {validationProblem}
              </div>
            )}
            <p className="muted m-0 text-[10px] leading-4">
              Changes stay in the unsaved journey draft. Use Save in the builder to persist them; Discard restores the last saved version.
            </p>
          </div>
        )}

        {tab === "ai" && (
          <div className="space-y-5">
            <PanelHeader icon={BotIcon} title="AI Settings" description="Choose how AI writes text for this journey step." />
            <label className="block max-w-sm">
              <span className="text-[11px] font-semibold text-ink">AI behavior</span>
              <select value={tone} onChange={(event) => setTone(event.target.value as CampaignTone)} className="!mt-1.5">
                {(Object.keys(TONE_LABEL) as CampaignTone[]).map((toneKey) => (
                  <option key={toneKey} value={toneKey}>{TONE_LABEL[toneKey]}</option>
                ))}
              </select>
            </label>
            <label className="flex items-start gap-2 text-[11px] leading-4 text-subtle">
              <input type="checkbox" checked={useKnowledgeBase} onChange={(event) => setUseKnowledgeBase(event.target.checked)} />
              <span>Use knowledge base for context</span>
            </label>
          </div>
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
    <div className="flex flex-col gap-4 md:flex-row md:gap-6">
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

      <div
        id="inspector-tabpanel"
        role="tabpanel"
        aria-labelledby={`inspector-tab-${tab}`}
        tabIndex={0}
        className="min-w-0 flex-1"
      >
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
    onSaveMessageConfiguration: (config: {
      text: string;
      presentation?: InstagramMessagePresentation;
    }) => boolean;
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
      onSaveMessageConfiguration,
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

    // Keep hook order stable while clearing stale node-editor actions for
    // non-editable action panels such as handoff/link summaries.
    useEditorActions(emptyActions, onActionsChange, selectedNode.type === "action");

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
          selectedNode={selectedNode}
          onCampaignChanged={onCampaignChanged}
          onSaveMessageConfiguration={onSaveMessageConfiguration}
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

    return <ActionPanel campaign={campaign} action={selectedNode.action} />;
  },
);

Inspector.displayName = "Inspector";
