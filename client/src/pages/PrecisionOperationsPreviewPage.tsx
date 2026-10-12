import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import {
  AnalyticsIcon, AutomationIcon, BookIcon, ContentIcon, HomeIcon, InboxIcon,
  IntegrationsIcon, LeadsIcon, SettingsIcon, TeamIcon, InstagramMarkIcon,
  BotIcon, SendIcon, ListChecksIcon, SearchIcon, PlayIcon, PlusIcon,
  ChevronDownIcon, DotsVerticalIcon, CheckCircleIcon, CreditCardIcon,
} from "../components/icons";

type PreviewScreen = "overview" | "automations" | "builder" | "inbox" | "leads" | "lead-detail" | "knowledge" | "content" | "analytics" | "integrations" | "team" | "billing" | "settings" | "login" | "connect-error" | "invite" | "docs";
type BuilderNodeKey = "trigger" | "reply" | "goal" | "followup";
type IconType = ComponentType<{ className?: string }>;
type NavigationItem = { label: string; icon: IconType; screen?: PreviewScreen; section: "primary" | "workspace" };

const navigation: NavigationItem[] = [
  { label: "Overview", icon: HomeIcon, screen: "overview", section: "primary" },
  { label: "Inbox", icon: InboxIcon, screen: "inbox", section: "primary" },
  { label: "Leads", icon: LeadsIcon, screen: "leads", section: "primary" },
  { label: "Automations", icon: AutomationIcon, screen: "automations", section: "primary" },
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
  { handle: "@sample_fitness", preview: "Do you have pricing for 1:1 coaching?", time: "2m", status: "AI handling", tone: "purple", initial: "SF" },
  { handle: "@studio_owner", preview: "Can you share the class schedule?", time: "12m", status: "Needs review", tone: "amber", initial: "SO" },
  { handle: "@maya_runs", preview: "Is this available for beginners?", time: "27m", status: "AI handling", tone: "purple", initial: "MR" },
  { handle: "@northside_fit", preview: "I'd like to speak with someone.", time: "1h", status: "Human", tone: "blue", initial: "NF" },
  { handle: "@sample_customer", preview: "Thanks, that answers my question.", time: "3h", status: "Resolved", tone: "green", initial: "SC" },
];

const leads = [
  { name: "Morgan Lee", handle: "@morgan.sample", stage: "New", source: "Comment", activity: "2m ago", owner: "Unassigned" },
  { name: "Casey Rivera", handle: "@casey.sample", stage: "Contacted", source: "DM", activity: "12m ago", owner: "Alex" },
  { name: "Taylor Kim", handle: "@taylor.sample", stage: "Qualified", source: "Comment", activity: "27m ago", owner: "Sam" },
  { name: "Jordan Patel", handle: "@jordan.sample", stage: "New", source: "DM", activity: "1h ago", owner: "Unassigned" },
  { name: "Riley Chen", handle: "@riley.sample", stage: "Qualified", source: "DM", activity: "3h ago", owner: "Alex" },
  { name: "Avery Brooks", handle: "@avery.sample", stage: "Contacted", source: "Comment", activity: "Yesterday", owner: "Sam" },
];

function BrandMark() {
  return <div className="po-brand" aria-label="SignalAI"><span className="po-brand-symbol" aria-hidden="true">s</span><span>signalAI</span></div>;
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
      <BrandMark />
      <div className="po-workspace-switcher" aria-label="Sample workspace">
        <span className="po-workspace-avatar">CS</span><span className="po-workspace-name"><strong>Creator Studio</strong><small>Sample workspace</small></span><ChevronDownIcon className="po-icon-small" />
      </div>
      <nav className="po-nav">
        <div className="po-nav-section">
          {navigation.filter((item) => item.section === "primary").map((item) => {
            const active = item.screen === selectedScreen;
            const Icon = item.icon;
            return <button key={item.label} type="button" className={"po-nav-item" + (active ? " is-active" : "")} aria-current={active ? "page" : undefined} onClick={() => item.screen && onNavigate(item.screen)}><Icon className="po-nav-icon" /><span>{item.label}</span>{item.label === "Inbox" && <span className="po-nav-count">12</span>}</button>;
          })}
        </div>
        <div className="po-nav-divider" /><div className="po-nav-section"><p className="po-nav-label">Workspace</p>
          {navigation.filter((item) => item.section === "workspace").map((item) => { const Icon = item.icon; const active = item.screen === selectedScreen; return <button key={item.label} type="button" className={"po-nav-item" + (active ? " is-active" : "")} aria-current={active ? "page" : undefined} onClick={() => item.screen && onNavigate(item.screen)}><Icon className="po-nav-icon" /><span>{item.label}</span></button>; })}
        </div>
        <button type="button" className="po-nav-help" onClick={() => onNavigate("docs")}><BookIcon className="po-nav-icon" /> Help & documentation</button>
      </nav>
      <div className="po-sidebar-footer"><span className="po-avatar po-avatar--small">CS</span><div><strong>Creator Studio</strong><small>Sample workspace · review only</small></div><DotsVerticalIcon className="po-icon-small" /></div>
    </aside>
  );
}

