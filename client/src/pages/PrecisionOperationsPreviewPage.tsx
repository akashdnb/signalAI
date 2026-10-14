import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { OverviewScreen, AutomationsScreen, LeadDetailScreen, KnowledgeScreen, ContentScreen, AnalyticsScreen, IntegrationsScreen, TeamScreen, BillingScreen, SettingsScreen, DocsScreen, LoginPreviewScreen, SystemStateScreen, type FullPreviewScreen } from "./PrecisionOperationsFullScreens";
import { Logo } from "../components/Logo";
import {
  AnalyticsIcon, AutomationIcon, BookIcon, ContentIcon, HomeIcon, InboxIcon,
  IntegrationsIcon, LeadsIcon, SettingsIcon, TeamIcon, InstagramMarkIcon,
  BotIcon, SendIcon, ListChecksIcon, SearchIcon, PlayIcon, PlusIcon,
  ChevronDownIcon, DotsVerticalIcon, CheckCircleIcon, CreditCardIcon, SunIcon, MoonIcon, BellIcon,
} from "../components/icons";

type PreviewScreen = FullPreviewScreen;
type BuilderNodeKey = "trigger" | "reply" | "goal" | "followup";
type BuilderSeed = { triggerType: string; keywords: string };
type NodeEditorConfig = {
  triggerType?: string; keywords?: string; alsoStory?: boolean; caseInsensitive?: boolean; matchType?: string; alsoDm?: boolean;
  messageText?: string; presentation?: string;
  buttons?: Array<{ title: string; action: string; url: string; destination: string }>;
  cards?: Array<{ title: string; subtitle: string; imageUrl: string; actionTitle: string; actionType: string; actionUrl: string; actionDestination: string }>;
  quickReplies?: Array<{ title: string; destination: string }>;
  tone?: string; useKnowledge?: boolean; goalTitle?: string; captureFields?: string[];
};
type IconType = ComponentType<{ className?: string }>;
type NavigationItem = { label: string; icon: IconType; screen?: PreviewScreen; section: "primary" | "workspace" };

const navigation: NavigationItem[] = [
  { label: "Overview", icon: HomeIcon, screen: "overview", section: "primary" },
  { label: "Inbox", icon: InboxIcon, screen: "inbox", section: "primary" },
  { label: "Leads", icon: LeadsIcon, screen: "leads", section: "primary" },
  { label: "Automation", icon: AutomationIcon, screen: "automations", section: "primary" },
  { label: "Knowledge", icon: BookIcon, screen: "knowledge", section: "primary" },
  { label: "Content", icon: ContentIcon, screen: "content", section: "primary" },
  { label: "Analytics", icon: AnalyticsIcon, screen: "analytics", section: "primary" },
  { label: "Integrations", icon: IntegrationsIcon, screen: "integrations", section: "workspace" },
  { label: "Team", icon: TeamIcon, screen: "team", section: "workspace" },
  { label: "Billing", icon: CreditCardIcon, screen: "billing", section: "workspace" },
  { label: "Settings", icon: SettingsIcon, screen: "settings", section: "workspace" },
];

const builderNodes: {
  key: BuilderNodeKey; number: string; title: string; summary: string; detail: string;
  icon: IconType; kind: string;
}[] = [
  { key: "trigger", number: "01", title: "Instagram trigger", summary: "Comment or direct message", detail: "Matches configured keywords", icon: InstagramMarkIcon, kind: "TRIGGER" },
  { key: "reply", number: "02", title: "AI reply", summary: "Answer the first question", detail: "Knowledge base can ground the reply", icon: BotIcon, kind: "MESSAGE" },
  { key: "goal", number: "03", title: "Qualification question", summary: "Ask what the person needs", detail: "Capture answers as lead details", icon: ListChecksIcon, kind: "GOAL" },
  { key: "followup", number: "04", title: "Follow-up message", summary: "Share the next useful step", detail: "Review wording before publishing", icon: SendIcon, kind: "MESSAGE" },
];

const conversations = [
  { handle: "@sample_fitness", preview: "Do you have pricing for 1:1 coaching?", time: "2m", status: "AI handling", tone: "purple", initial: "SF", unread: true, stage: "New", owner: "Unassigned", attention: false, human: false, window: "Open · 18h left", via: "DM", firstSeen: "Today" },
  { handle: "@studio_owner", preview: "Can you share the class schedule?", time: "12m", status: "Needs attention", tone: "amber", initial: "SO", unread: true, stage: "Qualified", owner: "Unassigned", attention: true, human: false, window: "Open · 12h left", via: "Comment", firstSeen: "Oct 11" },
  { handle: "@maya_runs", preview: "Is this available for beginners?", time: "27m", status: "AI handling", tone: "purple", initial: "MR", unread: false, stage: "Qualified", owner: "Sam Taylor", attention: false, human: false, window: "Open · 10h left", via: "DM", firstSeen: "Oct 10" },
  { handle: "@northside_fit", preview: "I'd like to speak with someone.", time: "1h", status: "Human handling", tone: "blue", initial: "NF", unread: true, stage: "Contacted", owner: "Alex Morgan", attention: true, human: true, window: "Open · 3h left", via: "DM", firstSeen: "Oct 08" },
  { handle: "@sample_customer", preview: "Thanks, that answers my question.", time: "3h", status: "Resolved", tone: "green", initial: "SC", unread: false, stage: "Contacted", owner: "Alex Morgan", attention: false, human: false, window: "Closed", via: "DM", firstSeen: "Oct 05" },
];

const leads = [
  { name: "Morgan Lee", handle: "@morgan.sample", stage: "New", source: "Comment", activity: "2m ago", owner: "Unassigned" },
  { name: "Casey Rivera", handle: "@casey.sample", stage: "Contacted", source: "DM", activity: "12m ago", owner: "Alex Morgan" },
  { name: "Taylor Kim", handle: "@taylor.sample", stage: "Qualified", source: "Comment", activity: "27m ago", owner: "Sam Taylor" },
  { name: "Jordan Patel", handle: "@jordan.sample", stage: "New", source: "DM", activity: "1h ago", owner: "Unassigned" },
  { name: "Riley Chen", handle: "@riley.sample", stage: "Qualified", source: "DM", activity: "3h ago", owner: "Alex Morgan" },
  { name: "Avery Brooks", handle: "@avery.sample", stage: "Contacted", source: "Comment", activity: "Yesterday", owner: "Sam Taylor" },
  { name: "Blair Cooper", handle: "@blair.sample", stage: "New", source: "Comment", activity: "4h ago", owner: "Unassigned" },
  { name: "Cameron Diaz", handle: "@cameron.sample", stage: "New", source: "DM", activity: "Yesterday", owner: "Sam Taylor" },
  { name: "Devon Wilson", handle: "@devon.sample", stage: "Contacted", source: "Comment", activity: "2d ago", owner: "Alex Morgan" },
  { name: "Emerson Clark", handle: "@emerson.sample", stage: "Qualified", source: "DM", activity: "3d ago", owner: "Sam Taylor" },
];

function BrandMark() {
  return <Logo size="md" className="po-brand" />;
}

function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: string }) {
  return <span className={"po-tag po-tag--" + tone}>{children}</span>;
}

function PreviewNotice() {
  return <div className="po-preview-notice" role="note"><span className="po-preview-notice-dot" aria-hidden="true" /><div><strong>Redesign preview</strong><span>Sample workspace · Actions are demonstrational. No Instagram messages are sent and no data is saved.</span></div></div>;
}

function Sidebar({ screen, onNavigate }: { screen: PreviewScreen; onNavigate: (next: PreviewScreen) => void }) {
  const selectedScreen = screen === "builder" ? "automations" : screen === "lead-detail" ? "leads" : screen;
  return (
    <aside className="po-sidebar" aria-label="Preview navigation">
      <div className="po-sidebar-brand-row"><BrandMark /></div>
      <nav className="po-nav">
        <div className="po-nav-section">
          {navigation.filter((item) => item.section === "primary").map((item) => {
            const active = item.screen === selectedScreen;
            const Icon = item.icon;
            return <button key={item.label} type="button" className={"po-nav-item" + (active ? " is-active" : "")} aria-current={active ? "page" : undefined} onClick={() => item.screen && onNavigate(item.screen)}><Icon className="po-nav-icon" /><span>{item.label}</span>{item.label === "Inbox" && <span className="po-nav-count">5</span>}</button>;
          })}
        </div>
        
        <div className="po-nav-divider" /><div className="po-nav-section"><p className="po-nav-label">Workspace</p>
          {navigation.filter((item) => item.section === "workspace").map((item) => { const Icon = item.icon; const active = item.screen === selectedScreen; return <button key={item.label} type="button" className={"po-nav-item" + (active ? " is-active" : "")} aria-current={active ? "page" : undefined} onClick={() => item.screen && onNavigate(item.screen)}><Icon className="po-nav-icon" /><span>{item.label}</span></button>; })}
        </div>
      </nav>
      <div className="po-plan-card"><span className="po-plan-label">Current Plan</span><strong>Trial</strong><button type="button" onClick={() => onNavigate("billing")}>View plan &amp; usage</button></div>
    </aside>
  );
}

function PageHeader({ screen, dirty, onSave, onTest, onPreview, onPublish, onLifecycleAction, selectedLeadName, automationName, automationStatus, onNavigate }: {
  screen: PreviewScreen; dirty: boolean; onSave: () => void; onTest: () => void; onPreview: () => void; onPublish: () => void; onLifecycleAction: (action: "pause"|"activate") => void;
  selectedLeadName: string; automationName: string; automationStatus: string; onNavigate: (screen: PreviewScreen) => void;
}) {
  const [moreOpen,setMoreOpen]=useState(false);
  if (screen === "leads") return <header className="po-page-header po-page-header--leads"><h1>Leads</h1></header>;
  if (screen === "builder") return <header className="po-page-header po-builder-header">
    <div className="po-builder-heading"><div className="po-breadcrumb"><button type="button" onClick={() => onNavigate("automations")}>Automations</button><span aria-hidden="true">/</span><strong>{automationName}</strong></div><div className="po-title-row"><h1>{automationName}</h1><Tag tone={automationStatus==="Live"?"green":automationStatus==="Paused"?"blue":"warning"}>{automationStatus==="Live"?"Live":automationStatus==="Paused"?"Paused":automationStatus==="Needs publishing"?"Needs publishing":"Draft · Not live"}</Tag></div><p>Review the trigger, reply behavior, lead capture, and account assignment before activating.</p><span className={"po-save-status" + (dirty ? " is-dirty" : "")} role="status"><span className="po-save-status-dot" />{dirty ? "Unsaved preview changes" : "Preview marked saved"}</span></div>
    <div className="po-header-actions"><button type="button" className="po-button po-button--quiet" onClick={()=>onNavigate("docs")}>Docs</button><button type="button" className="po-button po-button--secondary" disabled={!dirty} onClick={onSave}>Save changes</button><button type="button" className="po-button po-button--primary" onClick={onPublish}>Publish</button><div className="po-builder-more-wrap"><button type="button" aria-label="More automation actions" aria-expanded={moreOpen} className="po-button po-button--secondary po-builder-more-button" onClick={()=>setMoreOpen(v=>!v)}><DotsVerticalIcon/></button>{moreOpen&&<div className="po-dropdown po-builder-menu"><div className="po-dropdown-heading"><strong>Automation actions</strong><Tag>{automationStatus}</Tag></div><button type="button" onClick={()=>{setMoreOpen(false);onPreview();}}>Preview reply</button><button type="button" onClick={()=>{setMoreOpen(false);onTest();}}>Run sample walkthrough</button><button type="button" onClick={()=>{setMoreOpen(false);onNavigate("docs");}}>Builder documentation</button><button type="button" disabled={automationStatus!=="Live"&&automationStatus!=="Paused"} onClick={()=>{setMoreOpen(false);onLifecycleAction(automationStatus==="Live"?"pause":"activate");}}>{automationStatus==="Live"?"Pause automation":automationStatus==="Paused"?"Activate automation":"Publish before activating"}</button><p>All lifecycle actions in this concept are local demonstrations.</p></div>}</div></div>
  </header>;
  const configs: Record<string, { eyebrow: string; title: string; description: string }> = {
    overview: { eyebrow: "WORKSPACE SUMMARY", title: "Overview", description: "A clear view of what needs attention across your Instagram operations." },
    automations: { eyebrow: "AUTOMATION WORKSPACE", title: "Automation", description: "Turn Instagram conversations into qualified leads without building a complicated flow." },
    inbox: { eyebrow: "CONVERSATION OPERATIONS", title: "Inbox", description: "Review Instagram conversations and decide when AI or a person should reply." },
    leads: { eyebrow: "PIPELINE", title: "Leads", description: "Track people who have shown interest in your business through Instagram." },
    "lead-detail": { eyebrow: "LEAD PROFILE", title: selectedLeadName, description: "Review context, ownership, conversation, activity, notes, and next steps." },
    knowledge: { eyebrow: "BUSINESS KNOWLEDGE", title: "Knowledge Base", description: "Review sources that ground AI replies, inspect processing health, and test retrieval." },
    content: { eyebrow: "INSTAGRAM CONTENT", title: "Content", description: "Review posts and reels that drive comments and conversations." },
    analytics: { eyebrow: "MEASUREMENT", title: "Analytics", description: "Understand activity volume separately from lead conversion and current pipeline stages." },
    integrations: { eyebrow: "CONNECTED ACCOUNTS", title: "Integrations", description: "Understand which Instagram accounts are connected and whether they are healthy." },
    team: { eyebrow: "WORKSPACE ACCESS", title: "Team", description: "Manage workspace members, invitations, and roles." },
    billing: { eyebrow: "PLAN & USAGE", title: "Billing", description: "Understand plan state, usage, quota limits, and billing availability." },
    settings: { eyebrow: "WORKSPACE CONFIGURATION", title: "Settings", description: "Configure lead fields, AI behavior, forbidden topics, escalation, and scoring." },
    docs: { eyebrow: "GUIDANCE", title: "Documentation", description: "Browse setup, workflow, publishing, analytics, and troubleshooting guidance." },
    login: { eyebrow: "SIGN IN", title: "Sign in", description: "Access the SignalAI workspace." },
    "connect-error": { eyebrow: "CONNECTION RECOVERY", title: "Instagram connection", description: "Recover from an unsuccessful Instagram OAuth callback." },
    invite: { eyebrow: "WORKSPACE ACCESS", title: "Invitation", description: "Review an invitation that may be expired, invalid, or require sign-in." },
  };
  const config = configs[screen] ?? configs.overview!;
  return <header className="po-page-header">
    <div><h1>{config.title}</h1><p>{config.description}</p></div>
    {screen === "automations" ? <button type="button" className="po-button po-button--quiet" onClick={() => onNavigate("docs")}><BookIcon className="po-button-icon"/> Docs</button> : null}
    {screen === "inbox" ? <div className="po-header-context"><span className="po-status-dot" /> Sample inbox <ChevronDownIcon className="po-icon-small" /></div> : null}
    {screen === "lead-detail" ? <button type="button" className="po-button po-button--secondary" onClick={() => onNavigate("leads")}>Back to leads</button> : null}
  </header>;
}

