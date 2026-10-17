import { Fragment, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ApiError,
  api,
  type Deal,
  type FieldDefinition,
  type LeadDetail,
  type LeadIntelligence,
  type LeadIntelligenceHistoryEntry,
  type LeadNote,
  type LeadTag,
  type PipelineStage,
  type TenantMember,
} from "../api";
import { ThreadPanel } from "../components/ThreadPanel";
import { PageHeader, StatusBadge } from "../components/ui";
import { PIPELINE_STAGES, formatBudgetValue, formatDate, formatIntentLabel, formatLastContactVia, formatMessagingWindow, formatRelativeTime, handoffLabel, leadDisplayName, scoreBandLabel } from "../lib/leadFormatting";

type LeadDetailTab = "overview" | "conversation" | "activities" | "notes";

const LEAD_TAB_QUERY_VALUE: Record<LeadDetailTab, string> = {
  overview: "Overview",
  conversation: "Conversation",
  activities: "Activities",
  notes: "Notes",
};

function parseLeadDetailTab(value: string | null): LeadDetailTab {
  const normalized = value?.toLowerCase();
  if (normalized === "conversation") return "conversation";
  if (normalized === "activities" || normalized === "activity") return "activities";
  if (normalized === "notes") return "notes";
  return "overview";
}

export function LeadDetailPage() {
  const { tenantId, leadId } = useParams<{ tenantId: string; leadId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [timelineRefreshToken, setTimelineRefreshToken] = useState(0);
  const [notes, setNotes] = useState<LeadNote[] | null>(null);
  const [tags, setTags] = useState<LeadTag[] | null>(null);
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [members, setMembers] = useState<TenantMember[] | null>(null);
  const [capturedFacts, setCapturedFacts] = useState<Record<string, string> | null>(null);
  const [fieldDefinitions, setFieldDefinitions] = useState<FieldDefinition[] | null>(null);
  const [intelligence, setIntelligence] = useState<LeadIntelligence | null | undefined>(undefined);
  const [intelligenceHistory, setIntelligenceHistory] = useState<LeadIntelligenceHistoryEntry[] | null>(null);
  const [intelligenceError, setIntelligenceError] = useState<string | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [activeTab, setActiveTab] = useState<LeadDetailTab>(() => parseLeadDetailTab(searchParams.get("leadTab")));
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [noteBody, setNoteBody] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [tagName, setTagName] = useState("");
  const [savingTag, setSavingTag] = useState(false);
  const [dealValue, setDealValue] = useState("");
  const [savingDeal, setSavingDeal] = useState(false);
  const [busy, setBusy] = useState(false);

  const detailRequestRef = useRef(0);
  const intelligenceRequestRef = useRef(0);

  async function loadAll() {
    if (!tenantId || !leadId) return;
    const requestId = ++detailRequestRef.current;
    const [l, n, tg, d, m, cf, fd] = await Promise.all([api.getLead(tenantId, leadId), api.listLeadNotes(tenantId, leadId), api.listLeadTags(tenantId, leadId), api.listLeadDeals(tenantId, leadId), api.listMembers(tenantId), api.getCapturedFacts(tenantId, leadId), api.listFieldDefinitions(tenantId)]);
    if (requestId !== detailRequestRef.current) return;
    setLead(l); setNotes(n); setTags(tg); setDeals(d); setMembers(m); setCapturedFacts(cf); setFieldDefinitions(fd); setError(null);
  }
  async function loadIntelligence() {
    if (!tenantId || !leadId) return;
    const requestId = ++intelligenceRequestRef.current;
    setIntelligenceError(null);
    try {
      const [current, history] = await Promise.all([api.getLeadIntelligence(tenantId, leadId), api.getLeadIntelligenceHistory(tenantId, leadId)]);
      if (requestId !== intelligenceRequestRef.current) return;
      setIntelligence(current); setIntelligenceHistory(history);
    } catch (err) {
      if (requestId !== intelligenceRequestRef.current) return;
      setIntelligence(null); setIntelligenceHistory(null); setIntelligenceError(err instanceof Error ? err.message : "Failed to load lead intelligence");
    }
  }
  async function handleRecalculateIntelligence() {
    if (!tenantId || !leadId) return;
    const requestId = ++intelligenceRequestRef.current;
    setRecalculating(true); setIntelligenceError(null);
    try {
      const refreshed = await api.recalculateLeadIntelligence(tenantId, leadId);
      const history = await api.getLeadIntelligenceHistory(tenantId, leadId);
      if (requestId !== intelligenceRequestRef.current) return;
      setIntelligence(refreshed); setIntelligenceHistory(history);
    } catch (err) {
      if (requestId !== intelligenceRequestRef.current) return;
      setIntelligenceError(err instanceof Error ? err.message : "Failed to recalculate lead intelligence");
    } finally {
      if (requestId === intelligenceRequestRef.current) setRecalculating(false);
    }
  }
  useEffect(() => {
    // Key tab state off the serialized location search, not a mutable URLSearchParams reference.
    setActiveTab(parseLeadDetailTab(new URLSearchParams(location.search).get("leadTab")));
  }, [location.search]);

  useEffect(() => {
    if (!tenantId || !leadId) return;
    let cancelled = false;
    detailRequestRef.current += 1;
    intelligenceRequestRef.current += 1;
    setLead(null); setNotes(null); setTags(null); setDeals(null); setMembers(null); setCapturedFacts(null); setFieldDefinitions(null);
    setIntelligence(undefined); setIntelligenceHistory(null); setIntelligenceError(null); setError(null);
    loadAll().catch((err) => { if (cancelled) return; if (err instanceof ApiError && (err.status === 401 || err.status === 403)) { navigate("/login", { replace: true }); return; } setError(err instanceof Error ? err.message : "Failed to load lead"); });
    void loadIntelligence();
    api.markLeadRead(tenantId, leadId).catch(() => {});
    return () => {
      cancelled = true;
      detailRequestRef.current += 1;
      intelligenceRequestRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, leadId, reloadCount]);
  function handleTabChange(tab: LeadDetailTab) {
    setActiveTab(tab);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("leadTab", LEAD_TAB_QUERY_VALUE[tab]);
    setSearchParams(nextParams, { replace: true });
  }
  async function handleStageChange(stage: PipelineStage) { if (!tenantId || !leadId) return; setBusy(true); setError(null); try { const updated = await api.updateLead(tenantId, leadId, { pipelineStage: stage }); setLead(updated); await loadAll(); setTimelineRefreshToken((t) => t + 1); } catch (err) { setError(err instanceof Error ? err.message : "Failed to update stage"); } finally { setBusy(false); } }
  async function handleOwnerChange(ownerUserId: string) { if (!tenantId || !leadId) return; setBusy(true); setError(null); try { const updated = await api.updateLead(tenantId, leadId, { ownerUserId: ownerUserId || null }); setLead(updated); await loadAll(); setTimelineRefreshToken((t) => t + 1); } catch (err) { setError(err instanceof Error ? err.message : "Failed to assign owner"); } finally { setBusy(false); } }
  async function handleHandoff(action: "request" | "takeover" | "release") { if (!tenantId || !leadId) return; setBusy(true); setError(null); try { const updated = await api.handoffAction(tenantId, leadId, action); setLead(updated); await loadAll(); setTimelineRefreshToken((t) => t + 1); } catch (err) { setError(err instanceof Error ? err.message : "Failed to update handoff status"); } finally { setBusy(false); } }
  async function handleAddNote() { if (!tenantId || !leadId || !noteBody.trim()) return; setSavingNote(true); setError(null); try { await api.addLeadNote(tenantId, leadId, noteBody.trim()); setNoteBody(""); setNotes(await api.listLeadNotes(tenantId, leadId)); setTimelineRefreshToken((t) => t + 1); } catch (err) { setError(err instanceof Error ? err.message : "Failed to add note"); } finally { setSavingNote(false); } }
  async function handleAddTag() { if (!tenantId || !leadId || !tagName.trim()) return; setSavingTag(true); setError(null); try { await api.addLeadTag(tenantId, leadId, tagName.trim()); setTagName(""); setTags(await api.listLeadTags(tenantId, leadId)); } catch (err) { setError(err instanceof Error ? err.message : "Failed to add tag"); } finally { setSavingTag(false); } }
  async function handleRemoveTag(tagId: string) { if (!tenantId || !leadId) return; try { await api.removeLeadTag(tenantId, leadId, tagId); setTags(await api.listLeadTags(tenantId, leadId)); } catch (err) { setError(err instanceof Error ? err.message : "Failed to remove tag"); } }
  async function handleCreateDeal() { if (!tenantId || !leadId) return; setSavingDeal(true); setError(null); try { const value = dealValue.trim() ? Number(dealValue.trim()) : null; await api.createLeadDeal(tenantId, leadId, value); setDealValue(""); setDeals(await api.listLeadDeals(tenantId, leadId)); } catch (err) { setError(err instanceof Error ? err.message : "Failed to create deal"); } finally { setSavingDeal(false); } }
  async function handleDealStage(dealId: string, stage: Deal["stage"]) { if (!tenantId) return; try { await api.updateDealStage(tenantId, dealId, stage); setDeals(await api.listLeadDeals(tenantId, leadId!)); } catch (err) { setError(err instanceof Error ? err.message : "Failed to update deal"); } }
  if (!tenantId || !leadId) return null;
  const fieldLabel = (key: string) => fieldDefinitions?.find((f) => f.fieldKey === key)?.label ?? key;
  const TABS: { value: typeof activeTab; label: string }[] = [{ value: "overview", label: "Overview" }, { value: "conversation", label: "Conversation" }, { value: "activities", label: "Activities" }, { value: "notes", label: "Notes" }];
  const ownerName = lead?.ownerUserId ? (members ?? []).find((m) => m.userId === lead.ownerUserId)?.email ?? "assigned teammate" : null;
  return (
    <div className="page page-wide page-lead-detail">
      <PageHeader
        eyebrow="Lead profile"
        title={
          <span className="lead-detail-heading">
            <span>{lead ? leadDisplayName(lead.username) : "Lead"}</span>
            {lead && <StatusBadge tone={lead.handoffStatus === "human" ? "info" : lead.handoffStatus === "requested" ? "warning" : "success"} dot>{handoffLabel(lead.handoffStatus).text}</StatusBadge>}
          </span>
        }
        description={lead?.username ? `@${lead.username.replace(/^@/, "")} · Instagram lead` : lead ? "Instagram hasn't provided a username for this lead yet. You can still review the conversation and captured details here." : "Review context, ownership, conversation, activity, notes, and next steps."}
        actions={<Link className="btn-secondary btn-small" to={`/dashboard/${tenantId}/leads`}>← Back to leads</Link>}
      />
      {error && <div className="banner banner-error flex flex-wrap items-center justify-between gap-3" role="alert"><span>{error}</span>{!lead && <button type="button" className="link-button" onClick={() => setReloadCount((count) => count + 1)}>Retry loading lead</button>}</div>}
      {!lead ? <p className="muted" role="status">{error ? "Lead details could not be loaded." : "Loading lead…"}</p> : <>
        <div className="lead-detail-tabs" role="tablist" aria-label="Lead details">
          {TABS.map((t, index) => <button key={t.value} ref={(element) => { tabRefs.current[index] = element; }} id={`lead-tab-${t.value}`} type="button" role="tab" aria-selected={activeTab === t.value} aria-controls="lead-tabpanel" tabIndex={activeTab === t.value ? 0 : -1} className={activeTab === t.value ? "lead-detail-tab is-active" : "lead-detail-tab"} onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => { let nextIndex: number | null = null; if (event.key === "ArrowRight") nextIndex = (index + 1) % TABS.length; if (event.key === "ArrowLeft") nextIndex = (index - 1 + TABS.length) % TABS.length; if (event.key === "Home") nextIndex = 0; if (event.key === "End") nextIndex = TABS.length - 1; if (nextIndex !== null) { event.preventDefault(); tabRefs.current[nextIndex]?.focus(); handleTabChange(TABS[nextIndex].value); } }} onClick={() => handleTabChange(t.value)}>{t.label}</button>)}
        </div>
        <div id="lead-tabpanel" className="lead-detail-tab-panel" role="tabpanel" aria-labelledby={`lead-tab-${activeTab}`} tabIndex={0}>
        {activeTab === "overview" && <>
          <div className="lead-detail-grid">
            <div className="lead-detail-main">
          <section className="card">
            <h2>Overview</h2>
            <div className="field-group grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label>Pipeline stage<select value={lead.pipelineStage} disabled={busy} onChange={(e) => handleStageChange(e.target.value as PipelineStage)}>{PIPELINE_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
              <label>Owner<select value={lead.ownerUserId ?? ""} disabled={busy} onChange={(e) => handleOwnerChange(e.target.value)}><option value="">Unassigned</option>{(members ?? []).map((m) => <option key={m.userId} value={m.userId}>{m.email}</option>)}</select></label>
            </div>
            {lead.handoffStatus !== "ai" && <div className="banner small" role="status"><strong>{lead.handoffStatus === "human" ? "Human handoff active" : "Handoff requested"}.</strong> {ownerName ? `Owner: ${ownerName}.` : "Assign an owner before a teammate takes over."}</div>}
            {lead.handoffStatus === "ai" && !lead.ownerUserId && <div className="banner small" role="note"><strong>Ready for escalation.</strong> Assign an owner before handing this conversation to a teammate.</div>}
            <div className="button-row">
              {lead.handoffStatus !== "human" && <button className="btn-secondary btn-small" disabled={busy || !lead.ownerUserId} title={!lead.ownerUserId ? "Assign an owner before taking over" : undefined} onClick={() => handleHandoff("takeover")}>Take over conversation</button>}
              {lead.handoffStatus === "human" && <button className="btn-secondary btn-small" disabled={busy} onClick={() => handleHandoff("release")}>Return to AI</button>}
              {lead.handoffStatus === "ai" && <button className="btn-secondary btn-small" disabled={busy} onClick={() => handleHandoff("request")}>Escalate for attention</button>}
            </div>
            <div>{(tags ?? []).map((t) => <span className="tag-chip" key={t.tagId}>{t.name}<button onClick={() => handleRemoveTag(t.tagId)} aria-label={`Remove tag ${t.name}`}>×</button></span>)}</div>
            <div className="inline-form"><input type="text" aria-label="Tag name" placeholder="Add a tag…" value={tagName} onChange={(e) => setTagName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAddTag()} /><button className="btn-secondary btn-small" disabled={savingTag || !tagName.trim()} onClick={handleAddTag}>Add</button></div>
          </section>
          <section className="card"><h2>Captured Facts</h2>{capturedFacts === null ? <p className="muted">Loading…</p> : Object.keys(capturedFacts).length === 0 ? <p className="muted">Nothing captured yet — the AI hasn't learned any details about this lead so far.</p> : <dl className="kv">{Object.entries(capturedFacts).map(([key, value]) => <Fragment key={key}><dt>{fieldLabel(key)}</dt><dd>{value}</dd></Fragment>)}</dl>}</section>
            </div>
            <aside className="lead-detail-aside">
              <section className="card lead-detail-contact">
                <h2>Contact</h2>
                <dl className="kv">
                  <dt>Username</dt><dd>{lead.username ? `@${lead.username.replace(/^@/, "")}` : "Unavailable"}</dd>
                  <dt>Source</dt><dd>{formatLastContactVia(lead.lastEventType)}</dd>
                  <dt>Last activity</dt><dd><time dateTime={lead.lastInboundAt ?? undefined} title={lead.lastInboundAt ? new Date(lead.lastInboundAt).toLocaleString() : undefined}>{lead.lastInboundAt ? formatRelativeTime(lead.lastInboundAt) : "No activity"}</time></dd>
                  <dt>First seen</dt><dd><time dateTime={lead.createdAt} title={new Date(lead.createdAt).toLocaleString()}>{formatRelativeTime(lead.createdAt)}</time></dd>
                  <dt>Messaging window</dt><dd>{(() => { const window = formatMessagingWindow(lead.windowOpenUntil); return <StatusBadge tone={window.open ? "success" : "neutral"}>{window.label}</StatusBadge>; })()}</dd>
                </dl>
              </section>
          <section className="card"><div className="button-row lead-intelligence-heading" style={{ justifyContent: "space-between", alignItems: "center" }}><h2 style={{ margin: 0 }}>Lead Intelligence</h2><button className="btn-secondary btn-small" disabled={recalculating} onClick={handleRecalculateIntelligence}>{recalculating ? "Recalculating…" : "Recalculate"}</button></div>{intelligenceError && <div className="banner banner-error" role="alert">{intelligenceError}</div>}{intelligence === undefined ? <p className="muted">Loading…</p> : intelligence === null ? <p className="muted">No intelligence yet — the AI hasn't learned enough about this lead to score it.</p> : <><div className="field-group"><div><div className="muted" style={{ fontSize: "0.85rem" }}>Lead Score</div><div style={{ fontSize: "1.8rem", fontWeight: 600 }}>{intelligence.score}<span className={scoreBandLabel(intelligence.scoreBand).className}>{scoreBandLabel(intelligence.scoreBand).text}</span></div></div></div><dl className="kv"><dt>Intent</dt><dd>{intelligence.intent ? formatIntentLabel(intelligence.intent) : "—"}</dd><dt>Need</dt><dd>{intelligence.need ?? "—"}</dd><dt>Budget</dt><dd>{intelligence.budgetValue !== null ? formatBudgetValue(intelligence.budgetValue) : (intelligence.budgetText ?? "—")}</dd><dt>Location</dt><dd>{intelligence.location ?? "—"}</dd></dl>{intelligence.scoreReasons.length > 0 && <><div className="muted" style={{ fontSize: "0.85rem", marginTop: "0.75rem" }}>Score Reasons</div><ul className="list">{intelligence.scoreReasons.map((reason, i) => <li className="list-item" key={i} style={{ display: "block" }}>{reason}</li>)}</ul></>}{intelligenceHistory !== null && intelligenceHistory.length > 1 && <><div className="muted" style={{ fontSize: "0.85rem", marginTop: "0.75rem" }}>History</div><ul className="list">{intelligenceHistory.slice(0, 10).map((entry) => <li className="list-item" key={entry.id}><div>{entry.score} · {scoreBandLabel(entry.scoreBand).text}{entry.intent && <span className="muted"> — Intent: {formatIntentLabel(entry.intent)}</span>}</div><div className="timeline-meta">{formatDate(entry.createdAt)}</div></li>)}</ul></>}</> }</section>
          <section className="card"><h2>Deals</h2>{deals === null ? <p className="muted">Loading…</p> : deals.length === 0 ? <p className="muted">No deals yet.</p> : <ul className="list">{deals.map((d) => <li className="list-item" key={d.id}><span>{d.value !== null ? `${d.currency} ${d.value}` : "No value set"}<span className={d.stage === "won" ? "pill pill-ok" : d.stage === "lost" ? "pill pill-error" : "pill"}>{d.stage}</span></span>{d.stage === "open" && <span className="button-row" style={{ marginBottom: 0 }}><button className="btn-secondary btn-small" onClick={() => handleDealStage(d.id, "won")}>Mark won</button><button className="btn-secondary btn-small" onClick={() => handleDealStage(d.id, "lost")}>Mark lost</button></span>}</li>)}</ul>}<div className="inline-form"><input type="text" aria-label="Deal value (optional)" placeholder="Deal value (optional)" value={dealValue} onChange={(e) => setDealValue(e.target.value)} /><button className="btn-secondary btn-small" disabled={savingDeal} onClick={handleCreateDeal}>Add deal</button></div></section>
            </aside>
          </div>
        </>}
        {activeTab === "conversation" && <section className="card lead-detail-timeline"><h2>Conversation</h2><ThreadPanel tenantId={tenantId} leadId={leadId} refreshToken={timelineRefreshToken} kindFilter={["event", "reply"]} onError={setError} /></section>}
        {activeTab === "activities" && <section className="card lead-detail-timeline"><h2>Activities</h2><ThreadPanel tenantId={tenantId} leadId={leadId} refreshToken={timelineRefreshToken} kindFilter={["activity"]} variant="timeline" onError={setError} /></section>}
        {activeTab === "notes" && <section className="card lead-detail-timeline"><h2>Notes</h2>{notes === null ? <p className="muted">Loading…</p> : notes.length === 0 ? <p className="muted">No notes yet.</p> : <ul className="list">{notes.map((n) => <li className="list-item" key={n.id} style={{ display: "block" }}><div>{n.body}</div><div className="timeline-meta">{formatDate(n.createdAt)}</div></li>)}</ul>}<div className="inline-form"><textarea aria-label="Internal note" placeholder="Add an internal note…" value={noteBody} onChange={(e) => setNoteBody(e.target.value)} rows={2} /><button className="btn-secondary btn-small" disabled={savingNote || !noteBody.trim()} onClick={handleAddNote}>Add note</button></div></section>}
        </div>
      </>}
    </div>
  );
}
