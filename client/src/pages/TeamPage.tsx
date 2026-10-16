import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { UserPlusIcon } from "../components/icons";
import { Field, TextInput, TextareaInput } from "../components/ui";
import { useTenant } from "../context/TenantContext";
import { workspaceApi, type WorkspaceInvitation, type WorkspaceMember, type WorkspaceRole } from "../api/workspace";

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

export function TeamPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const { tenant, reload, reloadWorkspaces } = useTenant();
  const [members, setMembers] = useState<WorkspaceMember[] | null>(null);
  const [currentRole, setCurrentRole] = useState<WorkspaceRole | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [saving, setSaving] = useState(false);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceDescription, setWorkspaceDescription] = useState("");
  const [savingWorkspace, setSavingWorkspace] = useState(false);
  const [workspaceSaved, setWorkspaceSaved] = useState(false);

  useEffect(() => {
    setWorkspaceName(tenant?.name ?? "");
    setWorkspaceDescription(tenant?.description ?? "");
    setWorkspaceSaved(false);
  }, [tenant?.id, tenant?.name, tenant?.description]);

  async function load() {
    if (!tenantId) return;
    setMembers(null);
    setInvitations([]);
    setError(null);
    setPermissionError(null);
    try {
      const [nextMembers, workspaces] = await Promise.all([
        workspaceApi.listMembers(tenantId),
        workspaceApi.listWorkspaces(),
      ]);
      const workspace = workspaces.find((item) => item.tenantId === tenantId);
      if (!workspace) {
        setMembers(null);
        setCurrentRole(null);
        setError("This workspace is not available to your account.");
        return;
      }
      setMembers(nextMembers);
      setCurrentRole(workspace.role);
      setError(null);
      if (workspace.role === "owner" || workspace.role === "admin") {
        try {
          setInvitations(await workspaceApi.listInvitations(tenantId));
        } catch (err) {
          const status = (err as Error & { status?: number }).status;
          if (status === 403) {
            setPermissionError("Your current role can view teammates but cannot manage invitations.");
            setInvitations([]);
          } else {
            setError(err instanceof Error ? err.message : "Failed to load invitations");
          }
        }
      } else {
        setInvitations([]);
        setPermissionError("Your Member role is read-only for workspace access. Owners and admins can invite, remove, or change roles.");
      }
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      if (status === 401) {
        navigate("/login", { replace: true });
        return;
      }
      if (status === 403) {
        setMembers(null);
        setCurrentRole(null);
        setError("You do not have access to this workspace’s team.");
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load team");
    }
  }

  useEffect(() => {
    void load();
  }, [tenantId]);

  async function handleSaveWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenantId || (currentRole !== "owner" && currentRole !== "admin") || savingWorkspace) return;
    if (!workspaceName.trim()) {
      setError("Workspace name is required.");
      return;
    }
    setSavingWorkspace(true);
    setWorkspaceSaved(false);
    setError(null);
    try {
      await workspaceApi.updateWorkspace(tenantId, {
        name: workspaceName.trim(),
        description: workspaceDescription.trim() || null,
      });
      reload();
      reloadWorkspaces();
      setWorkspaceSaved(true);
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      setError(status === 403
        ? "Only workspace owners and admins can change workspace details."
        : err instanceof Error ? err.message : "Could not save workspace settings.");
    } finally {
      setSavingWorkspace(false);
    }
  }

  async function handleInvite(event: React.FormEvent) {
    event.preventDefault();
    if (!tenantId || !inviteEmail.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const result = await workspaceApi.inviteMember(tenantId, inviteEmail.trim(), inviteRole);
      setInviting(false);
      setNotice(null);
      setInviteEmail("");
      setInviteRole("member");
      setNotice(result.delivery === "failed"
        ? "Invitation was created, but email delivery failed. Check email delivery configuration before resending."
        : "Invitation sent.");
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
        setNotice(result.delivery === "failed"
          ? "A fresh invitation was created, but email delivery failed."
          : "A fresh invitation was sent.");
      } else {
        await workspaceApi.revokeInvitation(tenantId, invitationId);
        setNotice("Invitation cancelled.");
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
    <div className="page page-wide">
      <h1>Team</h1>
      <p className="muted">Everyone with access to this workspace.</p>

      {error && <div className="banner banner-error" role="alert">{error}<button type="button" className="link-button" onClick={() => void load()}>Retry</button></div>}
      {permissionError && <div className="banner" role="status">{permissionError}</div>}
      {notice && <div className="banner" role="status">{notice}</div>}

      <section className="card">
        <h2>Workspace settings</h2>
        <p className="muted small">These details identify this workspace in the switcher. Members and connected Instagram accounts stay scoped to this workspace.</p>
        <form onSubmit={(event) => void handleSaveWorkspace(event)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Workspace name">
            <TextInput
              value={workspaceName}
              onChange={(event) => { setWorkspaceName(event.target.value); setWorkspaceSaved(false); }}
              required
              maxLength={120}
              disabled={(currentRole !== "owner" && currentRole !== "admin") || savingWorkspace}
              placeholder="Workspace name"
            />
          </Field>
          <Field label="Description (optional)">
            <TextareaInput
              value={workspaceDescription}
              onChange={(event) => { setWorkspaceDescription(event.target.value); setWorkspaceSaved(false); }}
              maxLength={500}
              rows={2}
              disabled={(currentRole !== "owner" && currentRole !== "admin") || savingWorkspace}
              placeholder="What is this workspace for?"
            />
          </Field>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            {(currentRole === "owner" || currentRole === "admin") ? (
              <button
                type="submit"
                className="btn-primary btn-small"
                disabled={savingWorkspace || !workspaceName.trim() || (
                  workspaceName.trim() === (tenant?.name ?? "") &&
                  (workspaceDescription.trim() || "") === (tenant?.description ?? "")
                )}
              >
                {savingWorkspace ? "Saving…" : "Save workspace"}
              </button>
            ) : (
              <p className="muted small m-0">
                {currentRole === null
                  ? "Workspace permissions are still being checked. Editing is disabled until access is verified."
                  : "Only workspace owners and admins can change these details."}
              </p>
            )}
            {workspaceSaved && <span className="text-sm text-subtle" role="status">Workspace settings saved.</span>}
          </div>
        </form>
      </section>

      <section className="card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 style={{ marginBottom: 0 }}>Members</h2>
            <p className="muted small mt-1 mb-0">Owners manage workspace access and billing. Admins manage teammates and connected accounts. Members can view the team and work with inbox, leads and automations.</p>
          </div>
          <button
            type="button"
            className="btn-secondary btn-small"
            disabled={currentRole !== "owner" && currentRole !== "admin"}
            title={currentRole !== "owner" && currentRole !== "admin" ? "Only owners and admins can invite teammates" : undefined}
            onClick={() => setInviting((value) => !value)}
          >
            <span className="inline-flex items-center gap-1.5">
              <UserPlusIcon className="h-4 w-4" />
              {inviting ? "Cancel" : "Invite teammate"}
            </span>
          </button>
        </div>

        {inviting && (currentRole === "owner" || currentRole === "admin") && (
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
                    <span className="pill pill-ok" style={{ marginLeft: 0 }}>Owner</span>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <select
                        aria-label={`Role for ${member.email}`}
                        value={member.role}
                        disabled={busy || (currentRole !== "owner" && currentRole !== "admin")}
                        onChange={(event) => void handleRoleChange(member, event.target.value as "admin" | "member")}
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button
                        type="button"
                        className="btn-secondary btn-small"
                        disabled={busy || (currentRole !== "owner" && currentRole !== "admin")}
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

      {(currentRole === "owner" || currentRole === "admin") && pendingInvitations.length > 0 && (
        <section className="card">
          <h2>Pending invitations</h2>
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

      {(currentRole === "owner" || currentRole === "admin") && resolvedInvitations.length > 0 && (
        <section className="card">
          <h2>Invitation history</h2>
          <p className="muted small">Resolved invitations stay visible so you can tell whether a teammate accepted, was cancelled, or let the invitation expire.</p>
          <ul className="list">
            {resolvedInvitations.map((invitation) => (
              <li key={invitation.id} className="list-item">
                <span className="min-w-0 flex-1">
                  <strong>{invitation.email}</strong>
                  <span className="muted small" style={{ marginLeft: 8 }}>{formatRole(invitation.role)}</span>
                  <span className="muted small block mt-1">Created {formatDate(invitation.createdAt)}</span>
                </span>
                <span className="pill">{invitationState(invitation)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