function BuilderPalette({ onSelect }: { onSelect: (key: BuilderNodeKey) => void }) {
  const options: { key: BuilderNodeKey; label: string; description: string; icon: IconType }[] = [
    { key: "trigger", label: "Trigger", description: "Comment or direct message", icon: InstagramMarkIcon },
    { key: "reply", label: "AI reply", description: "Generate a reply", icon: BotIcon },
    { key: "followup", label: "Send message", description: "Write a message", icon: SendIcon },
    { key: "goal", label: "New goal", description: "Collect lead details", icon: ListChecksIcon },
  ];
  return <aside className="po-palette" aria-label="Automation steps">
    <div className="po-panel-heading"><div><span className="po-eyebrow">BUILD YOUR FLOW</span><h2>Add a step</h2></div><span className="po-step-count">4 types</span></div>
    <p className="po-panel-copy">Select a step to inspect its settings in this preview.</p>
    <div className="po-palette-group"><p className="po-group-label">Trigger</p>{options.slice(0, 1).map((item) => { const Icon = item.icon; return <button type="button" className="po-palette-item" key={item.key} onClick={() => onSelect(item.key)}><span className="po-palette-icon po-palette-icon--instagram"><Icon /></span><span><strong>{item.label}</strong><small>{item.description}</small></span><PlusIcon className="po-icon-small" /></button>; })}</div>
    <div className="po-palette-group"><p className="po-group-label">Actions</p>{options.slice(1).map((item) => { const Icon = item.icon; return <button type="button" className="po-palette-item" key={item.key} onClick={() => onSelect(item.key)}><span className="po-palette-icon"><Icon /></span><span><strong>{item.label}</strong><small>{item.description}</small></span><PlusIcon className="po-icon-small" /></button>; })}</div>
    <div className="po-coming-soon"><p className="po-group-label">Not available yet</p><div><span className="po-soon-icon">↳</span><span><strong>Condition</strong><small>Branch on rules</small></span><Tag>Later</Tag></div><div><span className="po-soon-icon">◷</span><span><strong>Delay</strong><small>Wait before continuing</small></span><Tag>Later</Tag></div><div><span className="po-soon-icon">↗</span><span><strong>Handoff node</strong><small>Dedicated handoff step</small></span><Tag>Later</Tag></div></div>
  </aside>;
}

function FlowNode({ node, selected, onClick, index, nodeId, onReorder, onRemove, isNew, onMove }: {
  node: (typeof builderNodes)[number]; selected: boolean; onClick: () => void; index: number; nodeId: number; onReorder: (fromId: number, toId: number) => void; onRemove: ((nodeId: number) => void) | null; isNew: boolean; onMove: (nodeId: number, direction: -1|1) => void;
}) {
  const Icon = node.icon;
  return <div className="po-flow-node-wrap" onDragOver={event=>{event.preventDefault();event.dataTransfer.dropEffect="move";}} onDrop={event=>{event.preventDefault();const raw=event.dataTransfer.getData("text/plain");const fromId=Number(raw);if(raw!==""&&Number.isInteger(fromId)&&fromId!==nodeId)onReorder(fromId,nodeId);}}>
    {index > 0 && <div className="po-flow-connector" aria-hidden="true"><span /></div>}
    <div className="po-flow-node-shell"><button type="button" draggable className={"po-flow-node" + (selected ? " is-selected" : "") + (isNew ? " is-new" : "")} onClick={onClick} onDragStart={event=>{event.dataTransfer.setData("text/plain",String(nodeId));event.dataTransfer.effectAllowed="move";}} aria-pressed={selected} title="Click to edit. Drag, or press Alt with the up and down arrows, to reorder this step." onKeyDown={event=>{ if(!event.altKey) return; if(event.key==="ArrowUp"){event.preventDefault();onMove(nodeId,-1);} if(event.key==="ArrowDown"){event.preventDefault();onMove(nodeId,1);} }}>
      <span className={"po-flow-node-icon po-flow-node-icon--" + node.key}><Icon /></span><span className="po-flow-node-content"><span className="po-flow-node-kicker">{node.number} / {node.kind}</span><strong>{node.title}</strong><span>{node.summary}</span><small>{node.detail}</small></span><span className="po-flow-node-end" aria-hidden="true">⠿</span>
    </button>
    {onRemove && <button type="button" className="po-flow-node-remove" aria-label={"Remove step " + node.number + ": " + node.title} title="Remove this step" onClick={()=>onRemove(nodeId)}>×</button>}</div>
  </div>;
}

/**
 * Every dialog here is marked aria-modal, but none of them moved focus in, kept
 * focus inside, or closed on Escape - so a keyboard user tabbed straight through
 * the page behind the open dialog. `onClose` is held in a ref so the effect
 * depends only on `open`; otherwise an inline arrow prop would re-run it on every
 * render and steal focus back while the user is typing.
 */
export function useModalDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const node = ref.current;
    if (!open || !node) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusable = () => Array.from(node.querySelectorAll<HTMLElement>(
      'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
    )).filter(el => el.getBoundingClientRect().width > 0 || el.getBoundingClientRect().height > 0);
    (focusable()[0] ?? node).focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeRef.current(); return; }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) { event.preventDefault(); node.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const outside = !node.contains(active);
      if (event.shiftKey && (active === first || outside)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (active === last || outside)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus();
    };
  }, [open]);
  return ref;
}

