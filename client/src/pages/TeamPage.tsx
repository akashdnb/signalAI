import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { UserPlusIcon } from "../components/icons";
import { workspaceApi, type WorkspaceInvitation, type WorkspaceMember } from "../api/workspace";

function formatRole(role: WorkspaceMember["role"]): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function isPendingInvitation(invitation: WorkspaceInvitation): boolean {
  return (
    !invitation.acceptedAt &&
    !invitation.revokedAt &&
    new Date(invitation.expiresAt).getTime() > Date.now()
  );
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
  const [actionKey, setActionKey] = useState<string | null>(null);

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
        setError("Invitation was created, but the email could not be delivered. You can resend it after fixing delivery.");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send invitation");
    } finally {
      setSaving(false);
    }
  }

  async function handleInvitationAction(invitationId: string, action: "resend" | "revoke") {
    if (!tenantId) return;
    setActionKey(`${action}:${invitationId}`);
    setError(null);
    try {
      if (action === "resend") {
        const result = await workspaceApi.resendInvitation(tenantId, invitationId);
        if (result.delivery === "failed") {
          setError("Invitation was regenerated, but the email could not be delivered.");
        }
      } else {
        await workspaceApi.revokeInvitation(tenantId, invitationId);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} invitation`);
    } finally {
      setActionKey(null);
    }
  }

  async function handleRoleChange(member: WorkspaceMember, role: "admin" | "member") {
    if (!tenantId || member.role === role) return;
    setActionKey(`role:${member.userId}`);
    setError(null);
    try {
      await workspaceApi.updateMemberRole(tenantId, member.userId, role);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change member role");
    } finally {
      setActionKey(null);
    }
  }

  async function handleRemove(member: WorkspaceMember) {
    if (!tenantId || !window.confirm(`Remove ${member.email} from this workspace?`)) return;
    setActionKey(`remove:${member.userId}`);
    setError(null);
    try {
      await workspaceApi.removeMember(tenantId, member.userId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove member");
    } finally {
      setActionKey(null);
    }
  }

  if (!tenantId) return null;

  const pendingInvitations = invitations.filter(isPendingInvitation);

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
            {members.map((member) => {
              const busy = actionKey?.endsWith(member.userId) ?? false;
              const isOwner = member.role === "owner";
              return (
                <li key={member.userId} className="list-item">
                  <span className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chip text-sm font-semibold text-accent">
                      {member.email.charAt(0).toUpperCase()}
                    </span>
                    <span className="truncate text-sm font-medium text-ink">{member.email}</span>
                  </span>
                  {isOwner ? (
                    <span className="pill pill-ok" style={{ marginLeft: 0 }}>Owner</span>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <select
                        aria-label={`Role for ${member.email}`}
                        value={member.role}
                        disabled={busy}
                        onChange={(event) => void handleRoleChange(member, event.target.value as "admin" | "member")}
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button
                        type="button"
                        className="btn-secondary btn-small"
                        disabled={busy}
                        onClick={() => void handleRemove(member)}
                      >
                        {busy ? "Saving…" : "Remove"}
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {pendingInvitations.length > 0 && (
        <section className="card">
          <h2>Pending invitations</h2>
          <ul className="list">
            {pendingInvitations.map((invitation) => {
              const resendBusy = actionKey === `resend:${invitation.id}`;
              const revokeBusy = actionKey === `revoke:${invitation.id}`;
              return (
                <li key={invitation.id} className="list-item">
                  <span className="min-w-0 flex-1">
                    <strong>{invitation.email}</strong>
                    <span className="muted small" style={{ marginLeft: 8 }}>{formatRole(invitation.role)}</span>
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <button
                      type="button"
                      className="btn-secondary btn-small"
                      disabled={resendBusy || revokeBusy}
                      onClick={() => void handleInvitationAction(invitation.id, "resend")}
                    >
                      {resendBusy ? "Sending…" : "Resend"}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary btn-small"
                      disabled={resendBusy || revokeBusy}
                      onClick={() => void handleInvitationAction(invitation.id, "revoke")}
                    >
                      {revokeBusy ? "Cancelling…" : "Cancel"}
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
