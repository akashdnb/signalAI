const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

interface Session {
  tenantId: string;
  token: string;
}

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem("signalai.session");
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const session = loadSession();
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = await response.json();
      message = body.error ?? message;
    } catch {
      // Keep status text when the response isn't JSON.
    }
    const error = new Error(message) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export type WorkspaceRole = "owner" | "admin" | "member";

export interface WorkspaceSummary {
  tenantId: string;
  name: string;
  description: string | null;
  role: WorkspaceRole;
}

export interface WorkspaceMember {
  userId: string;
  email: string;
  role: WorkspaceRole;
}

export interface WorkspaceInvitation {
  id: string;
  tenantId: string;
  email: string;
  role: "admin" | "member";
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface ConnectedInstagramAccount {
  id: string;
  tenantId: string;
  instagramAccountId: string;
  instagramUsername: string | null;
  status: "healthy" | "error";
  lastError: string | null;
  lastCheckedAt: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JourneyAccountBinding {
  campaignId: string;
  accountId: string;
  instagramAccountId: string;
  enabled: boolean;
}

export const workspaceApi = {
  listWorkspaces: () =>
    request<{ workspaces: WorkspaceSummary[] }>("/me/workspaces").then((response) => response.workspaces),

  createWorkspace: (name: string, description?: string) =>
    request<{ workspace: WorkspaceSummary }>("/workspaces", {
      method: "POST",
      body: JSON.stringify({ name, ...(description?.trim() ? { description: description.trim() } : {}) }),
    }).then((response) => response.workspace),

  listMembers: (tenantId: string) =>
    request<WorkspaceMember[]>(`/tenants/${tenantId}/members`),

  listInvitations: (tenantId: string) =>
    request<{ invitations: WorkspaceInvitation[] }>(`/tenants/${tenantId}/invitations`).then((r) => r.invitations),

  inviteMember: (tenantId: string, email: string, role: "admin" | "member" = "member") =>
    request<{ invitation: WorkspaceInvitation; delivery: "sent" | "failed" }>(
      `/tenants/${tenantId}/invitations`,
      { method: "POST", body: JSON.stringify({ email, role }) },
    ),

  resendInvitation: (tenantId: string, invitationId: string) =>
    request<{ invitation: WorkspaceInvitation; delivery: "failed" | "sent" }>(
      `/tenants/${tenantId}/invitations/${invitationId}/resend`,
      { method: "POST" },
    ),

  revokeInvitation: (tenantId: string, invitationId: string) =>
    request<void>(`/tenants/${tenantId}/invitations/${invitationId}/revoke`, { method: "POST" }),

  updateMemberRole: (tenantId: string, memberId: string, role: "admin" | "member") =>
    request<{ member: WorkspaceMember }>(`/tenants/${tenantId}/members/${memberId}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),

  removeMember: (tenantId: string, memberId: string) =>
    request<void>(`/tenants/${tenantId}/members/${memberId}`, { method: "DELETE" }),

  acceptInvitation: (token: string) =>
    request<{ tenantId: string; role: "admin" | "member" }>(`/invitations/${encodeURIComponent(token)}/accept`, {
      method: "POST",
    }),

  listConnectedAccounts: (tenantId: string) =>
    request<{ accounts: ConnectedInstagramAccount[] }>(`/tenants/${tenantId}/connected-accounts`).then((r) => r.accounts),

  disconnectAccount: (tenantId: string, accountId: string) =>
    request<void>(`/tenants/${tenantId}/connected-accounts/${accountId}`, { method: "DELETE" }),

  startInstagramReconnect: (tenantId: string, accountId: string) =>
    request<{ url: string }>(`/tenants/${tenantId}/instagram/connect-link`, {
      method: "POST",
      body: JSON.stringify({ accountId }),
    }),

  listJourneyAccounts: (tenantId: string, campaignId: string) =>
    request<{ accounts: JourneyAccountBinding[] }>(`/tenants/${tenantId}/campaigns/${campaignId}/connected-accounts`).then((r) => r.accounts),

  attachJourneyAccount: (tenantId: string, campaignId: string, accountId: string) =>
    request<{ account: JourneyAccountBinding }>(
      `/tenants/${tenantId}/campaigns/${campaignId}/connected-accounts/${accountId}`,
      { method: "POST" },
    ).then((r) => r.account),

  detachJourneyAccount: (tenantId: string, campaignId: string, accountId: string) =>
    request<void>(`/tenants/${tenantId}/campaigns/${campaignId}/connected-accounts/${accountId}`, { method: "DELETE" }),
};