function PageHeader({ screen, dirty, onSave, onTest, onPublish, selectedLeadName }: {
  screen: PreviewScreen; dirty: boolean; onSave: () => void; onTest: () => void; onPublish: () => void; selectedLeadName: string;
}) {
  if (screen === "builder") return <header className="po-page-header po-builder-header">
    <div className="po-builder-heading"><div className="po-breadcrumb"><button type="button" onClick={() => window.dispatchEvent(new CustomEvent("po-navigate", { detail: "automations" }))}>Automations</button><span aria-hidden="true">/</span><strong>Lead qualification</strong></div><div className="po-title-row"><h1>Lead qualification</h1><Tag tone="warning">Draft · Not live</Tag></div><p>Reply to matching comments and DMs, then collect the details your team needs.</p></div>
    <div className="po-header-actions"><span className={"po-save-status" + (dirty ? " is-dirty" : "")} role="status"><span className="po-save-status-dot" />{dirty ? "Unsaved preview changes" : "Preview marked saved"}</span><button type="button" className="po-button po-button--quiet" onClick={onTest}><PlayIcon className="po-button-icon" /> Sample walkthrough</button><button type="button" className="po-button po-button--secondary" disabled={!dirty} onClick={onSave}>Save changes</button><button type="button" className="po-button po-button--primary" onClick={onPublish}>Publish</button></div>
  </header>;
  const configs: Record<string, { eyebrow: string; title: string; description: string }> = {
    overview: { eyebrow: "WORKSPACE SUMMARY", title: "Overview", description: "A clear view of what needs attention across your Instagram operations." },
    automations: { eyebrow: "AUTOMATION WORKSPACE", title: "Automations", description: "Build, test, and manage how SignalAI handles conversations." },
    inbox: { eyebrow: "CONVERSATION OPERATIONS", title: "Inbox", description: "Review Instagram conversations and decide when AI or a person should reply." },
    leads: { eyebrow: "PIPELINE", title: "Leads", description: "Track people who have shown interest in your business through Instagram." },
    "lead-detail": { eyebrow: "LEAD PROFILE", title: selectedLeadName, description: "Review context, update ownership, and decide on the next action." },
    knowledge: { eyebrow: "BUSINESS KNOWLEDGE", title: "Knowledge", description: "Keep the business information your AI replies rely on accurate and testable." },
    content: { eyebrow: "INSTAGRAM CONTENT", title: "Content", description: "Review posts and reels that drive comments and conversations." },
    analytics: { eyebrow: "MEASUREMENT", title: "Analytics", description: "Separate conversation activity from lead conversion and explain what each number means." },
    integrations: { eyebrow: "CONNECTED ACCOUNTS", title: "Integrations", description: "Understand which Instagram accounts are connected and whether they are operationally healthy." },
    team: { eyebrow: "WORKSPACE ACCESS", title: "Team", description: "Manage who can access the workspace and what they are allowed to do." },
    billing: { eyebrow: "PLAN & USAGE", title: "Plan & usage", description: "Understand the sample plan state, usage units, and what happens near a limit." },
    settings: { eyebrow: "WORKSPACE CONFIGURATION", title: "Settings", description: "Configure lead information, AI behavior, escalation, and scoring in business language." },
    docs: { eyebrow: "GUIDANCE", title: "Help & documentation", description: "Find the steps and explanations needed to operate SignalAI confidently." },
  };
  const config = configs[screen] ?? configs.overview!;
  const isInbox = screen === "inbox";
  return <header className="po-page-header">
    <div><div className="po-eyebrow">{config.eyebrow}</div><h1>{config.title}</h1><p>{config.description}</p></div>
    {isInbox ? <div className="po-header-context"><span className="po-status-dot" /> Sample inbox <ChevronDownIcon className="po-icon-small" /></div> : null}
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

function FlowNode({ node, selected, onClick, index }: { node: (typeof builderNodes)[number]; selected: boolean; onClick: () => void; index: number }) {
  const Icon = node.icon;
  return <div className="po-flow-node-wrap">{index > 0 && <div className="po-flow-connector" aria-hidden="true"><span /></div>}<button type="button" className={"po-flow-node" + (selected ? " is-selected" : "")} onClick={onClick} aria-pressed={selected}><span className={"po-flow-node-icon po-flow-node-icon--" + node.key}><Icon /></span><span className="po-flow-node-content"><span className="po-flow-node-kicker">{node.number} / {node.kind}</span><strong>{node.title}</strong><span>{node.summary}</span><small>{node.detail}</small></span><span className="po-flow-node-end" aria-hidden="true">↗</span></button></div>;
}

function StepInspector({ nodeKey, onSelect }: { nodeKey: BuilderNodeKey; onSelect: (key: BuilderNodeKey) => void }) {
  const selected = builderNodes.find((node) => node.key === nodeKey) ?? builderNodes[0]!;
  const Icon = selected.icon;
  return <aside className="po-inspector" aria-label="Step settings">
    <div className="po-inspector-tabs"><button type="button" className="is-active">Step</button><button type="button" onClick={() => onSelect("reply")}>Reply preview</button></div>
    <div className="po-inspector-title"><span className={"po-inspector-icon po-flow-node-icon--" + selected.key}><Icon /></span><div><span className="po-eyebrow">{selected.kind}</span><h2>{selected.title}</h2><p>{selected.summary}</p></div></div>
    {nodeKey === "trigger" && <div className="po-inspector-fields"><label>Start when<span className="po-readonly-field">A comment or DM matches a keyword <ChevronDownIcon className="po-icon-small" /></span></label><label>Keywords <span className="po-field-meta">One phrase per line</span><textarea readOnly rows={4} value={"price\nquote\ndetails"} aria-label="Sample trigger keywords" /></label><label>Match type<span className="po-readonly-field">Contains <ChevronDownIcon className="po-icon-small" /></span></label><p className="po-help">Only matching comments and messages start the automation.</p></div>}
    {nodeKey === "reply" && <div className="po-inspector-fields"><label>Reply goal<span className="po-readonly-field">Answer the first question <ChevronDownIcon className="po-icon-small" /></span></label><label>Instructions<textarea readOnly rows={5} value={"Answer clearly using the configured knowledge base when available. If the answer is unclear, ask one short follow-up question."} aria-label="Sample AI reply instructions" /></label><div className="po-inspector-option"><span className="po-option-check"><CheckCircleIcon /></span><span><strong>Use knowledge base</strong><small>Ground replies in configured business information.</small></span><Tag tone="success">On</Tag></div><p className="po-help">No AI response is generated in this preview.</p></div>}
    {nodeKey === "goal" && <div className="po-inspector-fields"><label>Question<span className="po-readonly-field">What are you looking for help with?</span></label><label>Captured details</label><div className="po-check-list"><span><i />Interest</span><span><i />Preferred timeline</span></div><p className="po-help">Example fields only; they are not configured on a real automation.</p></div>}
    {nodeKey === "followup" && <div className="po-inspector-fields"><label>Message<textarea readOnly rows={5} value={"Thanks for sharing that. I'll help you find the right next step. Is there anything else you'd like us to know?"} aria-label="Sample follow-up message" /></label><p className="po-help">Review message wording before publishing a real automation.</p></div>}
    <div className="po-inspector-footer"><span>Preview settings are read-only</span><button type="button" disabled className="po-button po-button--secondary">Update step</button></div>
  </aside>;
}

function BuilderScreen({ dirty, onSelectNode }: { dirty: boolean; onSelectNode: (key: BuilderNodeKey) => void }) {
  const [selectedNode, setSelectedNode] = useState<BuilderNodeKey>("trigger");
  return <section className="po-builder-screen" aria-label="Automation builder concept">
    <div className="po-builder-subnav" role="tablist" aria-label="Automation sections">{["Flow", "Setup", "Results", "Leads"].map((tab, index) => <button key={tab} type="button" role="tab" aria-selected={index === 0} className={index === 0 ? "is-active" : ""} disabled={index !== 0} title={index === 0 ? undefined : "Not included in this focused preview"}>{tab}</button>)}<div className="po-builder-subnav-right"><span className="po-flow-summary"><span />{dirty ? "Draft has unsaved changes" : "Preview marked saved"}</span></div></div>
    <div className="po-builder-grid"><BuilderPalette onSelect={(key) => { setSelectedNode(key); onSelectNode(key); }} /><section className="po-canvas" aria-label="Automation flow"><div className="po-canvas-topline"><span>Lead qualification flow</span><span>Illustrative layout · not connected to runtime</span></div><div className="po-canvas-workspace"><div className="po-canvas-watermark">SAMPLE FLOW</div><div className="po-flow">{builderNodes.map((node, index) => <FlowNode key={node.key} node={node} index={index} selected={selectedNode === node.key} onClick={() => { setSelectedNode(node.key); onSelectNode(node.key); }} />)}<button type="button" className="po-add-step" onClick={() => { setSelectedNode("followup"); onSelectNode("followup"); }}><PlusIcon /> Add another message</button></div></div><div className="po-canvas-footer"><span>4 steps · Sample flow only</span><div><button type="button" aria-label="Zoom out" disabled>−</button><span>100%</span><button type="button" aria-label="Zoom in" disabled>+</button></div></div></section><StepInspector nodeKey={selectedNode} onSelect={(key) => { setSelectedNode(key); onSelectNode(key); }} /></div>
  </section>;
}

function WalkthroughDialog({ onClose }: { onClose: () => void }) {
  return <div className="po-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="po-modal" role="dialog" aria-modal="true" aria-labelledby="po-walkthrough-title"><div className="po-modal-top"><span className="po-modal-icon"><PlayIcon /></span><button type="button" className="po-icon-button" aria-label="Close walkthrough" onClick={onClose}>×</button></div><span className="po-eyebrow">SAMPLE WALKTHROUGH</span><h2 id="po-walkthrough-title">See how the flow is meant to work</h2><p>This preview demonstrates the order of steps. It does not execute an automation or send a real Instagram reply.</p><ol className="po-walkthrough-steps"><li><span>1</span><div><strong>Match a comment or DM</strong><small>Example keyword: “price”</small></div><Tag tone="success">Matched</Tag></li><li><span>2</span><div><strong>Draft a relevant reply</strong><small>Use configured knowledge when available</small></div><Tag>Preview</Tag></li><li><span>3</span><div><strong>Ask a qualification question</strong><small>Capture the person's stated interest</small></div><Tag>Preview</Tag></li></ol><div className="po-modal-footer"><button type="button" className="po-button po-button--secondary" onClick={onClose}>Close preview</button></div></section></div>;
}

function PublishDialog({ onClose }: { onClose: () => void }) {
  return <div className="po-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="po-modal" role="dialog" aria-modal="true" aria-labelledby="po-publish-title"><div className="po-modal-top"><span className="po-modal-icon po-modal-icon--warning">!</span><button type="button" className="po-icon-button" aria-label="Close publish dialog" onClick={onClose}>×</button></div><span className="po-eyebrow">PUBLISH SAFETY</span><h2 id="po-publish-title">Publishing is disabled in this preview</h2><p>In the real product, publishing can enable replies to matching Instagram comments or DMs. Review connected accounts and configuration before making an automation live.</p><div className="po-readiness-list"><span><CheckCircleIcon /> Sample flow is visible</span><span><span className="po-readiness-empty" /> Real account readiness has not been checked</span><span><span className="po-readiness-empty" /> Runtime validation has not been run</span></div><div className="po-modal-footer"><button type="button" className="po-button po-button--secondary" onClick={onClose}>Back to preview</button></div></section></div>;
}

function InboxScreen() {
  const [selected, setSelected] = useState(0);
  const [humanMode, setHumanMode] = useState(false);
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [sendNotice, setSendNotice] = useState(false);
  const visibleConversations = conversations.filter((item) => {
    const search = query.toLowerCase().trim();
    const matchesQuery = !search || item.handle.includes(search) || item.preview.toLowerCase().includes(search);
    const matchesFilter = filter === "All" || (filter === "AI handling" ? item.status === "AI handling" : filter === "Needs review" ? item.status === "Needs review" : filter === "Human" ? item.status === "Human" : true);
    return matchesQuery && matchesFilter;
  });
  const current = conversations[selected] ?? conversations[0]!;
  return <section className="po-inbox-screen" aria-label="Inbox concept"><div className="po-screen-toolbar"><div className="po-filter-tabs" role="group" aria-label="Conversation filters">{["All", "AI handling", "Needs review", "Human"].map((name) => <button type="button" key={name} onClick={() => setFilter(name)} className={filter === name ? "is-active" : ""}>{name}{name === "All" && <span>5</span>}</button>)}</div><label className="po-search"><SearchIcon /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sample conversations" /></label></div><div className="po-inbox-layout"><div className="po-conversation-list">{visibleConversations.length === 0 ? <div className="po-empty-mini"><strong>No sample conversations match</strong><span>Try another search or filter.</span></div> : visibleConversations.map((item) => { const originalIndex = conversations.findIndex((candidate) => candidate.handle === item.handle); return <button key={item.handle} type="button" className={"po-conversation" + (selected === originalIndex ? " is-selected" : "")} onClick={() => { setSelected(originalIndex); setSendNotice(false); }}><span className="po-avatar">{item.initial}</span><span className="po-conversation-body"><span className="po-conversation-first"><strong>{item.handle}</strong><small>{item.time}</small></span><span className="po-conversation-preview">{item.preview}</span><span className="po-conversation-bottom"><Tag tone={item.tone}>{item.status}</Tag></span></span></button>; })}</div><div className="po-thread"><header className="po-thread-header"><div className="po-avatar">SF</div><div><strong>{current.handle}</strong><span>Instagram conversation · sample</span></div><Tag tone={humanMode ? "blue" : "purple"}>{humanMode ? "Human handling" : "AI handling"}</Tag></header><div className="po-post-context"><InstagramMarkIcon /><span><strong>Comment on a recent post</strong><small>“Interested in coaching options” · sample context</small></span></div><div className="po-messages"><div className="po-message po-message--incoming"><span>Hi, {current.preview.toLowerCase().replace(/[?!.]$/, "")}</span><small>10:24 AM · Sample</small></div><div className="po-message po-message--outgoing"><span>Thanks for reaching out. I can share a few options based on what you're looking for.</span><small>10:25 AM · Example AI reply</small></div><div className="po-message po-message--incoming"><span>That sounds good. Could you tell me more?</span><small>10:26 AM · Sample</small></div></div>{sendNotice && <p className="po-inline-notice" role="status">Sending is disabled in this preview. No message was sent.</p>}<div className="po-composer"><textarea aria-label="Sample reply composer" placeholder="Reply composer shown for layout only" readOnly /><div className="po-composer-actions"><span>Replies disabled in preview</span><button type="button" className="po-button po-button--primary" onClick={() => setSendNotice(true)}><SendIcon /> Send</button></div></div></div><aside className="po-conversation-details"><span className="po-eyebrow">CONTACT CONTEXT</span><h3>{current.handle}</h3><p>Instagram user · sample profile</p><div className="po-detail-row"><span>Handling mode</span><Tag tone={humanMode ? "blue" : "purple"}>{humanMode ? "Human" : "AI"}</Tag></div><div className="po-detail-row"><span>Pipeline stage</span><Tag>New</Tag></div><div className="po-detail-row"><span>Owner</span><strong>{humanMode ? "You (preview)" : "Unassigned"}</strong></div><div className="po-detail-divider" /><button type="button" className="po-button po-button--secondary po-full-width" onClick={() => setHumanMode((value) => !value)}>{humanMode ? "Return to AI (demo)" : "Take over (demo)"}</button><p className="po-help">This only changes the preview label; it does not alter a real conversation.</p></aside></div></section>;
}

function LeadsScreen() {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("All stages");
  const filteredLeads = useMemo(() => leads.filter((lead) => {
    const q = query.toLowerCase().trim();
    return (!q || lead.name.toLowerCase().includes(q) || lead.handle.toLowerCase().includes(q)) && (stage === "All stages" || lead.stage === stage);
  }), [query, stage]);
  return <section className="po-leads-screen" aria-label="Leads concept"><div className="po-sample-metrics-label"><span>ILLUSTRATIVE VALUES</span><small>Sample data for layout review · not production metrics</small></div><div className="po-metric-row"><div className="po-metric"><span>Total leads</span><strong>24</strong><small>Sample workspace</small></div><div className="po-metric"><span>New</span><strong>19</strong><small>Needs first contact</small></div><div className="po-metric"><span>Contacted</span><strong>3</strong><small>Follow-up in progress</small></div><div className="po-metric"><span>Qualified</span><strong>2</strong><small>Ready for review</small></div></div><div className="po-leads-table-wrap"><div className="po-table-toolbar"><div><h2>All sample leads</h2><p>Search and filter before opening a lead record.</p></div><div className="po-table-controls"><label className="po-search"><SearchIcon /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search leads" /></label><label className="po-select-wrap"><span className="po-visually-hidden">Filter by pipeline stage</span><select value={stage} onChange={(event) => setStage(event.target.value)}><option>All stages</option><option>New</option><option>Contacted</option><option>Qualified</option></select><ChevronDownIcon /></label></div></div><div className="po-table-scroll"><table className="po-leads-table"><thead><tr><th scope="col">Lead</th><th scope="col">Source</th><th scope="col">Stage</th><th scope="col">Last activity</th><th scope="col">Assigned to</th><th scope="col"><span className="po-visually-hidden">Row actions</span></th></tr></thead><tbody>{filteredLeads.map((lead) => <tr key={lead.handle}><td><div className="po-table-lead"><span className="po-avatar po-avatar--small">{lead.name.split(" ").map((part) => part[0]).join("")}</span><span><strong>{lead.name}</strong><small>{lead.handle}</small></span></div></td><td>{lead.source}</td><td><Tag tone={lead.stage === "Qualified" ? "green" : lead.stage === "Contacted" ? "blue" : "neutral"}>{lead.stage}</Tag></td><td className="po-time-cell">{lead.activity}</td><td>{lead.owner}</td><td><button type="button" className="po-icon-button" aria-label={"Actions for " + lead.name} disabled title="Lead actions are not interactive in this preview">⋯</button></td></tr>)}</tbody></table>{filteredLeads.length === 0 && <div className="po-table-empty"><strong>No sample leads match</strong><span>Clear the search or choose another stage.</span></div>}</div><div className="po-table-footer"><span>Showing {filteredLeads.length} illustrative leads</span><button type="button" disabled className="po-button po-button--secondary">Pagination preview</button></div></div></section>;
}

export function PrecisionOperationsPreviewPage() {
  const [screen, setScreen] = useState<PreviewScreen>("builder");
  const [dirty, setDirty] = useState(true);
  const [savedNotice, setSavedNotice] = useState(false);
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [, setSelectedNode] = useState<BuilderNodeKey>("trigger");
  const savePreviewState = () => { setDirty(false); setSavedNotice(true); };
  return <div className="po-preview-app"><a className="po-skip-link" href="#po-main">Skip to main content</a><Sidebar screen={screen} onNavigate={(next) => { setScreen(next); setSavedNotice(false); }} /><main id="po-main" className="po-main"><PreviewNotice /><div className="po-main-content"><PageHeader screen={screen} dirty={dirty} onSave={savePreviewState} onTest={() => setShowWalkthrough(true)} onPublish={() => setShowPublish(true)} />{savedNotice && <div className="po-inline-notice" role="status">Preview state marked saved. Nothing was written to the server.</div>}{screen === "builder" && <BuilderScreen dirty={dirty} onSelectNode={setSelectedNode} />}{screen === "inbox" && <InboxScreen />}{screen === "leads" && <LeadsScreen />}<footer className="po-footer"><span>SignalAI · Precision Operations Studio</span><span>Concept preview, not a live workspace</span></footer></div></main>{showWalkthrough && <WalkthroughDialog onClose={() => setShowWalkthrough(false)} />}{showPublish && <PublishDialog onClose={() => setShowPublish(false)} />}</div>;
}
