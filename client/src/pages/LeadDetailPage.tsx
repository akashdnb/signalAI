import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ApiError,
  api,
  type Deal,
  type HandoffStatus,
  type LeadDetail,
  type LeadNote,
  type LeadTag,
  type PipelineStage,
  type TenantMember,
  type TimelineEntry,
} from "../api";

const PIPELINE_STAGES: { value: PipelineStage; label: string }[] = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "meeting_scheduled", label: "Meeting Scheduled" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function handoffLabel(status: HandoffStatus): { text: string; className: string } {
  if (status === "human") return { text: "Human is replying", className: "pill pill-ok" };
  if (status === "requested") return { text: "Escalated — needs attention", className: "pill pill-error" };
  return { text: "AI is replying", className: "pill" };
}

export function LeadDetailPage() {
  const { tenantId, leadId } = useParams<{ tenantId: string; leadId: string }>();
  const navigate = useNavigate();

  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[] | null>(null);
  const [timelineHasMore, setTimelineHasMore] = useState(false);
  const [timelineCursor, setTimelineCursor] = useState<string | null>(null);
  const [loadingMoreTimeline, setLoadingMoreTimeline] = useState(false);
  const [notes, setNotes] = useState<LeadNote[] | null>(null);
  const [tags, setTags] = useState<LeadTag[] | null>(null);
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [members, setMembers] = useState<TenantMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [noteBody, setNoteBody] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [tagName, setTagName] = useState("");
  const [savingTag, setSavingTag] = useState(false);
  const [dealValue, setDealValue] = useState("");
  const [savingDeal, setSavingDeal] = useState(false);
  const [busy, setBusy] = useState(false);

  async function loadAll() {
    if (!tenantId || !leadId) return;
    const [l, t, n, tg, d, m] = await Promise.all([
      api.getLead(tenantId, leadId),
      api.getLeadTimeline(tenantId, leadId),
      api.listLeadNotes(tenantId, leadId),
      api.listLeadTags(tenantId, leadId),
      api.listLeadDeals(tenantId, leadId),
      api.listMembers(tenantId),
    ]);
    setLead(l);
    setTimeline(t.entries);
    setTimelineHasMore(t.hasMore);
    setTimelineCursor(t.nextCursor);
    setNotes(n);
    setTags(tg);
    setDeals(d);
    setMembers(m);
  }

  async function handleLoadOlderTimeline() {
    if (!tenantId || !leadId || !timelineCursor) return;
    setLoadingMoreTimeline(true);
    setError(null);
    try {
      const page = await api.getLeadTimeline(tenantId, leadId, { before: timelineCursor });
      setTimeline((prev) => [...page.entries, ...(prev ?? [])]);
      setTimelineHasMore(page.hasMore);
      setTimelineCursor(page.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load older messages");
    } finally {
      setLoadingMoreTimeline(false);
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
      const page = await api.getLeadTimeline(tenantId, leadId);
      setTimeline(page.entries);
      setTimelineHasMore(page.hasMore);
      setTimelineCursor(page.nextCursor);
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

          <section className="card">
            <h2>Timeline</h2>
            {timeline === null ? (
              <p className="muted">Loading…</p>
            ) : timeline.length === 0 ? (
              <p className="muted">Nothing has happened on this lead yet.</p>
            ) : (
              <div>
                {timelineHasMore && (
                  <button className="btn-secondary btn-small" disabled={loadingMoreTimeline} onClick={handleLoadOlderTimeline}>
                    {loadingMoreTimeline ? "Loading…" : "Load older messages"}
                  </button>
                )}
                {timeline.map((entry, i) => (
                  <div className="timeline-entry" key={i}>
                    {entry.kind === "event" ? (
                      <>
                        <strong>{entry.eventType === "comment" ? "Comment" : "DM"}</strong>
                        {entry.matchedKeyword && <span className="pill pill-ok">{entry.matchedKeyword}</span>}
                        <div>{entry.text ?? "—"}</div>
                      </>
                    ) : entry.kind === "reply" ? (
                      <>
                        <strong>
                          {entry.engine === "human" ? "Team reply" : "Bot reply"} ({entry.channel === "comment" ? "comment" : "DM"})
                        </strong>
                        <span className="pill">
                          {entry.engine === "human" ? "Sent by a teammate" : entry.engine === "ai_generated" ? "AI-generated" : "Rule-based"}
                        </span>
                        <div>{entry.text}</div>
                      </>
                    ) : (
                      <div>{entry.summary}</div>
                    )}
                    <div className="timeline-meta">{formatDate(entry.occurredAt)}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