function StepInspector({ nodeKey, nodeId, nodeConfig, onDirty, onEditorDirtyChange, seed, onClose, onApplied }: { nodeKey: BuilderNodeKey; nodeId:number; nodeConfig:NodeEditorConfig|null; onDirty: () => void; onEditorDirtyChange: (dirty:boolean) => void; seed: BuilderSeed|null; onClose: () => void; onApplied: (result: NodeEditorConfig) => void }) {
  const selected = builderNodes.find((node) => node.key === nodeKey) ?? builderNodes[0]!;
  const Icon = selected.icon;
  const sections = nodeKey === "trigger"
    ? [{ key: "basic", label: "Basic" }, { key: "advanced", label: "Advanced" }, { key: "ai", label: "AI Settings" }]
    : nodeKey === "goal"
      ? [{ key: "basic", label: "Basic" }, { key: "capture", label: "Capture Fields" }, { key: "validation", label: "Validation" }, { key: "success", label: "Success Message" }]
      : [{ key: "basic", label: "Message" }, { key: "presentation", label: "Instagram layout" }, { key: "ai", label: "AI Settings" }];
  const [tab, setTab] = useState("basic");
  const [triggerType, setTriggerType] = useState(seed?.triggerType ?? nodeConfig?.triggerType ?? "both");
  const [keywords, setKeywords] = useState(seed?.keywords ? seed.keywords.split(/[,\n]/).map(value=>value.trim()).filter(Boolean).join("\n") : nodeConfig?.keywords ? nodeConfig.keywords.split(/[,\n]/).map(value=>value.trim()).filter(Boolean).join("\n") : "price\nquote\ndetails");
  const [alsoStory, setAlsoStory] = useState(false);
  const [caseInsensitive, setCaseInsensitive] = useState(true);
  const [matchType, setMatchType] = useState("contains");
  const [alsoDm, setAlsoDm] = useState(true);
  const [messageText, setMessageText] = useState("Thanks for reaching out. I can help you find the right option. What are you looking for?");
  const [presentation, setPresentation] = useState("text");
  const [buttons, setButtons] = useState([{ title: "View details", action: "Open website", url: "https://example.com/details", destination: "Goal: capture interest" }]);
  const [cards, setCards] = useState([{ title: "Your offer", subtitle: "Options that fit your needs", imageUrl: "https://example.com/offer.jpg", actionTitle: "View details", actionType: "Open website", actionUrl: "https://example.com/details", actionDestination: "Goal: capture interest" }, { title: "Another option", subtitle: "Compare the available choices", imageUrl: "", actionTitle: "Ask a question", actionType: "Continue journey", actionUrl: "", actionDestination: "Goal: capture interest" }]);
  const [quickReplies, setQuickReplies] = useState([{ title: "Pricing", destination: "Ask about pricing" }, { title: "More information", destination: "Capture interest" }]);
  const [tone, setTone] = useState("Friendly and helpful");
  const [useKnowledge, setUseKnowledge] = useState(true);
  const [goalTitle, setGoalTitle] = useState("What the person needs");
  const [captureFields, setCaptureFields] = useState(["Interest", "Preferred timeline"]);
  const [showCreateField, setShowCreateField] = useState(false);
  const [fieldKey, setFieldKey] = useState("");
  const [fieldLabel, setFieldLabel] = useState("");
  const [fieldType, setFieldType] = useState("text");
  const [localError, setLocalError] = useState("");
  const [applyNotice, setApplyNotice] = useState("");
  const [editorDirty, setEditorDirty] = useState(false);
  const [showVariableMenu, setShowVariableMenu] = useState(false);

  useEffect(() => {
    setTab("basic");
    setEditorDirty(false);
    onEditorDirtyChange(false);
    setLocalError("");
    setApplyNotice("");
    setShowCreateField(false);
    setTriggerType(seed?.triggerType ?? nodeConfig?.triggerType ?? "both");
    setKeywords(seed?.keywords ? seed.keywords.split(/[,\n]/).map(value=>value.trim()).filter(Boolean).join("\n") : nodeConfig?.keywords ? nodeConfig.keywords.split(/[,\n]/).map(value=>value.trim()).filter(Boolean).join("\n") : "price\nquote\ndetails");
    setAlsoStory(nodeConfig?.alsoStory ?? false);
    setCaseInsensitive(nodeConfig?.caseInsensitive ?? true);
    setMatchType(nodeConfig?.matchType ?? "contains");
    setAlsoDm(nodeConfig?.alsoDm ?? true);
    setMessageText(nodeConfig?.messageText ?? "Thanks for reaching out. I can help you find the right option. What are you looking for?");
    setPresentation(nodeConfig?.presentation ?? "text");
    setButtons(nodeConfig?.buttons ?? [{ title: "View details", action: "Open website", url: "https://example.com/details", destination: "Goal: capture interest" }]);
    setCards(nodeConfig?.cards ?? [{ title: "Your offer", subtitle: "Options that fit your needs", imageUrl: "https://example.com/offer.jpg", actionTitle: "View details", actionType: "Open website", actionUrl: "https://example.com/details", actionDestination: "Goal: capture interest" }, { title: "Another option", subtitle: "Compare the available choices", imageUrl: "", actionTitle: "Ask a question", actionType: "Continue journey", actionUrl: "", actionDestination: "Goal: capture interest" }]);
    setQuickReplies(nodeConfig?.quickReplies ?? [{ title: "Pricing", destination: "Ask about pricing" }, { title: "More information", destination: "Capture interest" }]);
    setTone(nodeConfig?.tone ?? "Friendly and helpful");
    setUseKnowledge(nodeConfig?.useKnowledge ?? true);
    setGoalTitle(nodeConfig?.goalTitle ?? "What the person needs");
    setCaptureFields(nodeConfig?.captureFields ?? ["Interest", "Preferred timeline"]);
  }, [nodeKey,nodeId,nodeConfig,seed?.triggerType,seed?.keywords]);

  const edit = () => {
    setEditorDirty(true);
    onEditorDirtyChange(true);
    setLocalError("");
    setApplyNotice("");
  };
  const addButton = () => { setButtons(previous => previous.concat({ title: "", action: "Open website", url: "", destination: "" })); edit(); };
  const addCard = () => { setCards(previous => previous.concat({ title: "New option", subtitle: "", imageUrl: "", actionTitle: "", actionType: "Open website", actionUrl: "", actionDestination: "" })); edit(); };
  const applyToPreview = () => {
    setLocalError("");
    if (nodeKey === "trigger" && !keywords.trim()) {
      setLocalError("Add at least one keyword before applying this trigger.");
      return;
    }
    if (nodeKey === "reply" || nodeKey === "followup") {
      if (presentation === "buttons") {
        if (!messageText.trim()) { setLocalError("Add message text before adding buttons."); return; }
        if (buttons.length === 0) { setLocalError("Add at least one button."); return; }
        if (buttons.some(button => !button.title.trim())) { setLocalError("Every button needs a label."); return; }
      }
      if (presentation === "quick_replies" && (!messageText.trim() || quickReplies.some(reply => !reply.title.trim() || !reply.destination))) {
        setLocalError("Add message text and a label for each quick reply.");
        return;
      }
      if ((presentation === "card" || presentation === "gallery") && cards.some(card => !card.title.trim())) {
        setLocalError("Every card needs a title.");
        return;
      }
      if ((presentation === "card" || presentation === "gallery") && cards.some(card => card.imageUrl.trim() && !/^https:\/\//i.test(card.imageUrl.trim()))) { setLocalError("Card images need a valid HTTPS URL."); return; }
      if ((presentation === "card" || presentation === "gallery") && cards.some(card => card.actionType === "Open website" && card.actionUrl && !/^https:\/\//i.test(card.actionUrl.trim()))) { setLocalError("Card buttons need a valid HTTPS URL."); return; }
    }
    if (nodeKey === "goal" && !goalTitle.trim()) {
      setLocalError("Goal title cannot be empty.");
      return;
    }
    setEditorDirty(false);
    onEditorDirtyChange(false);
    onDirty();
    setApplyNotice("Changes applied to this local preview draft. Use Save changes in the header to mark the draft saved.");
    onApplied({
      triggerType,keywords:keywords.split(/\n/).map(value=>value.trim()).filter(Boolean).join(", "),
      alsoStory,caseInsensitive,matchType,alsoDm,messageText,presentation,buttons,cards,quickReplies,tone,useKnowledge,goalTitle,captureFields,
    });
    onClose();
  };
  const resetEditor = () => {
    if (nodeKey === "trigger") { setTriggerType("both"); setKeywords("price\nquote\ndetails"); setAlsoStory(false); setCaseInsensitive(true); setMatchType("contains"); setAlsoDm(true); }
    if (nodeKey === "reply" || nodeKey === "followup") { setMessageText("Thanks for reaching out. I can help you find the right option. What are you looking for?"); setPresentation("text"); setButtons([{ title: "View details", action: "Open website", url: "https://example.com/details", destination: "Goal: capture interest" }]); setCards([{ title: "Your offer", subtitle: "Options that fit your needs", imageUrl: "https://example.com/offer.jpg", actionTitle: "View details", actionType: "Open website", actionUrl: "https://example.com/details", actionDestination: "Goal: capture interest" }, { title: "Another option", subtitle: "Compare the available choices", imageUrl: "", actionTitle: "Ask a question", actionType: "Continue journey", actionUrl: "", actionDestination: "Goal: capture interest" }]); setQuickReplies([{ title: "Pricing", destination: "Ask about pricing" }, { title: "More information", destination: "Capture interest" }]); setTone("Friendly and helpful"); setUseKnowledge(true); }
    if (nodeKey === "goal") { setGoalTitle("What the person needs"); setCaptureFields(["Interest", "Preferred timeline"]); }
    setEditorDirty(true); onEditorDirtyChange(true); setLocalError(""); setApplyNotice("Example values restored locally. Apply these changes or discard them before closing.");
  };

  const tabNavigation = <div className="po-inspector-tabs po-inspector-tabs--sections" role="tablist" aria-label="Node editor sections">
    {sections.map(section => <button type="button" role="tab" id={"po-inspector-tab-"+section.key} aria-controls="po-inspector-panel" aria-selected={tab === section.key} className={tab === section.key ? "is-active" : ""} key={section.key} onClick={() => setTab(section.key)}>{section.label}</button>)}
  </div>;

  return <aside className="po-inspector" aria-label="Step settings">
    {tabNavigation}
    <div id="po-inspector-panel" className="po-inspector-panel" role="tabpanel" aria-labelledby={"po-inspector-tab-"+tab}>
    <div className="po-inspector-title"><span className={"po-inspector-icon po-flow-node-icon--" + selected.key}><Icon /></span><div><span className="po-eyebrow">{selected.kind}</span><h2>{selected.title}</h2><p>{selected.summary}</p></div></div>

    {nodeKey === "trigger" && tab === "basic" && <div className="po-inspector-fields">
      <label>Trigger type<select value={triggerType} onChange={e=>{setTriggerType(e.target.value);edit();}}><option value="comment">Instagram comments</option><option value="message">Direct messages</option><option value="both">Comments and direct messages</option></select></label>
      <label>Matching words or phrases <span className="po-field-meta">One phrase per line</span><textarea rows={4} value={keywords} onChange={e=>{setKeywords(e.target.value);edit();}} aria-label="Sample trigger keywords"/></label>
      <label>Match type<select value={matchType} onChange={e=>{setMatchType(e.target.value);edit();}}><option value="contains">Contains</option><option value="exact">Exact match</option></select></label>
      <label className="po-toggle-row"><span><strong>Also trigger on story replies</strong><small>Include replies to Instagram stories.</small></span><input type="checkbox" checked={alsoStory} onChange={e=>{setAlsoStory(e.target.checked);edit();}}/></label>
      <label className="po-toggle-row"><span><strong>Case insensitive matching</strong><small>“PRICE” matches “price”.</small></span><input type="checkbox" checked={caseInsensitive} onChange={e=>{setCaseInsensitive(e.target.checked);edit();}}/></label>
      <label className="po-toggle-row"><span><strong>Also trigger on direct messages</strong><small>Include DMs alongside the selected trigger.</small></span><input type="checkbox" checked={alsoDm} onChange={e=>{setAlsoDm(e.target.checked);edit();}}/></label>
      <p className="po-help">Only matching comments and messages start this automation.</p>
    </div>}
    {nodeKey === "trigger" && (tab === "advanced" || tab === "ai") && <div className="po-inspector-fields">
      <Tag>Coming soon</Tag><h3 className="po-editor-subtitle">{tab === "advanced" ? "Advanced trigger settings" : "Trigger AI settings"}</h3>
      <p className="po-help">Additional trigger controls will appear here as they become available. This matches the current product scope; there are no editable settings in this section yet.</p>
    </div>}

    {(nodeKey === "reply" || nodeKey === "followup") && tab === "basic" && <div className="po-inspector-fields">
      <label>Message <span className="po-field-meta">This is an example, not a live reply.</span><textarea rows={5} value={messageText} onChange={e=>{setMessageText(e.target.value);edit();}} maxLength={640} aria-label="Sample Instagram message"/></label>
      <div className="po-character-count">{messageText.length} / 640 characters</div>
      <button type="button" className="po-button po-button--secondary" onClick={()=>setShowVariableMenu(v=>!v)}>{showVariableMenu ? "Hide variables" : "{ } Insert variable"}</button>
      {showVariableMenu && <div className="po-variable-menu">{[["First name","{{lead.first_name}}"],["Lead interest","{{lead.interest}}"],["Business name","{{workspace.name}}"]].map(([label,value])=><button type="button" key={value} onClick={()=>{setMessageText(previous=>previous+value);setShowVariableMenu(false);edit();}}><strong>{label}</strong><code>{value}</code></button>)}</div>}
      <p className="po-help">Cards and galleries use each card’s title and subtitle instead of a separate message caption.</p>
    </div>}
    {(nodeKey === "reply" || nodeKey === "followup") && tab === "presentation" && <div className="po-inspector-fields">
      <h3 className="po-editor-subtitle">Instagram message layout</h3><p className="po-help">Choose the native Instagram presentation for this journey step.</p>
      <label>Layout<select value={presentation} onChange={e=>{setPresentation(e.target.value);edit();}}><option value="text">Plain text</option><option value="buttons">Text + buttons</option><option value="card">Single card</option><option value="gallery">Gallery / carousel</option><option value="quick_replies">Quick replies</option></select></label>
      {presentation === "buttons" && <div className="po-editor-group"><div className="po-editor-group-heading"><strong>Buttons</strong><button type="button" className="po-text-action" disabled={buttons.length>=3} onClick={addButton}>+ Add button</button></div>{buttons.map((button,index)=><div className="po-editor-item" key={index}><label>Button label<input maxLength={20} value={button.title} onChange={e=>{setButtons(previous=>previous.map((item,i)=>i===index?{...item,title:e.target.value}:item));edit();}} placeholder="View details"/></label><label>Action<select value={button.action} onChange={e=>{setButtons(previous=>previous.map((item,i)=>i===index?{...item,action:e.target.value}:item));edit();}}><option>Open website</option><option>Continue journey</option></select></label>{button.action==="Open website"&&<label>HTTPS URL<input value={button.url} onChange={e=>{setButtons(previous=>previous.map((item,i)=>i===index?{...item,url:e.target.value}:item));edit();}} placeholder="https://example.com"/></label>}{button.action==="Continue journey"&&<label>Journey destination<select value={button.destination} onChange={e=>{setButtons(previous=>previous.map((item,i)=>i===index?{...item,destination:e.target.value}:item));edit();}}><option value="">Choose connected step…</option><option>Goal: capture interest</option><option>Follow-up message</option><option>Human handoff</option></select></label>}<button type="button" className="po-text-action" disabled={buttons.length===1} onClick={()=>{setButtons(previous=>previous.filter((_,i)=>i!==index));edit();}}>Remove button</button></div>)}</div>}
      {(presentation==="card"||presentation==="gallery")&&<div className="po-editor-group"><div className="po-editor-group-heading"><strong>{presentation==="gallery"?"Gallery cards":"Card content"}</strong>{presentation==="gallery"&&<button type="button" className="po-text-action" disabled={cards.length>=10} onClick={addCard}>+ Add card</button>}</div>{(presentation==="gallery"?cards:cards.slice(0,1)).map((card,index)=><div className="po-editor-item" key={index}><div className="po-editor-group-heading"><strong>Card {index+1}</strong><Tag>{presentation==="gallery"?"Carousel item":"Single card"}</Tag></div><label>Title<input value={card.title} maxLength={80} onChange={e=>{setCards(previous=>previous.map((item,i)=>i===index?{...item,title:e.target.value}:item));edit();}} placeholder="Your offer"/></label><label>Subtitle (optional)<input value={card.subtitle} maxLength={80} onChange={e=>{setCards(previous=>previous.map((item,i)=>i===index?{...item,subtitle:e.target.value}:item));edit();}} placeholder="A short description"/></label><label>Image URL (optional)<input value={card.imageUrl} onChange={e=>{setCards(previous=>previous.map((item,i)=>i===index?{...item,imageUrl:e.target.value}:item));edit();}} placeholder="https://example.com/image.jpg"/></label><div className="po-editor-group-heading"><strong>Card actions</strong><Tag>1 example action</Tag></div><label>Button label<input value={card.actionTitle} maxLength={20} onChange={e=>{setCards(previous=>previous.map((item,i)=>i===index?{...item,actionTitle:e.target.value}:item));edit();}} placeholder="View details"/></label><label>Action<select value={card.actionType} onChange={e=>{setCards(previous=>previous.map((item,i)=>i===index?{...item,actionType:e.target.value}:item));edit();}}><option>Open website</option><option>Continue journey</option></select></label>{card.actionType==="Open website"?<label>HTTPS URL<input value={card.actionUrl} onChange={e=>{setCards(previous=>previous.map((item,i)=>i===index?{...item,actionUrl:e.target.value}:item));edit();}} placeholder="https://example.com"/></label>:<label>Journey destination<select value={card.actionDestination??""} onChange={e=>{setCards(previous=>previous.map((item,i)=>i===index?{...item,actionDestination:e.target.value}:item));edit();}}><option value="">Choose connected step…</option><option>Goal: capture interest</option><option>Follow-up message</option><option>Human handoff</option></select></label>}{presentation==="gallery"&&cards.length>2&&<button type="button" className="po-text-action" onClick={()=>{setCards(previous=>previous.filter((_,i)=>i!==index));edit();}}>Remove card</button>}</div>)}</div>}
      {presentation==="quick_replies"&&<div className="po-editor-group"><div className="po-editor-group-heading"><strong>Quick replies</strong><button type="button" className="po-text-action" disabled={quickReplies.length>=13} onClick={()=>{setQuickReplies(previous=>previous.concat({title:"",destination:""}));edit();}}>+ Add quick reply</button></div>{quickReplies.map((reply,index)=><div className="po-editor-item" key={index}><label>Label<input maxLength={20} value={reply.title} onChange={e=>{setQuickReplies(previous=>previous.map((item,i)=>i===index?{...item,title:e.target.value}:item));edit();}} placeholder="Pricing"/></label><label>Journey destination<select value={reply.destination} onChange={e=>{setQuickReplies(previous=>previous.map((item,i)=>i===index?{...item,destination:e.target.value}:item));edit();}}><option value="">Choose connected step…</option><option>Ask about pricing</option><option>Capture interest</option><option>Follow-up message</option><option>Human handoff</option></select></label><button type="button" className="po-text-action" disabled={quickReplies.length===1} onClick={()=>{setQuickReplies(previous=>previous.filter((_,i)=>i!==index));edit();}}>Remove quick reply</button></div>)}</div>}
    </div>}
    {(nodeKey === "reply" || nodeKey === "followup") && tab === "ai" && <div className="po-inspector-fields">
      <div className="po-inspector-option"><span className="po-option-check"><CheckCircleIcon/></span><span><strong>AI Settings</strong><small>Choose how AI writes text for this journey step.</small></span></div>
      <label>Tone<select value={tone} onChange={e=>{setTone(e.target.value);edit();}}><option>Friendly and helpful</option><option>Professional</option><option>Concise</option><option>Warm and conversational</option></select></label>
      <label className="po-toggle-row"><span><strong>Use knowledge base for context</strong><small>Ground claims in configured business sources.</small></span><input type="checkbox" checked={useKnowledge} onChange={e=>{setUseKnowledge(e.target.checked);edit();}}/></label>
      <p className="po-help">No model call or live reply is made by this preview.</p>
    </div>}

    {nodeKey === "goal" && tab === "basic" && <div className="po-inspector-fields">
      <label>Goal title<input value={goalTitle} onChange={e=>{setGoalTitle(e.target.value);edit();}} aria-label="Goal title"/></label>
      <div><span className="po-field-heading">Description</span><p className="po-help">Conversational goal the AI works toward.</p></div>
    </div>}
    {nodeKey === "goal" && tab === "capture" && <div className="po-inspector-fields">
      <h3 className="po-editor-subtitle">Captured fields</h3><p className="po-help">Structured values this goal should capture.</p>
      {captureFields.length===0&&<div className="po-empty-detail"><strong>No captured fields yet</strong><span>Add a field when this goal needs structured information.</span></div>}
      {captureFields.map(field=><div className="po-inspector-option" key={field}><span><strong>{field}</strong><small>{field==="Interest"?"Text":field==="Preferred timeline"?"Text":"Sample field"}</small></span><button type="button" className="po-text-action" onClick={()=>{setCaptureFields(previous=>previous.filter(item=>item!==field));edit();}}>Remove</button></div>)}
      {["Interest","Preferred timeline","Email","Phone number","Budget range"].filter(field=>!captureFields.includes(field)).length>0&&<label>Add field<select value="" onChange={e=>{if(e.target.value){setCaptureFields(previous=>previous.concat(e.target.value));edit();}}}><option value="">+ Add field</option>{["Interest","Preferred timeline","Email","Phone number","Budget range"].filter(field=>!captureFields.includes(field)).map(field=><option key={field}>{field}</option>)}</select></label>}
      <button type="button" className="po-button po-button--secondary" onClick={()=>setShowCreateField(v=>!v)}>{showCreateField?"Cancel":"Create field"}</button>
      {showCreateField&&<div className="po-editor-item"><label>Field key<input value={fieldKey} onChange={e=>setFieldKey(e.target.value)} placeholder="automation_interest"/></label><label>Label<input value={fieldLabel} onChange={e=>setFieldLabel(e.target.value)} placeholder="Automation interest"/></label><label>Value type<select value={fieldType} onChange={e=>setFieldType(e.target.value)}>{["text","email","phone","country","number","date"].map(value=><option key={value}>{value}</option>)}</select></label><button type="button" className="po-button po-button--secondary" disabled={!fieldKey.trim()||!fieldLabel.trim()} onClick={()=>{setCaptureFields(previous=>previous.concat(fieldLabel.trim()));setShowCreateField(false);setFieldKey("");setFieldLabel("");edit();}}>Add field to preview</button></div>}
    </div>}
    {nodeKey === "goal" && tab === "validation" && <div className="po-inspector-fields"><h3 className="po-editor-subtitle">Validation</h3><p className="po-help">No validation rules are configured for this goal.</p><Tag>Not configured</Tag></div>}
    {nodeKey === "goal" && tab === "success" && <div className="po-inspector-fields"><h3 className="po-editor-subtitle">Success message</h3><p className="po-help">No success message is configured for this goal.</p><Tag>Not configured</Tag></div>}
    {localError&&<div className="po-inline-notice po-inline-notice--error" role="alert">{localError}</div>}
    {applyNotice&&<div className="po-inline-notice" role="status">{applyNotice}</div>}
    <div className="po-inspector-footer"><span>{editorDirty?"Unsaved changes in node editor":"Preview settings · local only"}</span><div className="po-inspector-footer-actions"><button type="button" className="po-button po-button--quiet" onClick={resetEditor}>Reset</button><button type="button" className="po-button po-button--secondary" disabled={!editorDirty} onClick={applyToPreview}>Apply to preview</button></div></div>
    </div>
  </aside>;
}

function BuilderScreen({ dirty, onSelectNode, automationName, onDirty, onOpenLead, onSavePreview, seed, inspectorCloseRequest, onInspectorDirtyChange, onInspectorDiscarded, onInspectorCloseCancelled }: {
  dirty: boolean; onSelectNode: (key: BuilderNodeKey) => void; automationName: string; onDirty: () => void; onOpenLead: (name: string) => void; onSavePreview: () => void; seed: BuilderSeed|null; inspectorCloseRequest: number; onInspectorDirtyChange: (dirty:boolean) => void; onInspectorDiscarded: () => void; onInspectorCloseCancelled: () => void;
}) {
  const [selectedNode, setSelectedNode] = useState<BuilderNodeKey>("trigger");
  const [selectedNodeId,setSelectedNodeId] = useState(0);
  const [nodeConfigs,setNodeConfigs] = useState<Record<number,NodeEditorConfig>>({});
  const [inspectorOpen,setInspectorOpen] = useState(false);
  const [inspectorDirty,setInspectorDirty] = useState(false);
  const [confirmInspectorClose,setConfirmInspectorClose] = useState(false);
  const [inspectorKey,setInspectorKey] = useState(0);
  const [pendingInspectorTab,setPendingInspectorTab] = useState<string|null>(null);
  useEffect(()=>{if(inspectorCloseRequest>0){setPendingInspectorTab(null);setConfirmInspectorClose(true);}},[inspectorCloseRequest]);
  const [addedNodes,setAddedNodes] = useState<Array<{id:number;key:BuilderNodeKey}>>([]);
  const [nodeOrder,setNodeOrder] = useState<number[]>([0,1,2,3]);
  const [flowStepCount,setFlowStepCount] = useState(4);
  const [subTab, setSubTab] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get("builderTab");
    return requested && ["Flow", "Setup", "Results", "Leads"].includes(requested) ? requested : "Flow";
  });
  const [draftName, setDraftName] = useState(automationName);
  const [description, setDescription] = useState("Reply to matching comments and DMs, then collect the details your team needs.");
  const [triggerType, setTriggerType] = useState(seed?.triggerType ?? "both");
  const [keywords, setKeywords] = useState(seed?.keywords ?? "price, quote, details");
  const [account, setAccount] = useState("@creatorstudio");
  const [knowledgeEnabled, setKnowledgeEnabled] = useState(true);
  const [handoffEnabled, setHandoffEnabled] = useState(true);
  const [goalQuestion, setGoalQuestion] = useState("What are you looking for help with?");
  const [resultPeriod, setResultPeriod] = useState("Last 7 days");
  const [pendingTab,setPendingTab] = useState<string|null>(null);
  const applyTabSwitch = (tab: string) => {
    setSubTab(tab);
    if(tab !== "Flow") setInspectorOpen(false);
    const params = new URLSearchParams(window.location.search);
    params.set("preview", "precision-operations");
    params.set("screen", "builder");
    params.set("builderTab", tab);
    window.history.replaceState(null, "", window.location.pathname + "?" + params.toString());
  };
  const switchTab = (tab: string) => {
    if(tab !== subTab && inspectorDirty) { setPendingInspectorTab(tab); setConfirmInspectorClose(true); return; }
    if(dirty && tab !== subTab) { setPendingTab(tab); return; }
    applyTabSwitch(tab);
  };
  const requestInspectorClose = () => { if(inspectorDirty) setConfirmInspectorClose(true); else setInspectorOpen(false); };
  const discardInspectorEdits = () => {
    setConfirmInspectorClose(false);
    setInspectorDirty(false);
    setInspectorOpen(false);
    setInspectorKey(value=>value+1);
    onInspectorDirtyChange(false);
    const next=pendingInspectorTab;
    setPendingInspectorTab(null);
    if(next) {
      if(dirty) setPendingTab(next);
      else applyTabSwitch(next);
    } else {
      onInspectorDiscarded();
    }
  };
  const resetBuilderDraft = () => {
    setDraftName(automationName);
    setDescription("Reply to matching comments and DMs, then collect the details your team needs.");
    setTriggerType(seed?.triggerType ?? "both");
    setKeywords(seed?.keywords ?? "price, quote, details");
    setAccount("@creatorstudio");
    setKnowledgeEnabled(true);
    setHandoffEnabled(true);
    setGoalQuestion("What are you looking for help with?");
    setAddedNodes([]);
    setNodeOrder([0,1,2,3]);
    setFlowStepCount(4);
    setNodeConfigs({});
    setSelectedNodeId(0);
    setSelectedNode("trigger");
    onSelectNode("trigger");
    setInspectorOpen(false);
  };
  const continueTabAfterDecision = (decision: "save"|"discard") => {
    const next = pendingTab;
    if(!next) return;
    if(decision === "discard") resetBuilderDraft();
    onSavePreview();
    setPendingTab(null);
    applyTabSwitch(next);
  };
  const sourceNodes = [
    ...builderNodes.map((node,index)=>({...node,nodeId:index})),
    ...addedNodes.map(item=>({...builderNodes.find(node=>node.key===item.key)!,nodeId:item.id,number:String(item.id+1).padStart(2,"0")})),
  ];
  const visibleNodes = nodeOrder.map(id=>sourceNodes.find(node=>node.nodeId===id)).filter((node): node is (typeof sourceNodes)[number] => node !== undefined);
  const [flowNotice,setFlowNotice] = useState("");
  const [justAddedId,setJustAddedId] = useState<number|null>(null);
  const [undoRemoval,setUndoRemoval] = useState<{id:number;key:BuilderNodeKey;index:number}|null>(null);
  const ZOOM_STEPS = [60,75,90,100,115,130];
  const [zoom,setZoom] = useState(100);
  const stepZoom = (direction:-1|1) => setZoom(current=>{
    const i=ZOOM_STEPS.indexOf(current);
    return ZOOM_STEPS[Math.min(ZOOM_STEPS.length-1,Math.max(0,(i<0?3:i)+direction))] ?? current;
  });
  // The canvas gave no sign a step had landed: the inspector opened over it and the
  // node count only changed in the footer. Announce what was added, mark the node,
  // and bring it into view so the change is visible once the inspector closes.
  const announceFlowChange = (message:string, nodeId:number|null) => {
    setFlowNotice(message);
    setJustAddedId(nodeId);
    if(nodeId!==null) window.setTimeout(()=>{
      document.querySelector('.po-flow-node.is-new')?.scrollIntoView({block:"nearest",behavior:"smooth"});
    },60);
  };
  useEffect(()=>{
    if(!flowNotice) return;
    const timer=window.setTimeout(()=>{setFlowNotice("");setJustAddedId(null);setUndoRemoval(null);},8000);
    return ()=>window.clearTimeout(timer);
  },[flowNotice]);
  const removeFlowNode = (nodeId:number) => {
    const removed = visibleNodes.find(node=>node.nodeId===nodeId);
    if(!removed) return;
    // Deleting a step is destructive and the preview has no history, so the removal
    // stays recoverable from the notice rather than behind a confirmation dialog.
    setUndoRemoval({id:nodeId,key:removed.key,index:nodeOrder.indexOf(nodeId)});
    setNodeOrder(current=>current.filter(id=>id!==nodeId));
    setFlowStepCount(current=>Math.max(1,current-1));
    if(selectedNodeId===nodeId){ setInspectorOpen(false); setSelectedNodeId(0); setSelectedNode("trigger"); onSelectNode("trigger"); }
    announceFlowChange(removed.title+" removed from the flow", null);
    onDirty();
  };
  const undoRemoveFlowNode = () => {
    if(!undoRemoval) return;
    const { id, index } = undoRemoval;
    setNodeOrder(current=>{ const next=[...current]; next.splice(Math.min(index,next.length),0,id); return next; });
    setFlowStepCount(current=>current+1);
    announceFlowChange("Step restored to the flow", id);
    setUndoRemoval(null);
  };
  // Drag is the only way to reorder, which leaves keyboard and assistive-tech users
  // with no route at all (WCAG 2.5.7). Alt+Arrow moves the focused step.
  const moveFlowNode = (nodeId:number, direction:-1|1) => {
    setNodeOrder(current=>{
      const from=current.indexOf(nodeId); const to=from+direction;
      if(from<0||to<0||to>=current.length) return current;
      const next=[...current]; const [moved]=next.splice(from,1); next.splice(to,0,moved!);
      return next;
    });
    onDirty();
  };
  const reorderFlowNodes = (fromId:number,toId:number) => {
    setNodeOrder(current=>{
      const from=current.indexOf(fromId),to=current.indexOf(toId);
      if(from<0||to<0||from===to)return current;
      const next=[...current];
      const [moved]=next.splice(from,1);
      next.splice(to,0,moved!);
      return next;
    });
    onDirty();
  };
  const inspectorRef = useModalDialog(inspectorOpen, requestInspectorClose);
  const inspectorDiscardRef = useModalDialog(confirmInspectorClose, () => { setConfirmInspectorClose(false); setPendingInspectorTab(null); onInspectorCloseCancelled(); });
  const pendingTabRef = useModalDialog(Boolean(pendingTab), () => setPendingTab(null));
  const addPaletteNode = (key: BuilderNodeKey) => {
    if(key === "trigger") {
      setSelectedNode("trigger");setSelectedNodeId(0);onSelectNode("trigger");
    } else {
      const id=builderNodes.length+addedNodes.length;
      setAddedNodes(current=>current.concat({id,key}));
      setNodeOrder(current=>current.concat(id));
      setFlowStepCount(current=>current+1);
      setSelectedNode(key);setSelectedNodeId(id);onSelectNode(key);onDirty();
      announceFlowChange((builderNodes.find(node=>node.key===key)?.title ?? "Step")+" added to the flow", id);
    }
    setInspectorOpen(true);
  };
  const addAnotherMessage = () => {
    const id=builderNodes.length+addedNodes.length;
    setAddedNodes(current=>current.concat({id,key:"followup"}));
    setNodeOrder(current=>current.concat(id));
    setFlowStepCount(current=>current+1);
    setSelectedNode("followup");setSelectedNodeId(id);onSelectNode("followup");onDirty();announceFlowChange("Message step added to the flow", id);setInspectorOpen(true);
  };
  return <section className="po-builder-screen" aria-label="Automation builder concept">
    <div className="po-builder-subnav"><div className="po-builder-subnav-tabs" role="tablist" aria-label="Automation sections">{["Flow", "Setup", "Results", "Leads"].map(tab => <button key={tab} type="button" role="tab" id={"po-builder-tab-"+tab.toLowerCase()} aria-controls="po-builder-panel" aria-selected={subTab===tab} className={subTab===tab?"is-active":""} onClick={()=>switchTab(tab)}>{tab}</button>)}</div><div className="po-builder-subnav-right"><span className="po-flow-summary"><span />{dirty ? "Draft has unsaved changes" : "Preview marked saved"}</span></div></div>
    <div id="po-builder-panel" role="tabpanel" aria-labelledby={"po-builder-tab-"+subTab.toLowerCase()}>
    {subTab === "Flow" && <div className="po-builder-grid"><BuilderPalette onSelect={addPaletteNode} /><section className="po-canvas" aria-label="Automation flow"><div className="po-canvas-topline"><span>{automationName} flow</span>{flowNotice?<span className="po-flow-notice" role="status">{flowNotice}{undoRemoval&&<button type="button" className="po-flow-notice-undo" onClick={undoRemoveFlowNode}>Undo</button>}</span>:<span>Illustrative layout · not connected to runtime</span>}</div><div className="po-canvas-workspace"><div className="po-canvas-watermark">SAMPLE FLOW</div><div className="po-flow" style={{zoom:zoom/100}}>{visibleNodes.map((node, index) => <FlowNode key={node.nodeId} node={{...node,number:String(index+1).padStart(2,"0")}} nodeId={node.nodeId} index={index} selected={node.nodeId===selectedNodeId} onReorder={reorderFlowNodes} onRemove={node.key==="trigger"?null:removeFlowNode} onMove={moveFlowNode} isNew={node.nodeId===justAddedId} onClick={() => { setSelectedNode(node.key);setSelectedNodeId(node.nodeId);onSelectNode(node.key);setInspectorOpen(true); }} />)}<button type="button" className="po-add-step" onClick={addAnotherMessage}><PlusIcon /> Add another message</button></div></div><div className="po-canvas-footer"><span role="status" aria-live="polite" data-step-count={flowStepCount}>{flowStepCount} steps · Sample flow only</span><div><button type="button" aria-label="Zoom out" title="Zoom out" disabled={zoom===ZOOM_STEPS[0]} onClick={()=>stepZoom(-1)}>−</button><span role="status" aria-live="polite">{zoom}%</span><button type="button" aria-label="Zoom in" title="Zoom in" disabled={zoom===ZOOM_STEPS[ZOOM_STEPS.length-1]} onClick={()=>stepZoom(1)}>+</button></div></div></section></div>}
    </div>
    <div className={"po-modal-backdrop po-inspector-backdrop"+(inspectorOpen?"":" is-hidden")} role="presentation" aria-hidden={!inspectorOpen} onMouseDown={event=>event.target===event.currentTarget&&requestInspectorClose()}><section ref={inspectorRef} tabIndex={-1} className="po-modal po-inspector-dialog" role="dialog" aria-modal={inspectorOpen} aria-label="Edit flow step"><div className="po-inspector-dialog-actions"><span className="po-eyebrow">NODE INSPECTOR · SAMPLE</span><button type="button" className="po-icon-button" aria-label="Close step inspector" onClick={requestInspectorClose}>×</button></div><StepInspector key={inspectorKey} nodeKey={selectedNode} nodeId={selectedNodeId} nodeConfig={nodeConfigs[selectedNodeId]??null} onDirty={onDirty} seed={{triggerType,keywords}} onClose={()=>setInspectorOpen(false)} onEditorDirtyChange={(value)=>{setInspectorDirty(value);onInspectorDirtyChange(value);}} onApplied={(result)=>{setNodeConfigs(current=>({...current,[selectedNodeId]:{...(current[selectedNodeId]??{}),...result}}));if(selectedNode==="trigger"){if(result.triggerType)setTriggerType(result.triggerType);if(result.keywords)setKeywords(result.keywords);}}}/></section></div>
    {confirmInspectorClose&&<div className="po-modal-backdrop po-inspector-discard-backdrop" role="presentation"><section ref={inspectorDiscardRef} tabIndex={-1} className="po-modal" role="alertdialog" aria-modal="true" aria-labelledby="po-inspector-discard-title"><div className="po-modal-top"><span className="po-modal-icon po-modal-icon--warning">!</span><button type="button" className="po-icon-button" aria-label="Keep editing this step" onClick={()=>{setConfirmInspectorClose(false);setPendingInspectorTab(null);onInspectorCloseCancelled();}}>×</button></div><span className="po-eyebrow">UNSAVED STEP CHANGES</span><h2 id="po-inspector-discard-title">Discard inspector changes?</h2><p>You have edited this step but have not applied those changes to the automation draft.</p><div className="po-modal-footer"><button type="button" className="po-button po-button--quiet" onClick={()=>{setConfirmInspectorClose(false);setPendingInspectorTab(null);onInspectorCloseCancelled();}}>Keep editing</button><button type="button" className="po-button po-button--secondary" onClick={discardInspectorEdits}>Discard changes</button></div></section></div>}
    {subTab === "Setup" && <div className="po-builder-setup">
      <div className="po-setup-main"><div className="po-step-section"><span className="po-step-number">01</span><div className="po-step-section-body"><span className="po-eyebrow">BASICS</span><h2>Name and purpose</h2><p>A clear name makes the automation easy to find and identify later.</p><label className="po-field-block">Automation name<input value={draftName} onChange={e=>{setDraftName(e.target.value);onDirty();}} maxLength={100}/></label><label className="po-field-block">Description<textarea rows={3} value={description} onChange={e=>{setDescription(e.target.value);onDirty();}}/></label></div></div>
      <div className="po-step-section"><span className="po-step-number">02</span><div className="po-step-section-body"><span className="po-eyebrow">START CONDITION</span><h2>When should it start?</h2><p>Choose which inbound interaction can trigger this automation.</p><label className="po-field-block">Trigger source<select value={triggerType} onChange={e=>{setTriggerType(e.target.value);onDirty();}}><option value="comment">Comment</option><option value="message">Direct message</option><option value="both">Comment or direct message</option></select></label><label className="po-field-block">Keywords<textarea rows={3} value={keywords} onChange={e=>{setKeywords(e.target.value);onDirty();}}/><span className="po-help">Separate phrases with commas. Matching behavior depends on the configured trigger rules.</span></label></div></div>
      <div className="po-step-section"><span className="po-step-number">03</span><div className="po-step-section-body"><span className="po-eyebrow">INSTAGRAM ACCOUNT</span><h2>Choose the account</h2><p>A published automation needs at least one healthy assigned account.</p><label className="po-field-block">Assigned account<select value={account} onChange={e=>{setAccount(e.target.value);onDirty();}}><option>@creatorstudio</option><option>@studioaccount</option><option>No account assigned</option></select></label><div className="po-readiness-row"><span><CheckCircleIcon/> Sample connection state</span><Tag tone={account==="No account assigned"?"warning":"green"}>{account==="No account assigned"?"Not assigned":"Healthy · sample"}</Tag></div></div></div>
      <div className="po-step-section"><span className="po-step-number">04</span><div className="po-step-section-body"><span className="po-eyebrow">AI BEHAVIOR</span><h2>Reply guidance</h2><p>Set how the AI uses approved knowledge and when a person should step in.</p><label className="po-toggle-row"><span><strong>Use knowledge base</strong><small>Ground replies in the sources marked Ready.</small></span><input type="checkbox" checked={knowledgeEnabled} onChange={e=>{setKnowledgeEnabled(e.target.checked);onDirty();}}/></label><label className="po-toggle-row"><span><strong>Escalate when uncertain</strong><small>Route unclear or sensitive questions for human review.</small></span><input type="checkbox" checked={handoffEnabled} onChange={e=>{setHandoffEnabled(e.target.checked);onDirty();}}/></label></div></div>
      <div className="po-step-section"><span className="po-step-number">05</span><div className="po-step-section-body"><span className="po-eyebrow">LEAD QUALIFICATION</span><h2>Question and captured fields</h2><p>Ask a specific question and store the answer in a structured lead field.</p><label className="po-field-block">Question<textarea rows={2} value={goalQuestion} onChange={e=>{setGoalQuestion(e.target.value);onDirty();}}/></label><div className="po-captured-facts"><div><span>Interest</span><strong>Text · sample field</strong></div><div><span>Preferred timeline</span><strong>Text · sample field</strong></div></div></div></div>
      </div><aside className="po-setup-summary"><span className="po-eyebrow">READINESS CHECK</span><h2>Before publishing</h2><p>Review every requirement before this automation can reply to real customers.</p><div className="po-readiness-checks"><div><CheckCircleIcon/><span><strong>Basic details</strong><small>Name and description present</small></span><Tag tone="green">Ready</Tag></div><div><CheckCircleIcon/><span><strong>Trigger configured</strong><small>{keywords.trim()?"Keywords present":"Add a keyword"}</small></span><Tag tone={keywords.trim()?"green":"warning"}>{keywords.trim()?"Ready":"Blocked"}</Tag></div><div><CheckCircleIcon/><span><strong>Account assigned</strong><small>{account}</small></span><Tag tone={account==="No account assigned"?"warning":"green"}>{account==="No account assigned"?"Blocked":"Ready"}</Tag></div><div><CheckCircleIcon/><span><strong>Draft reviewed</strong><small>Test before publishing</small></span><Tag>Review</Tag></div></div><div className="po-warning-note"><span>!</span><span><strong>Preview-only readiness</strong><small>This checklist doesn't call the real account readiness or validation APIs.</small></span></div></aside>
    </div>}
    {subTab === "Results" && <section className="po-builder-results"><div className="po-screen-toolbar"><div><span className="po-eyebrow">AUTOMATION RESULTS</span><p>Only sample data is shown. Production metrics need a defined reporting window.</p></div><label className="po-select-wrap"><span className="po-visually-hidden">Results period</span><select value={resultPeriod} onChange={e=>setResultPeriod(e.target.value)}><option>Last 7 days</option><option>Last 30 days</option><option>This month</option></select><ChevronDownIcon/></label></div><div className="po-metric-row"><div className="po-metric"><span>Trigger events</span><strong>42</strong><small>sample runs in {resultPeriod.toLowerCase()}</small></div><div className="po-metric"><span>Replies sent</span><strong>35</strong><small>example event count</small></div><div className="po-metric"><span>Lead records created</span><strong>12</strong><small>unique leads · sample</small></div><div className="po-metric"><span>Human reviews</span><strong>4</strong><small>sample handoff count</small></div></div><div className="po-overview-grid"><section className="po-content-panel"><header className="po-panel-title"><div><span className="po-eyebrow">RUN VOLUME</span><h2>Activity over time</h2><p>Sample trigger and reply counts.</p></div></header><div className="po-minibars" role="img" aria-label="Sample automation run volume: Mon 8, Tue 12, Wed 7, Thu 17, Fri 13, Sat 18, Sun 9">{[8,12,7,17,13,18,9].map((n,i)=><div className="po-minibar-col" key={i}><b className="po-minibar-value">{n}</b><div className="po-minibar-track"><span style={{height:n/18*100+"%"}}/></div><small>{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][i]}</small></div>)}</div></section><section className="po-content-panel"><header className="po-panel-title"><div><span className="po-eyebrow">RECENT RUNS</span><h2>Execution activity</h2><p>Sample events, not actual run logs.</p></div></header><div className="po-timeline"><div><b>Trigger matched</b><small>Comment keyword “price” · just now</small></div><div><b>AI reply prepared</b><small>Knowledge context included · 4m ago</small></div><div><b>Goal captured</b><small>Interest field recorded · 10m ago</small></div><div><b>Human review requested</b><small>Uncertain answer · 32m ago</small></div></div></section></div><div className="po-inline-help">This results layout is illustrative. It doesn't read historical journey executions or claim actual performance.</div></section>}
    {pendingTab&&<div className="po-modal-backdrop" role="presentation"><section ref={pendingTabRef} tabIndex={-1} className="po-modal" role="alertdialog" aria-modal="true" aria-labelledby="po-builder-unsaved-title"><div className="po-modal-top"><span className="po-modal-icon po-modal-icon--warning">!</span><button type="button" className="po-icon-button" aria-label="Close unsaved changes dialog" onClick={()=>setPendingTab(null)}>×</button></div><span className="po-eyebrow">UNSAVED CHANGES</span><h2 id="po-builder-unsaved-title">Leave this builder tab?</h2><p>Your automation has changes that are not marked saved. Save them, discard them, or keep editing before switching to another tab.</p><div className="po-modal-footer"><button type="button" className="po-button po-button--quiet" onClick={()=>setPendingTab(null)}>Keep editing</button><button type="button" className="po-button po-button--secondary" onClick={()=>continueTabAfterDecision("discard")}>Discard changes</button><button type="button" className="po-button po-button--primary" onClick={()=>continueTabAfterDecision("save")}>Save & continue</button></div></section></div>}
    {subTab === "Leads" && <section className="po-builder-results"><div className="po-screen-toolbar"><div><span className="po-eyebrow">LEADS FROM THIS AUTOMATION</span><p>Lead examples attributed to this automation; values are sample data.</p></div><button type="button" className="po-button po-button--secondary" disabled>Export</button></div><div className="po-automation-table-wrap"><table className="po-automation-table"><thead><tr><th>Lead</th><th>Stage</th><th>Handoff</th><th>Last activity</th><th>Owner</th><th>View</th></tr></thead><tbody>{[["Morgan Lee","New","Human review","2m ago","Unassigned"],["Casey Rivera","Contacted","AI handling","12m ago","Alex"],["Taylor Kim","Qualified","AI handling","27m ago","Sam"]].map((row,i)=><tr key={row[0]}><td><button type="button" className="po-table-primary-link" onClick={()=>onOpenLead(row[0])}>{row[0]}</button><small>{["@morgan.sample","@casey.sample","@taylor.sample"][i]}</small></td><td>{row[1]}</td><td>{row[2]}</td><td>{row[3]}</td><td>{row[4]}</td><td><button type="button" className="po-text-action" onClick={()=>onOpenLead(row[0])}>Open →</button></td></tr>)}</tbody></table></div></section>}
  </section>;
}

function WalkthroughDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useModalDialog(true, onClose);
  const [started,setStarted]=useState(false);
  const [step,setStep]=useState(0);
  const steps=[
    {title:"Match the trigger",description:"Example inbound comment contains the keyword “price”.",actor:"Instagram event",text:"Do you have pricing for 1:1 coaching?"},
    {title:"Prepare a reply",description:"The configured reply style and knowledge sources guide the sample answer.",actor:"AI reply",text:"Thanks for reaching out. I can help you compare options based on what you need."},
    {title:"Ask the qualification goal",description:"Ask a focused question and capture the answer as structured lead data.",actor:"Goal",text:"Are you looking for one-to-one coaching or a group plan?"},
    {title:"Capture the answer",description:"The lead record is updated in this illustrative flow; no backend record is written.",actor:"Lead record",text:"Interest: 1:1 coaching · Timeline: not yet captured"},
  ];
  const finished=step>=steps.length;
  return <div className="po-modal-backdrop" role="presentation" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><section ref={dialogRef} tabIndex={-1} className="po-modal po-walkthrough-dialog" role="dialog" aria-modal="true" aria-labelledby="po-walkthrough-title">
    <div className="po-modal-top"><span className="po-modal-icon"><PlayIcon/></span><button type="button" className="po-icon-button" aria-label="Close walkthrough" onClick={onClose}>×</button></div>
    <span className="po-eyebrow">SAMPLE WALKTHROUGH</span><h2 id="po-walkthrough-title">Test the journey logic without sending a message</h2><p>This is a guided demonstration of the configured step order, not a live Instagram test. It uses local sample values only.</p>
    {!started?<div className="po-walkthrough-intro"><div className="po-readiness-list"><span><CheckCircleIcon/> Trigger keyword: <strong>price</strong></span><span><CheckCircleIcon/> Reply uses the sample knowledge setting</span><span><CheckCircleIcon/> Qualification answer maps to a sample lead field</span></div><div className="po-modal-footer"><button type="button" className="po-button po-button--secondary" onClick={onClose}>Cancel</button><button type="button" className="po-button po-button--primary" onClick={()=>setStarted(true)}>Start sample walkthrough</button></div></div>:<><div className="po-walkthrough-progress"><span>STEP {Math.min(step+1,steps.length)} OF {steps.length}</span><div><span style={{width:(finished?100:step/steps.length*100)+"%"}}/></div></div>{!finished?<><div className="po-walkthrough-current"><div className="po-walkthrough-step-label"><span>{String(step+1).padStart(2,"0")}</span><div><strong>{steps[step]!.title}</strong><small>{steps[step]!.description}</small></div></div><div className="po-sample-transcript-card"><span className="po-eyebrow">{steps[step]!.actor.toUpperCase()}</span><p>{steps[step]!.text}</p></div></div><div className="po-modal-footer"><button type="button" className="po-button po-button--quiet" onClick={()=>setStep(v=>Math.max(0,v-1))} disabled={step===0}>Previous step</button><button type="button" className="po-button po-button--primary" onClick={()=>setStep(v=>v+1)}>{step===steps.length-1?"Finish walkthrough":"Next step →"}</button></div></>:<><div className="po-test-result" role="status"><Tag tone="success">Sample complete</Tag><div><strong>Journey steps displayed</strong><p>No external service was called, no lead was saved, and no Instagram message was sent.</p></div></div><div className="po-modal-footer"><button type="button" className="po-button po-button--secondary" onClick={()=>{setStep(0);setStarted(false);}}>Run again</button><button type="button" className="po-button po-button--primary" onClick={onClose}>Close preview</button></div></>}</>}
  </section></div>;
}

function PublishDialog({ automationStatus, onClose, onConfirm }: { automationStatus: string; onClose: () => void; onConfirm: () => void }) {
  const dialogRef = useModalDialog(true, onClose);
  const nextStatus = automationStatus === "Needs publishing" ? "Live" : automationStatus === "Live" ? "Live" : "Paused";
  return <div className="po-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialogRef} tabIndex={-1} className="po-modal" role="dialog" aria-modal="true" aria-labelledby="po-publish-title"><div className="po-modal-top"><span className="po-modal-icon po-modal-icon--warning">!</span><button type="button" className="po-icon-button" aria-label="Close publish dialog" onClick={onClose}>×</button></div><span className="po-eyebrow">PUBLISH SAFETY · PREVIEW</span><h2 id="po-publish-title">Review before publishing</h2><p>In the real product, publishing saves a version that can respond to matching Instagram comments or DMs. The preview can simulate the status transition, but it never sends replies or checks live account readiness.</p><div className="po-readiness-list"><span><CheckCircleIcon /> Sample flow is visible</span><span><span className="po-readiness-empty" /> Real account readiness has not been checked</span><span><span className="po-readiness-empty" /> Runtime validation has not been run</span></div><div className="po-warning-note"><span>!</span><span><strong>Simulated result: {nextStatus}</strong><small>{nextStatus==="Live"?"This sample automation will appear live only in this preview.":"Publishing a new draft creates a published-but-paused state. Activation remains a separate confirmation."}</small></span></div><div className="po-modal-footer"><button type="button" className="po-button po-button--secondary" onClick={onClose}>Cancel</button><button type="button" className="po-button po-button--primary" onClick={onConfirm}>Confirm publish in preview</button></div></section></div>;
}

function InboxScreen() {
  const [selected, setSelected] = useState(0);
  const [humanMode, setHumanMode] = useState(false);
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [compose, setCompose] = useState("");
  const [localReplies, setLocalReplies] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [stage, setStage] = useState("New");
  const [owner, setOwner] = useState("Unassigned");
  const [escalatedHandles, setEscalatedHandles] = useState<string[]>([]);
  const filters = ["All", "Unread", "AI Handling", "Qualified", "Needs Attention"];
  const visibleConversations = useMemo(() => conversations.filter(item => {
    const search = query.toLowerCase().trim();
    const textMatches = !search || item.handle.toLowerCase().includes(search) || item.preview.toLowerCase().includes(search);
    const filterMatches = filter === "All" ||
      (filter === "Unread" && item.unread) ||
      (filter === "AI Handling" && !item.human) ||
      (filter === "Qualified" && item.stage === "Qualified") ||
      (filter === "Needs Attention" && (item.attention || escalatedHandles.includes(item.handle)));
    return textMatches && filterMatches;
  }), [filter, query, escalatedHandles]);
  const selectedConversation = conversations[selected];
  const selectionIsVisible = !!selectedConversation && visibleConversations.some(item => item.handle === selectedConversation.handle);
  const current = selectionIsVisible ? selectedConversation! : visibleConversations[0] ?? null;
  const human = current ? (selectionIsVisible ? humanMode : current.human) : false;

  useEffect(() => {
    if (visibleConversations.length === 0) {
      if (selected !== -1) setSelected(-1);
      if (humanMode) setHumanMode(false);
      if (stage !== "New") setStage("New");
      if (owner !== "Unassigned") setOwner("Unassigned");
      if (compose) setCompose("");
      if (localReplies.length) setLocalReplies([]);
      if (notice) setNotice("");
      return;
    }
    const selectedItem = conversations[selected];
    if (selectedItem && visibleConversations.some(item => item.handle === selectedItem.handle)) return;
    const next = visibleConversations[0]!;
    const nextIndex = conversations.findIndex(item => item.handle === next.handle);
    if (selected !== nextIndex) setSelected(nextIndex);
    if (humanMode !== next.human) setHumanMode(next.human);
    if (stage !== next.stage) setStage(next.stage);
    if (owner !== next.owner) setOwner(next.owner);
    if (compose) setCompose("");
    if (localReplies.length) setLocalReplies([]);
    if (notice) setNotice("");
  }, [visibleConversations, selected, humanMode, stage, owner, compose, localReplies.length, notice]);
  function selectConversation(index: number) {
    setSelected(index);
    setHumanMode(conversations[index]!.human);
    setStage(conversations[index]!.stage);
    setOwner(conversations[index]!.owner);
    setLocalReplies([]);
    setNotice("");
  }
  function submitSampleReply() {
    if (!compose.trim() || !human) return;
    setLocalReplies(previous => previous.concat(compose.trim()));
    setCompose("");
    setNotice("Sample reply added to this preview only. No Instagram message was sent.");
  }
  return <section className="po-inbox-screen" aria-label="Inbox concept">
    <div className="po-screen-toolbar"><div className="po-filter-tabs" role="group" aria-label="Conversation filters">{filters.map(name=><button type="button" key={name} onClick={()=>setFilter(name)} className={filter===name?"is-active":""}>{name}{name==="All"&&<span>5</span>}</button>)}</div><label className="po-search"><SearchIcon/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search by username…" aria-label="Search conversations by username"/></label></div>
    <div className="po-inbox-layout">
      <div className="po-conversation-list">{visibleConversations.length===0?<div className="po-empty-mini"><strong>No conversations match</strong><span>Try another filter or search by username.</span><button type="button" className="po-text-action" onClick={()=>{setFilter("All");setQuery("");}}>Clear filters</button></div>:visibleConversations.map(item=>{const originalIndex=conversations.findIndex(candidate=>candidate.handle===item.handle);return <button key={item.handle} type="button" className={"po-conversation"+(selected===originalIndex?" is-selected":"")} onClick={()=>selectConversation(originalIndex)}><span className="po-avatar">{item.initial}</span><span className="po-conversation-body"><span className="po-conversation-first"><strong>{item.handle}</strong><small>{item.time}</small></span><span className="po-conversation-preview">{item.preview}</span><span className="po-conversation-bottom">{item.unread&&<span className="po-unread-dot" aria-label="Unread"/>}<Tag tone={item.tone}>{item.human?"Human handling":item.status}</Tag></span></span></button>;})}</div>
      {!current ? (
        <div className="po-thread po-thread-empty" role="status">
          <div><span className="po-empty-mark">⌕</span><h2>No conversation selected</h2><p>There are no conversations matching these filters. Clear filters or choose another view to continue.</p><button type="button" className="po-button po-button--secondary" onClick={() => { setFilter("All"); setQuery(""); }}>Clear filters</button></div>
        </div>
      ) : (
        <div className="po-thread">
          <header className="po-thread-header"><div className="po-avatar">{current.initial}</div><div><strong>{current.handle}</strong><span>Instagram conversation · sample</span></div><Tag tone={human ? "blue" : "purple"}>{human ? "Human handling" : "AI handling"}</Tag></header>
          <div className="po-post-context"><InstagramMarkIcon/><span><strong>{current.via === "Comment" ? "Comment on a recent post" : "Direct message"}</strong><small>“Interested in coaching options” · sample context</small></span><Tag>{current.via}</Tag></div>
          <div className="po-messages"><div className="po-message po-message--incoming"><span>{current.preview}</span><small>10:24 AM · Sample inbound {current.via}</small></div><div className="po-message po-message--outgoing"><span>Thanks for reaching out. I can share a few options based on what you’re looking for.</span><small>10:25 AM · Example AI reply</small></div><div className="po-message po-message--incoming"><span>That sounds good. Could you tell me more?</span><small>10:26 AM · Sample</small></div>{localReplies.map((reply,index)=><div className="po-message po-message--outgoing" key={index}><span>{reply}</span><small>Just now · Local sample reply</small></div>)}</div>
          {notice&&<p className="po-inline-notice" role="status">{notice}</p>}
          {human?<div className="po-composer"><textarea aria-label="Sample human reply composer" placeholder="Write a reply…" value={compose} onChange={e=>setCompose(e.target.value)}/><div className="po-composer-actions"><span>Preview only · no message is sent</span><button type="button" className="po-button po-button--primary" disabled={!compose.trim()} onClick={submitSampleReply}><SendIcon/> Add sample reply</button></div></div>:<div className="po-composer po-ai-composer"><p>AI is handling this conversation. Take over before composing a human reply.</p><button type="button" className="po-button po-button--secondary" onClick={()=>{setHumanMode(true);setNotice("Human-handling state changed locally in preview only.");}}>Take over to reply (demo)</button></div>}
        </div>
      )}
      {!current ? (
        <aside className="po-conversation-details po-context-empty"><span className="po-eyebrow">LEAD CONTEXT</span><h3>No contact selected</h3><p>Contact details are hidden until a conversation matches the current search and filters.</p></aside>
      ) : (
        <aside className="po-conversation-details"><span className="po-eyebrow">LEAD CONTEXT</span><h3>{current.handle}</h3><p>Instagram contact · sample profile</p><div className="po-detail-row"><span>Handoff status</span><Tag tone={human?"blue":"purple"}>{human?"Human handling":"AI handling"}</Tag></div><div className="po-detail-row"><span>Pipeline stage</span><span className="po-detail-control"><select aria-label="Pipeline stage" value={selectionIsVisible ? stage : current.stage} onChange={e=>setStage(e.target.value)}>{["New","Contacted","Qualified","Meeting Scheduled","Won","Lost"].map(value=><option key={value}>{value}</option>)}</select></span></div><div className="po-detail-row"><span>Owner</span><span className="po-detail-control"><select aria-label="Lead owner" value={selectionIsVisible ? owner : current.owner} onChange={e=>setOwner(e.target.value)}>{["Unassigned","Alex Morgan","Sam Taylor","Follow-up queue"].map(value=><option key={value}>{value}</option>)}</select></span></div><div className="po-detail-row"><span>Messaging window</span><strong>{current.window}</strong></div><div className="po-detail-row"><span>Last contact via</span><strong>{current.via}</strong></div><div className="po-detail-divider"/>{human?<button type="button" className="po-button po-button--secondary po-full-width" onClick={()=>{setHumanMode(false);setCompose("");setNotice("AI handling restored in preview only.");}}>Return to AI (demo)</button>:<button type="button" className="po-button po-button--secondary po-full-width" onClick={()=>{setEscalatedHandles(previous=>previous.includes(current.handle)?previous:[...previous,current.handle]);setNotice("This conversation was flagged for attention in preview only.");}}>Escalate for attention (demo)</button>}<p className="po-help">All assignment, stage, and handoff changes are local to the preview.</p></aside>
      )}

    </div>
  </section>;
}

function LeadsScreen({ onOpenLead }: { onOpenLead: (name: string) => void }) {
  const [query,setQuery] = useState("");
  const [stage,setStage] = useState("");
  const [handoff,setHandoff] = useState("");
  const [page,setPage] = useState(1);
  const PAGE_SIZE=10;
  const rows=leads.map((lead,index)=>({
    ...lead,
    username:lead.handle.replace(/^@/,""),
    handoffStatus:index===1?"Needs attention":index===3?"Human is replying":"AI is replying",
    window:index===0?"Open · 12h left":index===3?"Open · 3h left":"Closed",
    firstSeen:["9/20/2026","9/20/2026","10/10/2026","9/20/2026","10/6/2026","10/3/2026","10/2/2026","10/1/2026","9/28/2026","9/26/2026"][index]??"9/20/2026",
    unread:index===1||index===5,
  }));
  const filtered=useMemo(()=>rows.filter(lead=>{
    const q=query.trim().toLowerCase();
    return (!q||lead.username.toLowerCase().includes(q))&&(!stage||lead.stage===stage)&&(!handoff||lead.handoffStatus===handoff);
  }),[query,stage,handoff]);
  const pageCount=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  const pageRows=filtered.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);
  const clearFilters=()=>{setQuery("");setStage("");setHandoff("");setPage(1);};
  return <section className="po-leads-screen" aria-label="Leads">
    <section className="po-leads-production-card">
      <div className="po-leads-filter-row">
        <label className="po-visually-hidden" htmlFor="po-leads-stage-filter">Pipeline stage</label>
        <select id="po-leads-stage-filter" aria-label="Pipeline stage" value={stage} onChange={event=>{setStage(event.target.value);setPage(1);}}>
          <option value="">All stages</option>
          {["New","Contacted","Qualified","Meeting Scheduled","Won","Lost"].map(value=><option key={value} value={value}>{value}</option>)}
        </select>
        <label className="po-visually-hidden" htmlFor="po-leads-handoff-filter">Handoff status</label>
        <select id="po-leads-handoff-filter" aria-label="Handoff status" value={handoff} onChange={event=>{setHandoff(event.target.value);setPage(1);}}>
          <option value="">All</option><option value="AI is replying">AI Handling</option><option value="Needs attention">Needs Attention</option><option value="Human is replying">Human Handling</option>
        </select>
        <label className="po-visually-hidden" htmlFor="po-leads-search">Search leads by username</label>
        <input id="po-leads-search" type="search" aria-label="Search leads by username" placeholder="Search by username…" value={query} onChange={event=>{setQuery(event.target.value);setPage(1);}}/>
      </div>
      <div className="po-leads-production-table-scroll" aria-label="Scrollable leads table">
        <table className="po-leads-table po-leads-production-table">
          <thead><tr><th scope="col">Username</th><th scope="col">Stage</th><th scope="col">Handoff</th><th scope="col">Last contact</th><th scope="col">Via</th><th scope="col">Messaging window</th><th scope="col">First seen</th></tr></thead>
          <tbody>
            {pageRows.map(lead=><tr key={lead.handle}>
              <td><button type="button" className="po-lead-username" onClick={()=>onOpenLead(lead.name)}>{lead.unread&&<span className="po-lead-unread-dot" aria-hidden="true"/>}{lead.username}</button></td>
              <td>{lead.stage}</td>
              <td><Tag tone={lead.handoffStatus==="Needs attention"?"amber":lead.handoffStatus==="Human is replying"?"green":"purple"}>{lead.handoffStatus}</Tag></td>
              <td className="po-time-cell">{lead.activity}</td>
              <td>{lead.source}</td>
              <td><Tag tone={lead.window==="Closed"?"neutral":"green"}>{lead.window}</Tag></td>
              <td>{lead.firstSeen}</td>
            </tr>)}
          </tbody>
        </table>
        {filtered.length===0&&<div className="po-table-empty"><strong>No leads match these filters</strong><span>Clear the search or choose a different stage or handoff state.</span><button className="po-text-action" type="button" onClick={clearFilters}>Clear filters</button></div>}
      </div>
      {filtered.length>0&&<div className="po-leads-pagination"><span>Showing {pageRows.length} of {filtered.length} leads</span><div><button type="button" disabled={page===1} onClick={()=>setPage(value=>Math.max(1,value-1))}>Previous</button><span>Page {page} of {pageCount}</span><button type="button" disabled={page===pageCount} onClick={()=>setPage(value=>Math.min(pageCount,value+1))}>Next</button></div></div>}
    </section>
    <p className="po-leads-disclaimer">Sample values are shown for layout review. No production leads are loaded or modified.</p>
  </section>;
}

