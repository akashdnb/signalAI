import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, api, type TenantMember } from "../api";
import { UserPlusIcon } from "../components/icons";

/**
 * There's no invite/remove/role backend yet (`GET /members` is read-only —
 * see leads.ts — and `TenantMember.role` is a literal "owner"), so this
 * deliberately doesn't pretend otherwise: "Invite teammate" reveals an
 * inline "not yet" note on submit rather than silently doing nothing, the
 * same pattern LoginPage's SSO buttons use for Google/Meta.
 */
export function TeamPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();

  const [members, setMembers] = useState<TenantMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [inviting, setInviting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteUnavailable, setInviteUnavailable] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    api
      .listMembers(tenantId)
      .then((m) => {
        if (!cancelled) {
          setMembers(m);
          setError(null);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          navigate("/login", { replace: true });
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load team");
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, navigate, reloadCount]);

  if (!tenantId) return null;

  function handleInviteSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviteUnavailable(true);
  }

  return (
    <div className="page page-wide">
      <h1>Team</h1>
      <p className="muted">Everyone with access to this workspace.</p>

      {error && (
        <div className="banner banner-error flex flex-wrap items-center justify-between gap-3" role="alert">
          <span>{error}</span>
          {members === null && (
            <button type="button" className="link-button" onClick={() => setReloadCount((count) => count + 1)}>
              Retry
            </button>
          )}
        </div>
      )}

      <section className="card">
        <div className="flex items-center justify-between gap-3">
          <h2 style={{ marginBottom: 0 }}>Members</h2>
          <button
            type="button"
            className="btn-secondary btn-small"
            onClick={() => {
              setInviting((v) => !v);
              setInviteUnavailable(false);
              setInviteEmail("");
            }}
          >
            <span className="inline-flex items-center gap-1.5">
              <UserPlusIcon className="h-4 w-4" />
              {inviting ? "Cancel" : "Invite teammate"}
            </span>
          </button>
        </div>

        {inviting && (
          <form onSubmit={handleInviteSubmit} className="inline-form mt-4">
            <input
              type="email"
              aria-label="Teammate email address"
              placeholder="teammate@company.com"
              value={inviteEmail}
              onChange={(e) => {
                setInviteEmail(e.target.value);
                setInviteUnavailable(false);
              }}
            />
            <button type="submit" className="btn-primary btn-small" disabled={!inviteEmail.trim()}>
              Send invite
            </button>
          </form>
        )}
        {inviteUnavailable && (
          <p className="muted small" role="status" style={{ marginTop: "-0.5rem" }}>
            Team invites aren't available yet — reach out to support to add a teammate to this workspace.
          </p>
        )}

        {members === null ? (
          <p className="muted" role="status">{error ? "Team members could not be loaded." : "Loading team…"}</p>
        ) : (
          <ul className="list" style={{ marginTop: inviting ? "1.25rem" : 0 }}>
            {members.map((m) => (
              <li key={m.userId} className="list-item">
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chip text-sm font-semibold text-accent">
                    {m.email.charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate text-sm font-medium text-ink">{m.email}</span>
                </span>
                <span className="pill pill-ok" style={{ marginLeft: 0 }}>
                  {m.role === "owner" ? "Owner" : m.role}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
