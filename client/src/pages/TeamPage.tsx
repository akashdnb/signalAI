import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { UserPlusIcon } from "../components/icons";
import { PageHeader, StatusBadge } from "../components/ui";
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

function invitationState(invitation: WorkspaceInvitation): string {
  if (invitation.acceptedAt) return "Accepted";
  if (invitation.revokedAt) return "Cancelled";
  if (new Date(invitation.expiresAt).getTime() <= Date.now()) return "Expired";
  return "Pending";
}

function formatExpiry(iso: string): string {
  const expiry = new Date(iso);
  const days = Math.ceil((expiry.getTime() - Date.now()) / 86_400_000);
  if (days <= 1) return `Expires ${expiry.toLocaleString()}`;
  return `Expires in ${days} days`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

const ROLE_PERMISSIONS = [
  { capability: "View team members and connected accounts", owner: "Allowed", admin: "Allowed", member: "Allowed" },
  { capability: "Create, resend or cancel invitations", owner: "Full access", admin: "Full access", member: "No access" },
  { capability: "Change member roles or remove members", owner: "Full access", admin: "Full access", member: "No access" },
  { capability: "Edit workspace name and description", owner: "Full access", admin: "Full access", member: "No access" },
  { capability: "Disconnect connected accounts or bind them to journeys", owner: "Full access", admin: "Full access", member: "No access" },
] as const;

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
    if (action === "revoke" && !window.confirm("Cancel this invitation? The existing invitation link will stop working.")) return;
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
    if (!tenantId || !window.confirm(`Remove ${member.email} from this workspace? They will lose access to workspace data and automations.`)) return;
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
  const resolvedInvitations = invitations.filter((invitation) => !isPendingInvitation(invitation));

  return (
    <div className="page page-wide page-team">
      <PageHeader
        eyebrow="Workspace"
        title="Team & access"
        description="Manage who can access this workspace, what they can do, and outstanding invitations."
        actions={
          <button type="button" className="btn-primary btn-small" onClick={() => setInviting((value) => !value)}>
            <span className="inline-flex items-center gap-1.5">
              <UserPlusIcon className="h-4 w-4" />
              {inviting ? "Close invite form" : "Invite teammate"}
            </span>
          </button>
        }
      />

      {error && <div className="banner banner-error" role="alert">{error}</div>}

      <section className="card" aria-labelledby="team-members-title">
        <div className="mb-4 border-b border-line pb-4">
          <h2 id="team-members-title" className="mb-1">People with access</h2>
          <p className="muted small m-0">Owners manage billing and workspace access. Admins can manage members, connected accounts and automations. Members work with inbox, leads and automations.</p>
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
          <p className="muted" role="status">Loading team…</p>
        ) : members.length === 0 ? (
          <p className="muted">No members found. Invite a teammate to start collaborating.</p>
        ) : (
          <ul className="list" style={{ marginTop: inviting ? "1.25rem" : "1rem" }}>
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
                    <StatusBadge tone="success" dot>Owner</StatusBadge>
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
                      <button type="button" className="btn-secondary btn-small" disabled={busy} onClick={() => void handleRemove(member)}>
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
        <section className="card" aria-labelledby="pending-invitations-title">
          <h2 id="pending-invitations-title">Pending invitations</h2>
          <p className="muted small">Invitations are single-use and expire automatically. Resend to issue a fresh invitation link.</p>
          <ul className="list">
            {pendingInvitations.map((invitation) => {
              const resendBusy = actionKey === `resend:${invitation.id}`;
              const revokeBusy = actionKey === `revoke:${invitation.id}`;
              return (
                <li key={invitation.id} className="list-item">
                  <span className="min-w-0 flex-1">
                    <strong>{invitation.email}</strong>
                    <span className="muted small" style={{ marginLeft: 8 }}>{formatRole(invitation.role)}</span>
                    <span className="muted small block mt-1">{formatExpiry(invitation.expiresAt)}</span>
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <button type="button" className="btn-secondary btn-small" disabled={resendBusy || revokeBusy} onClick={() => void handleInvitationAction(invitation.id, "resend")}>
                      {resendBusy ? "Sending…" : "Resend"}
                    </button>
                    <button type="button" className="btn-secondary btn-small" disabled={resendBusy || revokeBusy} onClick={() => void handleInvitationAction(invitation.id, "revoke")}>
                      {revokeBusy ? "Cancelling…" : "Cancel"}
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="card" aria-labelledby="team-permissions-title">
        <div className="mb-4 border-b border-line pb-4">
          <h2 id="team-permissions-title" className="mb-1">Role permissions in the current API</h2>
          <p className="muted small m-0">These are the role-specific controls explicitly enforced by the current server.</p>
        </div>
        <div className="overflow-x-auto" role="region" aria-label="Role permissions table" tabIndex={0}>
          <table className="table team-permissions-table min-w-[620px]">
            <thead><tr><th scope="col">Capability</th><th scope="col">Owner</th><th scope="col">Admin</th><th scope="col">Member</th></tr></thead>
            <tbody>{ROLE_PERMISSIONS.map((row) => <tr key={row.capability}>
              <th scope="row">{row.capability}</th>
              <td>{row.owner}</td>
              <td>{row.admin}</td>
              <td><span className={row.member === "No access" ? "team-permission-limited" : ""}>{row.member}</span></td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className="team-permissions-note mt-3 mb-0" role="note"><strong>Important:</strong> several core routes, including automations, billing, knowledge, lead fields and AI guardrails, currently check workspace membership without consistently restricting actions by role. This table does not claim those routes are role-restricted.</p>
      </section>

      {resolvedInvitations.length > 0 && (
        <section className="card" aria-labelledby="invitation-history-title">
          <h2 id="invitation-history-title">Invitation history</h2>
          <p className="muted small">Resolved invitations stay visible so you can tell whether a teammate accepted, was cancelled, or let the invitation expire.</p>
          <ul className="list">
            {resolvedInvitations.map((invitation) => (
              <li key={invitation.id} className="list-item">
                <span className="min-w-0 flex-1">
                  <strong>{invitation.email}</strong>
                  <span className="muted small" style={{ marginLeft: 8 }}>{formatRole(invitation.role)}</span>
                  <span className="muted small block mt-1">Created {formatDate(invitation.createdAt)}</span>
                </span>
                <StatusBadge tone={invitationState(invitation) === "Accepted" ? "success" : invitationState(invitation) === "Expired" || invitationState(invitation) === "Cancelled" ? "neutral" : "warning"} dot>{invitationState(invitation)}</StatusBadge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