function MessagePreviewDialog({ automationName, onClose }: { automationName: string; onClose: () => void }) {
  const dialogRef = useModalDialog(true, onClose);
  const [sampleText,setSampleText]=useState("How much does 1:1 coaching cost?");
  const [result,setResult]=useState<null|{ruleBased:string;aiGenerated:string;handoff:boolean}>(null);
  const [error,setError]=useState("");
  function runPreview() {
    const text=sampleText.trim();
    if(!text){setError("Enter a sample customer message to preview a response.");setResult(null);return;}
    const needsHuman=/human|person|refund|complaint|angry|cancel/i.test(text);
    const pricing=/price|pricing|cost|how much/i.test(text);
    setResult({
      ruleBased:pricing?"An example rule may match the pricing question. No exact price is configured in this preview.":"No sample rule is defined for this message.",
      aiGenerated:needsHuman?"This message may need a teammate. A safe system should explain the next step and route it for human review.":pricing?"I can help you compare the available options. Are you looking for one-to-one coaching or a group plan?":"Thanks for reaching out. I can help with that. Could you share a little more detail so I can guide you to the right next step?",
      handoff:needsHuman,
    });
    setError("");
  }
  return <div className="po-modal-backdrop" role="presentation" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><section ref={dialogRef} tabIndex={-1} className="po-modal po-message-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="po-message-preview-title">
    <div className="po-modal-top"><span className="po-eyebrow">PREVIEW REPLY · SAMPLE</span><button type="button" className="po-icon-button" aria-label="Close message preview" onClick={onClose}>×</button></div>
    <h2 id="po-message-preview-title">Preview a sample Instagram conversation</h2><p>Try different customer messages to inspect the rule-match and AI-response areas. This is a local simulation, not the production preview API.</p>
    <label className="po-field-block">Sample customer message<textarea rows={3} value={sampleText} onChange={e=>{setSampleText(e.target.value);setResult(null);setError("");}} placeholder="e.g. How much does 1:1 coaching cost?"/></label>
    <div className="po-preview-controls"><button type="button" className="po-button po-button--primary" disabled={!sampleText.trim()} onClick={runPreview}>Preview conversation</button><span>No message is sent. No model or rule engine is called.</span></div>
    {error&&<div className="po-inline-notice po-inline-notice--error" role="alert">{error}</div>}
    {result&&<div className="po-preview-results" role="status"><div className="po-preview-result-heading"><span className="po-eyebrow">{automationName.toUpperCase()}</span>{result.handoff&&<Tag tone="warning">Human review suggested</Tag>}</div><div className="po-sample-transcript-card"><span className="po-eyebrow">CUSTOMER · SAMPLE</span><p>{sampleText}</p></div><div className="po-sample-transcript-card"><span className="po-eyebrow">RULE-BASED RESULT · ILLUSTRATIVE</span><p>{result.ruleBased}</p></div><div className="po-simulated-reply"><span className="po-eyebrow">AI-GENERATED RESULT · ILLUSTRATIVE</span><p>{result.aiGenerated}</p></div>{result.handoff&&<div className="po-warning-note"><span>!</span><span><strong>Potential handoff</strong><small>A production journey should show the human owner or the unassigned review queue here.</small></span></div>}</div>}
    <div className="po-modal-footer"><button type="button" className="po-button po-button--secondary" onClick={onClose}>Close preview</button></div>
  </section></div>;
}

