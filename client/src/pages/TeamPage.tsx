import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { UserPlusIcon } from "../components/icons";
import { workspaceApi, type WorkspaceInvitation, type WorkspaceMember } from "../api/workspace";

function formatRole(role: WorkspaceMember["role"]): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function TeamPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [members, setMembers] = useState<WorkspaceMember[] | null>(null);
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!tenantId) return;
    try {
      const [nextMembers, nextInvitations] = await Promise.all([
        workspaceApi.listMembers(tenantId),
        workspaceApi.listInvitations(tenantId),
      ]);
      setMembers(nextMembers);
      setInvitations(nextInvitations ?? []);
      setError(null);
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      if (status === 401 || status === 403) {
        navigate("/login", { replace: true });
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load team");
    }
  }

  useEffect(() => {
    void load();
  }, [tenantId]);

  async function handleInvite(event: React.FormEvent) {
    event.preventDefault();
    if (!tenantId || !inviteEmail.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const result = await workspaceApi.inviteMember(tenantId, inviteEmail.trim(), inviteRole);
      setInviting(false);
      setInviteEmail("");
      setInviteRole("member");
      if (result.delivery === "failed") {
        setError("Invitation was created, but the email could not be delivered. You can resend it later.");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send invitation");
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke(invitationId: string) {
    if (!tenantId) return;
    try {
      await workspaceApi.revokeInvitation(tenantId, invitationId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke invitation");
    }
  }

  if (!tenantId) return null;

  return (
    <div className="page page-wide">
      <h1>Team</h1>
      <p className="muted">Everyone with access to this workspace.</p>

      {error && <div className="banner banner-error" role="alert">{error}</div>}

      <section className="card">
        <div className="flex items-center justify-between gap-3">
          <h2 style={{ marginBottom: 0 }}>Members</h2>
          <button
            type="button"
            className="btn-secondary btn-small"
            onClick={() => setInviting((value) => !value)}
          >
            <span className="inline-flex items-center gap-1.5">
              <UserPlusIcon className="h-4 w-4" />
              {inviting ? "Cancel" : "Invite teammate"}
            </span>
          </button>
        </div>

        {inviting && (
          <form onSubmit={handleInvite} className="inline-form mt-4">
            <input
              type="email"
              aria-label="Teammate email address"
              placeholder="teammate@company.com"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
            />
            <select aria-label="Teammate role" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as "admin" | "member")}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <button type="submit" className="btn-primary btn-small" disabled={!inviteEmail.trim() || saving}>
              {saving ? "Sending…" : "Send invite"}
            </button>
          </form>
        )}

        {members === null ? (
          <p className="muted">Loading team…</p>
        ) : members.length === 0 ? (
          <p className="muted">No members found.</p>
        ) : (
          <ul className="list" style={{ marginTop: inviting ? "1.25rem" : 0 }}>
            {members.map((member) => (
              <li key={member.userId} className="list-item">
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chip text-sm font-semibold text-accent">
                    {member.email.charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate text-sm font-medium text-ink">{member.email}</span>
                </span>
                <span className="pill pill-ok" style={{ marginLeft: 0 }}>{formatRole(member.role)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {invitations.length > 0 && (
        <section className="card">
          <h2>Pending invitations</h2>
          <ul className="list">
            {invitations.filter((invitation) => !invitation.acceptedAt && !invitation.revokedAt).map((invitation) => (
              <li key={invitation.id} className="list-item">
                <span className="min-w-0 flex-1">
                  <strong>{invitation.email}</strong>
                  <span className="muted small" style={{ marginLeft: 8 }}>{formatRole(invitation.role)}</span>
                </span>
                <button type="button" className="btn-secondary btn-small" onClick={() => void handleRevoke(invitation.id)}>
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
