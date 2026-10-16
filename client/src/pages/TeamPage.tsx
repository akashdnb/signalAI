import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { UserPlusIcon } from "../components/icons";
import { Field, TextInput, TextareaInput } from "../components/ui";
import { useTenant } from "../context/TenantContext";
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

function explainInvitationError(error: unknown): string {
  const status = (error as Error & { status?: number }).status;
  const message = error instanceof Error ? error.message : "Invitation request failed.";
  if (status === 403) return "Only workspace owners and admins can manage invitations.";
  if (status === 409 || /already a member|pending invitation|already invited/i.test(message)) {
    return "That email is already a workspace member or has a pending invitation. Review the member list and invitation history.";
  }
  return message;
}

export function TeamPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const { tenant, reload, reloadWorkspaces, workspaceRole, workspaces, workspaceError } = useTenant();
  const canManageWorkspace = workspaceRole === "owner" || workspaceRole === "admin";

  const [members, setMembers] = useState<WorkspaceMember[] | null>(null);
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
  const [settingsSaved, setSettingsSaved] = useState(false);

  useEffect(() => {
    setWorkspaceName(tenant?.name ?? "");
    setWorkspaceDescription(tenant?.description ?? "");
    setSettingsSaved(false);
  }, [tenant?.id, tenant?.name, tenant?.description]);

  async function load() {
    if (!tenantId) return;
    try {
      const nextMembers = await workspaceApi.listMembers(tenantId);
      setMembers(nextMembers);
      if (canManageWorkspace) {
        try {
          setInvitations(await workspaceApi.listInvitations(tenantId) ?? []);
        } catch (err) {
          setInvitations([]);
          setError(explainInvitationError(err));
          return;
        }
      } else {
        // Member access deliberately does not call the admin-only invitations endpoint.
        setInvitations([]);
      }
      setError(null);
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      if (status === 401) {
        navigate("/login", { replace: true });
        return;
      }
      if (status === 403) {
        setMembers(null);
        setError("You do not have access to this workspace's member list.");
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load team");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, canManageWorkspace]);

  async function handleSaveWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenantId || !canManageWorkspace || savingWorkspace) return;
    if (!workspaceName.trim()) {
      setError("Workspace name is required.");
      return;
    }
    setSavingWorkspace(true);
    setSettingsSaved(false);
    setError(null);
    try {
      await workspaceApi.updateWorkspace(tenantId, workspaceName.trim(), workspaceDescription.trim());
      reload();
      reloadWorkspaces();
      setSettingsSaved(true);
    } catch (err) {
      setError(explainInvitationError(err));
    } finally {
      setSavingWorkspace(false);
    }
  }

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenantId || !inviteEmail.trim() || !canManageWorkspace) {
      if (!canManageWorkspace) setError("Only workspace owners and admins can invite teammates.");
      return;
    }
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
      setError(explainInvitationError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleInvitationAction(invitationId: string, action: "resend" | "revoke") {
    if (!tenantId) return;
    if (!canManageWorkspace) {
      setError("Only workspace owners and admins can manage invitations.");
      return;
    }
    if (action === "revoke" && !window.confirm("Cancel this invitation? The existing invitation link will stop working.")) return;
    setActionKey(`${action}:${invitationId}`);
    setError(null);
    try {
      if (action === "resend") {
        const result = await workspaceApi.resendInvitation(tenantId, invitationId);
        if (result.delivery === "failed") {
          setError("A fresh invitation was created, but the email could not be delivered. Check email delivery before trying again.");
        }
      } else {
        await workspaceApi.revokeInvitation(tenantId, invitationId);
      }
      await load();
    } catch (err) {
      setError(explainInvitationError(err));
    } finally {
      setActionKey(null);
    }
  }

  async function handleRoleChange(member: WorkspaceMember, role: "admin" | "member") {
    if (!tenantId || !canManageWorkspace || role === member.role || member.role === "owner") return;
    setActionKey(`role:${member.userId}`);
    setError(null);
    try {
      await workspaceApi.updateMemberRole(tenantId, member.userId, role);
      await load();
      reloadWorkspaces();
    } catch (err) {
      setError(explainInvitationError(err));
    } finally {
      setActionKey(null);
    }
  }

  async function handleRemove(member: WorkspaceMember) {
    if (!tenantId || !canManageWorkspace) {
      setError("Only workspace owners and admins can remove members.");
      return;
    }
    if (member.role === "owner" || !window.confirm(`Remove ${member.email} from this workspace? They will lose access to workspace data and automations.`)) return;
    setActionKey(`remove:${member.userId}`);
    setError(null);
    try {
      await workspaceApi.removeMember(tenantId, member.userId);
      await load();
      reloadWorkspaces();
    } catch (err) {
      setError(explainInvitationError(err));
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
      <p className="muted">Manage workspace details, people, and access. Your role is {workspaceRole ? formatRole(workspaceRole) : "being checked"}.</p>

      {error && <div className="banner banner-error" role="alert">{error}</div>}
      {workspaceRole === null && (
        <div className={workspaceError ? "banner banner-error" : "banner"} role={workspaceError ? "alert" : "status"}>
          {workspaceError ? "Workspace permissions could not be verified. Administrative controls are disabled until your access can be checked." : "Checking your workspace permissions…"}
        </div>
      )}

      <section className="card">
        <h2>Workspace settings</h2>
        <p className="muted small">These details identify the workspace in your account switcher. Connected accounts and automations stay scoped to this workspace.</p>
        <form onSubmit={(event) => void handleSaveWorkspace(event)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Workspace name">
            <TextInput
              value={workspaceName}
              onChange={(event) => { setWorkspaceName(event.target.value); setSettingsSaved(false); }}
              required
              maxLength={80}
              disabled={!canManageWorkspace || savingWorkspace}
              placeholder="Workspace name"
            />
          </Field>
          <Field label="Description" hint="Optional. Helps teammates distinguish workspaces.">
            <TextareaInput
              value={workspaceDescription}
              onChange={(event) => { setWorkspaceDescription(event.target.value); setSettingsSaved(false); }}
              maxLength={300}
              rows={2}
              disabled={!canManageWorkspace || savingWorkspace}
              placeholder="What is this workspace for?"
            />
          </Field>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            {canManageWorkspace ? (
              <button type="submit" className="btn-primary btn-small" disabled={savingWorkspace || !workspaceName.trim() || (workspaceName.trim() === (tenant?.name ?? "") && workspaceDescription.trim() === (tenant?.description ?? "").trim())}>
                {savingWorkspace ? "Saving…" : "Save workspace"}
              </button>
            ) : (
              <p className="muted small m-0">Only workspace owners and admins can change these details.</p>
            )}
            {settingsSaved && <span className="text-sm text-subtle" role="status">Workspace settings saved.</span>}
          </div>
        </form>
      </section>

      <section className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 style={{ marginBottom: 0 }}>Members</h2>
            <p className="muted small mt-1 mb-0">Owners have full control. Admins manage members and connected accounts. Members can view workspace data and work with automations.</p>
          </div>
          {canManageWorkspace && (
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
          )}
        </div>
        {!canManageWorkspace && (
          <p className="muted small mt-3 mb-0">
            You can view the member list. Only owners and admins can invite teammates, change roles, remove people, or view invitation history.
          </p>
        )}

        {inviting && canManageWorkspace && (
          <form onSubmit={(event) => void handleInvite(event)} className="inline-form mt-4">
            <input
              type="email"
              aria-label="Teammate email address"
              placeholder="teammate@company.com"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              required
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
          <p className="muted" role="status">{error ? "The member list could not be loaded." : "Loading team…"}</p>
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
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{member.email}</span>
                      {member.userId === members[0]?.userId && isOwner && <span className="muted small">Workspace owner</span>}
                    </span>
                  </span>
                  {isOwner ? (
                    <span className="pill pill-ok" style={{ marginLeft: 0 }}>Owner</span>
                  ) : canManageWorkspace ? (
                    <span className="inline-flex flex-wrap items-center justify-end gap-2">
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
                  ) : (
                    <span className="pill" style={{ marginLeft: 0 }}>{formatRole(member.role)}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {canManageWorkspace && pendingInvitations.length > 0 && (
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
                  <span className="inline-flex flex-wrap items-center gap-2">
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

      {canManageWorkspace && resolvedInvitations.length > 0 && (
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