function LifecycleDialog({ action, onClose, onConfirm }: { action: "pause"|"activate"; onClose: () => void; onConfirm: () => void }) {
  const dialogRef = useModalDialog(true, onClose);
  return <div className="po-modal-backdrop" role="presentation"><section ref={dialogRef} tabIndex={-1} className="po-modal" role="alertdialog" aria-modal="true" aria-labelledby="po-lifecycle-title"><div className="po-modal-top"><span className="po-modal-icon po-modal-icon--warning">!</span><button type="button" className="po-icon-button" aria-label="Close lifecycle dialog" onClick={onClose}>×</button></div><span className="po-eyebrow">AUTOMATION LIFECYCLE · PREVIEW</span><h2 id="po-lifecycle-title">{action==="pause"?"Pause this automation?":"Activate this automation?"}</h2><p>{action==="pause"?"Pausing stops the automation from responding to future matching conversations. Existing messages and lead records remain in the workspace.":"Activation can start real Instagram replies. Check account health, trigger rules, AI instructions, and test results before turning on a live automation."}</p><div className="po-warning-note"><span>!</span><span><strong>No production action will occur</strong><small>This confirmation only changes the status label in this concept preview. It does not call an API.</small></span></div><div className="po-modal-footer"><button type="button" className="po-button po-button--secondary" onClick={onClose}>Cancel</button><button type="button" className="po-button po-button--primary" onClick={onConfirm}>{action==="pause"?"Pause in preview":"Activate in preview"}</button></div></section></div>;
}

