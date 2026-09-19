const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export interface Session {
  tenantId: string;
  token: string;
}

const SESSION_KEY = "signalai.session";

// R12-03: kept in localStorage deliberately, not moved to a cookie — any
// script on this origin can read it (the accepted trade-off for a
// bearer-token session), but a cookie was already rejected on purpose in
// the server's session.ts: a cross-origin cookie needs SameSite=None plus
// Access-Control-Allow-Credentials, which is exactly the CSRF/CORS
// surface this design was chosen to avoid. "Move it to a cookie for
// safety" looks like a natural hardening step; it would reopen that gap.

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Every dashboard/campaigns/billing route on the server requires the
 * bearer session issued at the end of the Instagram connect flow (see
 * server's R10-01 fix) — this is the one place that header gets attached,
 * so no call site has to remember it.
 */
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const session = loadSession();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.error ?? message;
    } catch {
      // body wasn't JSON — keep statusText
    }
    if (res.status === 401 || res.status === 403) {
      clearSession();
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function connectStartUrl(tenantName: string): string {
  return `${API_BASE}/auth/instagram/start?tenantName=${encodeURIComponent(tenantName)}`;
}

export interface TenantSummary {
  id: string;
  name: string;
  billingStatus: "none" | "active" | "canceled";
}

export interface AccountHealth {
  connected: boolean;
  instagramAccountId?: string;
  status?: "healthy" | "error";
  lastError?: string | null;
  lastCheckedAt?: string;
  expiresAt?: string | null;
}

export interface Campaign {
  id: string;
  tenantId: string;
  name: string;
  keywords: string[];
  enabled: boolean;
  replyMode: "rule_based" | "ai_generated";
  replyTemplates: string[];
  defaultReplyTemplate: string;
  ctaLink: string | null;
  createdAt: string;
}

export interface Milestone {
  id: string;
  campaignId: string;
  ordinal: number;
  goalDescription: string;
  captureField: string | null;
}

export interface LeadListItem {
  id: string;
  instagramUserId: string | null;
  username: string | null;
  activeMilestoneId: string | null;
  lastInboundAt: string | null;
  windowOpenUntil: string | null;
  createdAt: string;
}

export interface Analytics {
  commentsReceived: number;
  dmsSent: number;
  dmFailures: number;
  uniqueLeads: number;
}

export interface Dropoff {
  milestoneId: string;
  ordinal: number;
  goalDescription: string;
  advancedCount: number;
}

export interface PreviewResult {
  ruleBased: { text: string };
  aiGenerated: { text: string; fellBackReason?: string };
}

export const api = {
  getTenant: (tenantId: string) => request<TenantSummary>(`/tenants/${tenantId}`),
  getAccountHealth: (tenantId: string) => request<AccountHealth>(`/tenants/${tenantId}/account`),
  getLeads: (tenantId: string) => request<LeadListItem[]>(`/tenants/${tenantId}/leads`),
  getAnalytics: (tenantId: string) => request<Analytics>(`/tenants/${tenantId}/analytics`),
  getDropoff: (tenantId: string, campaignId: string) =>
    request<Dropoff[]>(`/tenants/${tenantId}/campaigns/${campaignId}/dropoff`),

  listCampaigns: (tenantId: string) => request<Campaign[]>(`/tenants/${tenantId}/campaigns`),
  createCampaign: (tenantId: string, name: string, keywords: string[]) =>
    request<Campaign>(`/tenants/${tenantId}/campaigns`, {
      method: "POST",
      body: JSON.stringify({ name, keywords }),
    }),
  setCampaignEnabled: (tenantId: string, campaignId: string, enabled: boolean) =>
    request<{ id: string; enabled: boolean }>(`/tenants/${tenantId}/campaigns/${campaignId}/enabled`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    }),
  updateReplyConfig: (
    tenantId: string,
    campaignId: string,
    updates: { replyMode?: "rule_based" | "ai_generated"; ctaLink?: string | null; defaultReplyTemplate?: string },
  ) =>
    request<Campaign>(`/tenants/${tenantId}/campaigns/${campaignId}/reply-config`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    }),
  preview: (tenantId: string, campaignId: string, sampleText: string, sampleUsername?: string) =>
    request<PreviewResult>(`/tenants/${tenantId}/campaigns/${campaignId}/preview`, {
      method: "POST",
      body: JSON.stringify({ sampleText, sampleUsername }),
    }),

  listMilestones: (tenantId: string, campaignId: string) =>
    request<Milestone[]>(`/tenants/${tenantId}/campaigns/${campaignId}/milestones`),
  setMilestones: (tenantId: string, campaignId: string, milestones: Array<{ goalDescription: string; captureField?: string }>) =>
    request<Milestone[]>(`/tenants/${tenantId}/campaigns/${campaignId}/milestones`, {
      method: "PUT",
      body: JSON.stringify({ milestones }),
    }),

  getBilling: (tenantId: string) =>
    request<{ billingStatus: "none" | "active" | "canceled"; billingConfigured: boolean }>(
      `/tenants/${tenantId}/billing`,
    ),
  startCheckout: (tenantId: string) =>
    request<{ url: string }>(`/tenants/${tenantId}/billing/checkout`, { method: "POST" }),
};
