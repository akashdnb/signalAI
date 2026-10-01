import { Fragment, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
import { PIPELINE_STAGES, formatBudgetValue, formatDate, formatIntentLabel, handoffLabel, scoreBandLabel } from "../lib/leadFormatting";

export function LeadDetailPage() {
  const { tenantId, leadId } = useParams<{ tenantId: string; leadId: string }>();
  const navigate = useNavigate();

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
  const [activeTab, setActiveTab] = useState<"overview" | "conversation" | "activities" | "notes">("overview");

  const [noteBody, setNoteBody] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [tagName, setTagName] = useState("");
  const [savingTag, setSavingTag] = useState(false);
  const [dealValue, setDealValue] = useState("");
  const [savingDeal, setSavingDeal] = useState(false);
  const [busy, setBusy] = useState(false);

  async function loadAll() {
    if (!tenantId || !leadId) return;
    const [l, n, tg, d, m, cf, fd] = await Promise.all([
      api.getLead(tenantId, leadId),
      api.listLeadNotes(tenantId, leadId),
      api.listLeadTags(tenantId, leadId),
      api.listLeadDeals(tenantId, leadId),
      api.listMembers(tenantId),
      api.getCapturedFacts(tenantId, leadId),
      api.listFieldDefinitions(tenantId),
    ]);
    setLead(l);
    setNotes(n);
    setTags(tg);
    setDeals(d);
    setMembers(m);
    setCapturedFacts(cf);
    setFieldDefinitions(fd);
  }

  // Loaded separately from loadAll: a failure fetching intelligence (a
  // transient error, a tenant that's never had scoring run) shouldn't take
  // down the whole Overview tab — it only disables this one card.
  async function loadIntelligence() {
    if (!tenantId || !leadId) return;
    setIntelligenceError(null);
    try {
      const [current, history] = await Promise.all([
        api.getLeadIntelligence(tenantId, leadId),
        api.getLeadIntelligenceHistory(tenantId, leadId),
      ]);
      setIntelligence(current);
      setIntelligenceHistory(history);
    } catch (err) {
      setIntelligence(null);
      setIntelligenceHistory(null);
      setIntelligenceError(err instanceof Error ? err.message : "Failed to load lead intelligence");
    }
  }

  async function handleRecalculateIntelligence() {
    if (!tenantId || !leadId) return;
    setRecalculating(true);
    setIntelligenceError(null);
    try {
      const refreshed = await api.recalculateLeadIntelligence(tenantId, leadId);
      setIntelligence(refreshed);
      setIntelligenceHistory(await api.getLeadIntelligenceHistory(tenantId, leadId));
    } catch (err) {
      setIntelligenceError(err instanceof Error ? err.message : "Failed to recalculate lead intelligence");
    } finally {
      setRecalculating(false);
    }
  }

  useEffect(() => {
    // AppShell already guards the session before this page ever mounts —
    // this effect only needs to load the lead's own data.
    if (!tenantId || !leadId) return;
    let cancelled = false;
    loadAll().catch((err) => {
      if (cancelled) return;
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        navigate("/login", { replace: true });
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load lead");
    });
    loadIntelligence();
    api.markLeadRead(tenantId, leadId).catch(() => {
      // Best-effort — an unread badge staying on somewhere else isn't worth
      // surfacing an error banner over.
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, leadId]);

  async function handleStageChange(stage: PipelineStage) {
    if (!tenantId || !leadId) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateLead(tenantId, leadId, { pipelineStage: stage });
      setLead(updated);
      await loadAll();
      setTimelineRefreshToken((t) => t + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update stage");
    } finally {
      setBusy(false);
    }
  }

  async function handleOwnerChange(ownerUserId: string) {
    if (!tenantId || !leadId) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateLead(tenantId, leadId, { ownerUserId: ownerUserId || null });
      setLead(updated);
      await loadAll();
      setTimelineRefreshToken((t) => t + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign owner");
    } finally {
      setBusy(false);
    }
  }

  async function handleHandoff(action: "request" | "takeover" | "release") {
    if (!tenantId || !leadId) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.handoffAction(tenantId, leadId, action);
      setLead(updated);
      await loadAll();
      setTimelineRefreshToken((t) => t + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update handoff status");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddNote() {
    if (!tenantId || !leadId || !noteBody.trim()) return;
    setSavingNote(true);
    setError(null);
    try {
      await api.addLeadNote(tenantId, leadId, noteBody.trim());
      setNoteBody("");
      setNotes(await api.listLeadNotes(tenantId, leadId));
      setTimelineRefreshToken((t) => t + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add note");
    } finally {
      setSavingNote(false);
    }
  }

  async function handleAddTag() {
    if (!tenantId || !leadId || !tagName.trim()) return;
    setSavingTag(true);
    setError(null);
    try {
      await api.addLeadTag(tenantId, leadId, tagName.trim());
      setTagName("");
      setTags(await api.listLeadTags(tenantId, leadId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add tag");
    } finally {
      setSavingTag(false);
    }
  }

  async function handleRemoveTag(tagId: string) {
    if (!tenantId || !leadId) return;
    try {
      await api.removeLeadTag(tenantId, leadId, tagId);
      setTags(await api.listLeadTags(tenantId, leadId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove tag");
    }
  }

  async function handleCreateDeal() {
    if (!tenantId || !leadId) return;
    setSavingDeal(true);
    setError(null);
    try {
      const value = dealValue.trim() ? Number(dealValue.trim()) : null;
      await api.createLeadDeal(tenantId, leadId, value);
      setDealValue("");
      setDeals(await api.listLeadDeals(tenantId, leadId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create deal");
    } finally {
      setSavingDeal(false);
    }
  }

  async function handleDealStage(dealId: string, stage: Deal["stage"]) {
    if (!tenantId) return;
    try {
      await api.updateDealStage(tenantId, dealId, stage);
      setDeals(await api.listLeadDeals(tenantId, leadId!));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update deal");
    }
  }

  if (!tenantId || !leadId) return null;

  const fieldLabel = (key: string) => fieldDefinitions?.find((f) => f.fieldKey === key)?.label ?? key;

  const TABS: { value: typeof activeTab; label: string }[] = [
    { value: "overview", label: "Overview" },
    { value: "conversation", label: "Conversation" },
    { value: "activities", label: "Activities" },
    { value: "notes", label: "Notes" },
  ];

  return (
    <div className="page">
      <h1>
        {lead?.username ?? "Lead"}
        {lead && (
          <span className={handoffLabel(lead.handoffStatus).className}>{handoffLabel(lead.handoffStatus).text}</span>
        )}
      </h1>

      {error && <div className="banner banner-error">{error}</div>}

      {!lead ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <div className="button-row">
            {TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                className={activeTab === t.value ? "btn-primary btn-small" : "btn-secondary btn-small"}
                onClick={() => setActiveTab(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {activeTab === "overview" && (
            <>
          <section className="card">
            <h2>Overview</h2>
            <div className="field-group">
              <label>
                Pipeline stage
                <select value={lead.pipelineStage} disabled={busy} onChange={(e) => handleStageChange(e.target.value as PipelineStage)}>
                  {PIPELINE_STAGES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Owner
                <select value={lead.ownerUserId ?? ""} disabled={busy} onChange={(e) => handleOwnerChange(e.target.value)}>
                  <option value="">Unassigned</option>
                  {(members ?? []).map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.email}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="button-row">
              {lead.handoffStatus !== "human" && (
                <button className="btn-secondary btn-small" disabled={busy} onClick={() => handleHandoff("takeover")}>
                  Take over conversation
                </button>
              )}
              {lead.handoffStatus === "human" && (
                <button className="btn-secondary btn-small" disabled={busy} onClick={() => handleHandoff("release")}>
                  Return to AI
                </button>
              )}
              {lead.handoffStatus === "ai" && (
                <button className="btn-secondary btn-small" disabled={busy} onClick={() => handleHandoff("request")}>
                  Escalate for attention
                </button>
              )}
            </div>

            <div>
              {(tags ?? []).map((t) => (
                <span className="tag-chip" key={t.tagId}>
                  {t.name}
                  <button onClick={() => handleRemoveTag(t.tagId)} aria-label={`Remove tag ${t.name}`}>
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="inline-form">
              <input
                type="text"
                placeholder="Add a tag…"
                value={tagName}
                onChange={(e) => setTagName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
              />
              <button className="btn-secondary btn-small" disabled={savingTag || !tagName.trim()} onClick={handleAddTag}>
                Add
              </button>
            </div>
          </section>

          <section className="card">
            <h2>Captured Facts</h2>
            {capturedFacts === null ? (
              <p className="muted">Loading…</p>
            ) : Object.keys(capturedFacts).length === 0 ? (
              <p className="muted">Nothing captured yet — the AI hasn't learned any details about this lead so far.</p>
            ) : (
              <dl className="kv">
                {Object.entries(capturedFacts).map(([key, value]) => (
                  <Fragment key={key}>
                    <dt>{fieldLabel(key)}</dt>
                    <dd>{value}</dd>
                  </Fragment>
                ))}
              </dl>
            )}
          </section>

          <section className="card">
            <div className="button-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0 }}>Lead Intelligence</h2>
              <button className="btn-secondary btn-small" disabled={recalculating} onClick={handleRecalculateIntelligence}>
                {recalculating ? "Recalculating…" : "Recalculate"}
              </button>
            </div>

            {intelligenceError && <div className="banner banner-error">{intelligenceError}</div>}

            {intelligence === undefined ? (
              <p className="muted">Loading…</p>
            ) : intelligence === null ? (
              <p className="muted">No intelligence yet — the AI hasn't learned enough about this lead to score it.</p>
            ) : (
              <>
                <div className="field-group">
                  <div>
                    <div className="muted" style={{ fontSize: "0.85rem" }}>
                      Lead Score
                    </div>
                    <div style={{ fontSize: "1.8rem", fontWeight: 600 }}>
                      {intelligence.score}
                      <span className={scoreBandLabel(intelligence.scoreBand).className}>{scoreBandLabel(intelligence.scoreBand).text}</span>
                    </div>
                  </div>
                </div>

                <dl className="kv">
                  <dt>Intent</dt>
                  <dd>{intelligence.intent ? formatIntentLabel(intelligence.intent) : "—"}</dd>
                  <dt>Need</dt>
                  <dd>{intelligence.need ?? "—"}</dd>
                  <dt>Budget</dt>
                  <dd>{intelligence.budgetValue !== null ? formatBudgetValue(intelligence.budgetValue) : (intelligence.budgetText ?? "—")}</dd>
                  <dt>Location</dt>
                  <dd>{intelligence.location ?? "—"}</dd>
                </dl>

                {intelligence.scoreReasons.length > 0 && (
                  <>
                    <div className="muted" style={{ fontSize: "0.85rem", marginTop: "0.75rem" }}>
                      Score Reasons
                    </div>
                    <ul className="list">
                      {intelligence.scoreReasons.map((reason, i) => (
                        <li className="list-item" key={i} style={{ display: "block" }}>
                          {reason}
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {intelligenceHistory !== null && intelligenceHistory.length > 1 && (
                  <>
                    <div className="muted" style={{ fontSize: "0.85rem", marginTop: "0.75rem" }}>
                      History
                    </div>
                    <ul className="list">
                      {intelligenceHistory.slice(0, 10).map((entry) => (
                        <li className="list-item" key={entry.id} style={{ display: "block" }}>
                          <div>
                            {entry.score} · {scoreBandLabel(entry.scoreBand).text}
                            {entry.intent && <span className="muted"> — Intent: {formatIntentLabel(entry.intent)}</span>}
                          </div>
                          <div className="timeline-meta">{formatDate(entry.createdAt)}</div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </section>

          <section className="card">
            <h2>Deals</h2>
            {deals === null ? (
              <p className="muted">Loading…</p>
            ) : deals.length === 0 ? (
              <p className="muted">No deals yet.</p>
            ) : (
              <ul className="list">
                {deals.map((d) => (
                  <li className="list-item" key={d.id}>
                    <span>
                      {d.value !== null ? `${d.currency} ${d.value}` : "No value set"}
                      <span className={d.stage === "won" ? "pill pill-ok" : d.stage === "lost" ? "pill pill-error" : "pill"}>
                        {d.stage}
                      </span>
                    </span>
                    {d.stage === "open" && (
                      <span className="button-row" style={{ marginBottom: 0 }}>
                        <button className="btn-secondary btn-small" onClick={() => handleDealStage(d.id, "won")}>
                          Mark won
                        </button>
                        <button className="btn-secondary btn-small" onClick={() => handleDealStage(d.id, "lost")}>
                          Mark lost
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="inline-form">
              <input
                type="text"
                placeholder="Deal value (optional)"
                value={dealValue}
                onChange={(e) => setDealValue(e.target.value)}
              />
              <button className="btn-secondary btn-small" disabled={savingDeal} onClick={handleCreateDeal}>
                Add deal
              </button>
            </div>
          </section>
            </>
          )}

          {activeTab === "conversation" && (
            <section className="card">
              <h2>Conversation</h2>
              <ThreadPanel
                tenantId={tenantId}
                leadId={leadId}
                refreshToken={timelineRefreshToken}
                kindFilter={["event", "reply"]}
                onError={setError}
              />
            </section>
          )}

          {activeTab === "activities" && (
            <section className="card">
              <h2>Activities</h2>
              <ThreadPanel
                tenantId={tenantId}
                leadId={leadId}
                refreshToken={timelineRefreshToken}
                kindFilter={["activity"]}
                onError={setError}
              />
            </section>
          )}

          {activeTab === "notes" && (
            <section className="card">
              <h2>Notes</h2>
              {notes === null ? (
                <p className="muted">Loading…</p>
              ) : notes.length === 0 ? (
                <p className="muted">No notes yet.</p>
              ) : (
                <ul className="list">
                  {notes.map((n) => (
                    <li className="list-item" key={n.id} style={{ display: "block" }}>
                      <div>{n.body}</div>
                      <div className="timeline-meta">{formatDate(n.createdAt)}</div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="inline-form">
                <textarea
                  placeholder="Add an internal note…"
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  rows={2}
                />
                <button className="btn-secondary btn-small" disabled={savingNote || !noteBody.trim()} onClick={handleAddNote}>
                  Add note
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