function UnsavedChangesDialog({ onKeepEditing, onSaveAndLeave, onDiscard }: { onKeepEditing: () => void; onSaveAndLeave: () => void; onDiscard: () => void }) {
  const dialogRef = useModalDialog(true, onKeepEditing);
  return <div className="po-modal-backdrop" role="presentation"><section ref={dialogRef} tabIndex={-1} className="po-modal po-unsaved-modal" role="alertdialog" aria-modal="true" aria-labelledby="po-unsaved-title"><div className="po-modal-top"><span className="po-modal-icon po-modal-icon--warning">!</span></div><span className="po-eyebrow">UNSAVED CHANGES</span><h2 id="po-unsaved-title">Leave the builder?</h2><p>You have preview changes that haven't been marked saved. In the real product, choose whether to save or discard before leaving the automation.</p><div className="po-modal-footer po-unsaved-actions"><button type="button" className="po-button po-button--quiet" onClick={onKeepEditing}>Keep editing</button><button type="button" className="po-button po-button--secondary" onClick={onDiscard}>Discard changes</button><button type="button" className="po-button po-button--primary" onClick={onSaveAndLeave}>Save & leave</button></div></section></div>;
}

function WorkspaceBar({ onNavigate, theme, onToggleTheme }: { onNavigate: (screen: PreviewScreen) => void; theme: "light" | "dark"; onToggleTheme: () => void }) {
  const [notificationsOpen,setNotificationsOpen] = useState(false);
  const [profileOpen,setProfileOpen] = useState(false);
  return <header className="po-workspace-bar">
    <div className="po-account-health"><span className="po-instagram-chip"><InstagramMarkIcon /></span><div><strong>My workspace</strong><small><span className="po-status-dot" /> Connected · sample account · preview only</small></div></div>
    <div className="po-global-actions"><div className="po-token-meter" title="Sample usage meter; no real account data"><div><span>AI usage</span><strong>145.5K / 200K tokens</strong></div><div className="po-token-track"><span /></div></div>
      <button type="button" className="po-global-icon" aria-label={theme==="light"?"Switch to dark mode":"Switch to light mode"} onClick={onToggleTheme}>{theme==="light"?<MoonIcon className="po-global-svg"/>:<SunIcon className="po-global-svg"/>}</button>
      <div className="po-global-menu-wrap"><button type="button" className="po-global-icon" aria-label="Notifications" aria-expanded={notificationsOpen} onClick={()=>{setNotificationsOpen(v=>!v);setProfileOpen(false);}}><BellIcon className="po-global-svg"/></button>{notificationsOpen&&<div className="po-dropdown po-notifications-panel"><div className="po-dropdown-heading"><strong>Notifications</strong><Tag>Sample</Tag></div><div className="po-notification-row"><span className="po-notification-dot" /><span><strong>2 conversations need review</strong><small>Sample inbox · 12 minutes ago</small></span></div><div className="po-notification-row"><span className="po-notification-dot po-notification-dot--amber" /><span><strong>One draft is not published</strong><small>Lead qualification · Today</small></span></div><p>Notification examples only. No live events are being monitored.</p><button type="button" className="po-text-action" onClick={()=>{setNotificationsOpen(false);onNavigate("inbox");}}>Review inbox →</button></div>}</div>
      <div className="po-global-menu-wrap"><button type="button" className="po-profile-button" aria-expanded={profileOpen} onClick={()=>{setProfileOpen(v=>!v);setNotificationsOpen(false);}}><span className="po-profile-avatar">A</span><span><strong>Alex Morgan</strong><small>Owner · sample user</small></span><ChevronDownIcon className="po-icon-small" /></button>{profileOpen&&<div className="po-dropdown po-profile-menu"><div className="po-dropdown-heading"><strong>Workspace account</strong><small>creatorstudio.example</small></div><button type="button" onClick={()=>{setProfileOpen(false);onNavigate("team");}}>Team & members</button><button type="button" onClick={()=>{setProfileOpen(false);onNavigate("settings");}}>Workspace settings</button><button type="button" onClick={()=>{setProfileOpen(false);onNavigate("billing");}}>Plan & usage</button><button type="button" onClick={()=>{setProfileOpen(false);onNavigate("docs");}}>Help & documentation</button><button type="button" onClick={()=>{setProfileOpen(false);onNavigate("login");}}>Sign-in preview</button></div>}</div>
    </div>
  </header>;
}

