import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ApiError,
  api,
  type HandoffStatus,
  type LeadListItem,
  type LeadTag,
  type PipelineStage,
  type TenantMember,
  type TimelineEntry,
} from "../api";
import { ThreadPanel } from "../components/ThreadPanel";
import { PIPELINE_STAGES, formatRelativeTime, handoffLabel } from "../lib/leadFormatting";

type Tab = "all" | "unread" | "ai" | "qualified" | "attention";

const TABS: { value: Tab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "ai", label: "AI Handling" },
  { value: "qualified", label: "Qualified" },
  { value: "attention", label: "Needs Attention" },
];

/** Every 15s while the Inbox is open, refetch the conversation list only (counts/badges/new inbound messages) — the first polling in this codebase; deliberately simple (no push/websocket infra) rather than left permanently stale. */
const POLL_INTERVAL_MS = 15000;

export function InboxPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();

  const [leads, setLeads] = useState<LeadListItem[] | null>(null);
  const [members, setMembers] = useState<TenantMember[] | null>(null);
  const [tags, setTags] = useState<LeadTag[] | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [threadRefreshToken, setThreadRefreshToken] = useState(0);
  const [pendingEntries, setPendingEntries] = useState<TimelineEntry[]>([]);
  const [composeText, setComposeText] = useState("");
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedLead = leads?.find((l) => l.id === selectedLeadId) ?? null;

  async function reloadLeads() {
    if (!tenantId) return;
    try {
      const filters =
        tab === "unread"
          ? { unreadOnly: true }
          : tab === "ai"
            ? { handoffStatus: "ai" as HandoffStatus }
            : tab === "qualified"
              ? { stage: "qualified" as PipelineStage }
              : tab === "attention"
                ? { handoffStatus: "requested" as HandoffStatus }
                : {};
      const l = await api.getLeads(tenantId, { ...filters, q: search.trim() || undefined });
      setLeads(l);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        navigate("/login", { replace: true });
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load conversations");
    }
  }

  useEffect(() => {
    reloadLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, tab, search]);

  const reloadLeadsRef = useRef(reloadLeads);
  reloadLeadsRef.current = reloadLeads;
  useEffect(() => {
    const interval = setInterval(() => reloadLeadsRef.current(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    api.listMembers(tenantId).then(setMembers).catch(() => {
      // Non-critical — the owner dropdown just stays empty.
    });
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId || !selectedLeadId) {
      setTags(null);
      return;
    }
    setTags(null);
    api
      .listLeadTags(tenantId, selectedLeadId)
      .then(setTags)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load tags"));
  }, [tenantId, selectedLeadId]);

  function handleSelectLead(lead: LeadListItem) {
    if (!tenantId) return;
    setSelectedLeadId(lead.id);
    setComposeText("");
    setPendingEntries([]);
    setError(null);
    if (lead.unread) {
      setLeads((prev) => prev?.map((l) => (l.id === lead.id ? { ...l, unread: false } : l)) ?? prev);
      api.markLeadRead(tenantId, lead.id).catch(() => {
        // Best-effort.
      });
    }
  }

  function patchSelectedLead(updates: Partial<LeadListItem>) {
    setLeads((prev) => prev?.map((l) => (l.id === selectedLeadId ? { ...l, ...updates } : l)) ?? prev);
  }

  async function handleStageChange(stage: PipelineStage) {
    if (!tenantId || !selectedLeadId) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateLead(tenantId, selectedLeadId, { pipelineStage: stage });
      patchSelectedLead(updated);
      setThreadRefreshToken((t) => t + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update stage");
    } finally {
      setBusy(false);
    }
  }

  async function handleOwnerChange(ownerUserId: string) {
    if (!tenantId || !selectedLeadId) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateLead(tenantId, selectedLeadId, { ownerUserId: ownerUserId || null });
      patchSelectedLead(updated);
      setThreadRefreshToken((t) => t + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign owner");
    } finally {
      setBusy(false);
    }
  }

  async function handleHandoff(action: "request" | "takeover" | "release") {
    if (!tenantId || !selectedLeadId) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.handoffAction(tenantId, selectedLeadId, action);
      patchSelectedLead(updated);
      setThreadRefreshToken((t) => t + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update handoff status");
    } finally {
      setBusy(false);
    }
  }

  async function handleSend() {
    if (!tenantId || !selectedLeadId || !composeText.trim() || sending) return;
    const text = composeText.trim();
    const optimistic: TimelineEntry = { kind: "reply", occurredAt: new Date().toISOString(), channel: "dm", engine: "human", text };
    setPendingEntries((prev) => [...prev, optimistic]);
    setComposeText("");
    setSending(true);
    setError(null);
    try {
      await api.sendLeadReply(tenantId, selectedLeadId, text);
      setPendingEntries([]);
      setThreadRefreshToken((t) => t + 1);
    } catch (err) {
      setPendingEntries((prev) => prev.filter((e) => e !== optimistic));
      setComposeText(text);
      setError(err instanceof Error ? err.message : "Failed to send — try again");
    } finally {
      setSending(false);
    }
  }

  if (!tenantId) return null;

  return (
    <div className="page" style={{ maxWidth: "none" }}>
      <h1>Inbox</h1>
      {error && <div className="banner banner-error">{error}</div>}

      <div className="flex flex-col gap-4 md:h-[75vh] md:flex-row md:gap-0 md:overflow-hidden md:rounded-xl md:border md:border-line">
        {/* Conversation list */}
        <div className={`md:w-80 md:shrink-0 md:overflow-y-auto md:border-r md:border-line ${selectedLeadId ? "hidden md:block" : "block"}`}>
          <div className="flex flex-wrap gap-1 border-b border-line p-3">
            {TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                className={tab === t.value ? "btn-primary btn-small" : "btn-secondary btn-small"}
                onClick={() => setTab(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="p-3 pt-0">
            <input type="text" placeholder="Search by username…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          {leads === null ? (
            <p className="muted p-3">Loading…</p>
          ) : leads.length === 0 ? (
            <p className="muted p-3">No conversations match this view.</p>
          ) : (
            <ul className="list" style={{ margin: 0 }}>
              {leads.map((lead) => (
                <li key={lead.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <button
                    type="button"
                    onClick={() => handleSelectLead(lead)}
                    className="list-item-button"
                    style={{ display: "block", width: "100%", padding: "0.75rem 1rem" }}
                  >
                    <div className="flex items-center gap-2">
                      {lead.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden="true" />}
                      <strong className="truncate">{lead.username ?? "(unknown)"}</strong>
                      <span className="text-subtle ml-auto shrink-0 text-xs">{formatRelativeTime(lead.lastInboundAt)}</span>
                    </div>
                    <div className="muted small truncate">{lead.lastMessagePreview ?? "No messages yet"}</div>
                    <span className={handoffLabel(lead.handoffStatus).className} style={{ marginLeft: 0 }}>
                      {handoffLabel(lead.handoffStatus).text}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Thread + compose */}
        <div className={`flex-1 md:flex md:flex-col md:overflow-y-auto md:border-r md:border-line ${selectedLeadId ? "block" : "hidden md:flex"}`}>
          {!selectedLead ? (
            <p className="muted p-4">Select a conversation to view it here.</p>
          ) : (
            <div className="flex h-full flex-col">
              <div className="flex items-center gap-2 border-b border-line p-3 md:hidden">
                <button type="button" className="link-button" onClick={() => setSelectedLeadId(null)}>
                  ← Conversations
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                <ThreadPanel
                  tenantId={tenantId}
                  leadId={selectedLead.id}
                  refreshToken={threadRefreshToken}
                  pendingEntries={pendingEntries}
                  onError={setError}
                />
              </div>
              <div className="border-t border-line p-3">
                {selectedLead.handoffStatus !== "human" ? (
                  <button className="btn-primary" disabled={busy} onClick={() => handleHandoff("takeover")}>
                    Take over to reply
                  </button>
                ) : (
                  <div className="inline-form" style={{ marginBottom: 0 }}>
                    <textarea
                      rows={2}
                      placeholder="Type a message…"
                      value={composeText}
                      onChange={(e) => setComposeText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      disabled={sending}
                    />
                    <button className="btn-primary btn-small" disabled={sending || !composeText.trim()} onClick={handleSend}>
                      {sending ? "Sending…" : "Send"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Compact lead panel */}
        <div className={`md:w-72 md:shrink-0 md:overflow-y-auto ${selectedLeadId ? "block" : "hidden md:block"}`}>
          {selectedLead && (
            <div className="p-3">
              <h3>Lead</h3>
              <div className="field-group">
                <label>
                  Pipeline stage
                  <select
                    value={selectedLead.pipelineStage}
                    disabled={busy}
                    onChange={(e) => handleStageChange(e.target.value as PipelineStage)}
                  >
                    {PIPELINE_STAGES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Owner
                  <select value={selectedLead.ownerUserId ?? ""} disabled={busy} onChange={(e) => handleOwnerChange(e.target.value)}>
                    <option value="">Unassigned</option>
                    {(members ?? []).map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.email}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {selectedLead.handoffStatus === "human" && (
                <button className="btn-secondary btn-small" disabled={busy} onClick={() => handleHandoff("release")}>
                  Return to AI
                </button>
              )}
              {selectedLead.handoffStatus === "ai" && (
                <button className="btn-secondary btn-small" disabled={busy} onClick={() => handleHandoff("request")}>
                  Escalate for attention
                </button>
              )}

              <div style={{ marginTop: "1rem" }}>
                {tags === null ? (
                  <p className="muted small">Loading tags…</p>
                ) : tags.length === 0 ? (
                  <p className="muted small">No tags.</p>
                ) : (
                  tags.map((t) => (
                    <span className="tag-chip" key={t.tagId}>
                      {t.name}
                    </span>
                  ))
                )}
              </div>

              <p style={{ marginTop: "1rem" }}>
                <Link to={`/dashboard/${tenantId}/leads/${selectedLead.id}`}>Open full profile →</Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