export function PrecisionOperationsPreviewPage() {
  const validScreens: PreviewScreen[] = ["overview","automations","builder","inbox","leads","lead-detail","knowledge","content","analytics","integrations","team","billing","settings","docs","login","connect-error","invite"];
  const screenAliases: Record<string, PreviewScreen> = {
    "connection-recovery": "connect-error",
    "invitation-recovery": "invite",
  };
  const [screen,setScreen] = useState<PreviewScreen>(() => {
    const requested = new URLSearchParams(window.location.search).get("screen");
    if (!requested) return "overview";
    if (validScreens.includes(requested as PreviewScreen)) return requested as PreviewScreen;
    return screenAliases[requested] ?? "overview";
  });
  const [dirty,setDirty] = useState(false);
  const [automationStatus,setAutomationStatus] = useState("Draft");
  const [pendingNavigation,setPendingNavigation] = useState<PreviewScreen|null>(null);
  const [inspectorEditingDirty,setInspectorEditingDirty] = useState(false);
  const [inspectorCloseRequest,setInspectorCloseRequest] = useState(0);
  const [pendingInspectorRoute,setPendingInspectorRoute] = useState<PreviewScreen|null>(null);
  const [savedNotice,setSavedNotice] = useState(false);
  const [showWalkthrough,setShowWalkthrough] = useState(false);
  const [showPublish,setShowPublish] = useState(false);
  const [showMessagePreview,setShowMessagePreview] = useState(false);
  const [showLifecycle,setShowLifecycle] = useState(false);
  const [lifecycleAction,setLifecycleAction] = useState<"pause"|"activate">("pause");
  const [,setSelectedNode] = useState<BuilderNodeKey>("trigger");
  const [automationName,setAutomationName] = useState("Lead qualification");
  const [builderSeed,setBuilderSeed] = useState<BuilderSeed|null>(null);
  const [selectedLeadName,setSelectedLeadName] = useState("Morgan Lee");
  const [selectedLeadHandle,setSelectedLeadHandle] = useState("@morgan.sample");
  const [selectedLeadStage,setSelectedLeadStage] = useState("New");
  const [selectedLeadOwner,setSelectedLeadOwner] = useState("Unassigned");
  const [selectedLeadHandoff,setSelectedLeadHandoff] = useState(true);
  const [theme,setTheme] = useState<"light"|"dark">(() => new URLSearchParams(window.location.search).get("theme") === "dark" ? "dark" : "light");
  const applyNavigation = (next: PreviewScreen) => {
    setScreen(next);
    setSavedNotice(false);
    const params = new URLSearchParams(window.location.search);
    params.set("preview","precision-operations");
    params.set("screen",next);
    window.history.replaceState(null,"",window.location.pathname+"?"+params.toString());
  };
  const go = (next: PreviewScreen) => {
    if (screen === "builder" && inspectorEditingDirty && next !== "builder") {
      setPendingInspectorRoute(next);
      setInspectorCloseRequest(value=>value+1);
      return;
    }
    if (screen === "builder" && dirty && next !== "builder") {
      setPendingNavigation(next);
      return;
    }
    applyNavigation(next);
  };
  const openBuilder = (name: string, status = "Draft", newDraft = false, seed?: BuilderSeed) => {
    setAutomationName(name);
    setAutomationStatus(status);
    setBuilderSeed(seed ?? null);
    setDirty(newDraft);
    const params = new URLSearchParams(window.location.search);
    params.set("preview","precision-operations");
    params.set("screen","builder");
    params.set("builderTab",newDraft?"Setup":"Flow");
    window.history.replaceState(null,"",window.location.pathname+"?"+params.toString());
    applyNavigation("builder");
  };
  const saveAndLeave = () => {
    setDirty(false);
    setSavedNotice(true);
    const next = pendingNavigation;
    setPendingNavigation(null);
    if (next) applyNavigation(next);
  };
  const discardAndLeave = () => {
    setDirty(false);
    const next = pendingNavigation;
    setPendingNavigation(null);
    if (next) applyNavigation(next);
  };
  const openLead = (name: string) => {
    const record = leads.find(item => item.name === name);
    const recordIndex = leads.findIndex(item => item.name === name);
    setSelectedLeadName(name);
    setSelectedLeadHandle(record?.handle ?? "@morgan.sample");
    setSelectedLeadStage(record?.stage ?? "New");
    setSelectedLeadOwner(record?.owner ?? "Unassigned");
    setSelectedLeadHandoff(recordIndex === 3);
    go("lead-detail");
  };
  const savePreviewState = () => { setDirty(false); setSavedNotice(true); };
  const handleInspectorDiscarded = () => {
    const next = pendingInspectorRoute;
    setPendingInspectorRoute(null);
    setInspectorEditingDirty(false);
    if(!next) return;
    if(dirty) setPendingNavigation(next);
    else applyNavigation(next);
  };
  const handleInspectorCloseCancelled = () => { setPendingInspectorRoute(null); };
  const requestLifecycleAction = (action: "pause"|"activate") => { setLifecycleAction(action); setShowLifecycle(true); };
  const confirmLifecycleAction = () => { setAutomationStatus(lifecycleAction === "pause" ? "Paused" : "Live"); setShowLifecycle(false); setDirty(false); setSavedNotice(true); };
  const confirmPublishPreview = () => { setAutomationStatus(automationStatus === "Needs publishing" ? "Live" : automationStatus === "Live" ? "Live" : "Paused"); setShowPublish(false); setDirty(false); setSavedNotice(true); };
  const standalone = screen === "login" || screen === "connect-error" || screen === "invite";
  const page = screen === "overview" ? <OverviewScreen onNavigate={go} />
    : screen === "automations" ? <AutomationsScreen onOpenBuilder={openBuilder} />
    : screen === "builder" ? <BuilderScreen dirty={dirty} onSelectNode={setSelectedNode} automationName={automationName} onDirty={()=>setDirty(true)} onOpenLead={openLead} onSavePreview={savePreviewState} seed={builderSeed} inspectorCloseRequest={inspectorCloseRequest} onInspectorDirtyChange={setInspectorEditingDirty} onInspectorDiscarded={handleInspectorDiscarded} onInspectorCloseCancelled={handleInspectorCloseCancelled} />
    : screen === "inbox" ? <InboxScreen />
    : screen === "leads" ? <LeadsScreen onOpenLead={openLead} />
    : screen === "lead-detail" ? <LeadDetailScreen leadName={selectedLeadName} leadHandle={selectedLeadHandle} initialStage={selectedLeadStage} initialOwner={selectedLeadOwner} initialHandoff={selectedLeadHandoff} onBack={()=>go("leads")} onNavigate={go} />
    : screen === "knowledge" ? <KnowledgeScreen />
    : screen === "content" ? <ContentScreen />
    : screen === "analytics" ? <AnalyticsScreen />
    : screen === "integrations" ? <IntegrationsScreen />
    : screen === "team" ? <TeamScreen />
    : screen === "billing" ? <BillingScreen />
    : screen === "settings" ? <SettingsScreen />
    : screen === "docs" ? <DocsScreen />
    : screen === "login" ? <LoginPreviewScreen onNavigate={go} />
    : <SystemStateScreen screen={screen as "connect-error"|"invite"} onNavigate={go} />;
  if (standalone) return <div className={"po-preview-app po-standalone-preview"+(theme==="dark"?" is-dark":"")}><div className="po-standalone-header"><BrandMark/><span>Authentication & recovery preview</span><button type="button" className="po-button po-button--secondary" onClick={()=>go("overview")}>Return to dashboard</button></div><PreviewNotice/>{page}<footer className="po-footer"><span>SignalAI · Precision Operations Studio</span><span>Preview only · no authentication or invitations are processed</span></footer></div>;
  return <div className={"po-preview-app"+(theme==="dark"?" is-dark":"")}><a className="po-skip-link" href="#po-main">Skip to main content</a><Sidebar screen={screen} onNavigate={go}/><main id="po-main" className="po-main"><WorkspaceBar onNavigate={go} theme={theme} onToggleTheme={()=>setTheme(v=>{ const next=v==="light"?"dark":"light"; const params=new URLSearchParams(window.location.search); params.set("preview","precision-operations"); params.set("theme",next); window.history.replaceState(null,"",window.location.pathname+"?"+params.toString()); return next; })}/><div className="po-main-content"><PageHeader screen={screen} dirty={dirty} onSave={savePreviewState} onTest={()=>setShowWalkthrough(true)} onPreview={()=>setShowMessagePreview(true)} onPublish={()=>setShowPublish(true)} onLifecycleAction={requestLifecycleAction} selectedLeadName={selectedLeadName} automationName={automationName} automationStatus={automationStatus} onNavigate={go}/>{savedNotice&&<div className="po-inline-notice" role="status">Preview state marked saved. Nothing was written to the server.</div>}{page}<footer className="po-footer"><span>SignalAI · Precision Operations Studio</span><span>Sample workspace · no production API connected</span></footer></div></main>{showWalkthrough&&<WalkthroughDialog onClose={()=>setShowWalkthrough(false)}/>}{showPublish&&<PublishDialog automationStatus={automationStatus} onClose={()=>setShowPublish(false)} onConfirm={confirmPublishPreview}/>}{showMessagePreview&&<MessagePreviewDialog automationName={automationName} onClose={()=>setShowMessagePreview(false)}/>}{showLifecycle&&<LifecycleDialog action={lifecycleAction} onClose={()=>setShowLifecycle(false)} onConfirm={confirmLifecycleAction}/>}{pendingNavigation&&<UnsavedChangesDialog onKeepEditing={()=>setPendingNavigation(null)} onSaveAndLeave={saveAndLeave} onDiscard={discardAndLeave}/>}</div>;
}
