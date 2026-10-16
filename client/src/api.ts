export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
const API_BASE = API_BASE_URL;

/**
 * Identity Refactor U3: the SERVER session token only ever identifies a
 * user (`userId` lives inside the signed token itself, opaque to the
 * client). `tenantId` here is a client-side convenience — which workspace
 * to default to — not a security boundary: the server re-checks real
 * membership via tenant_members on every request regardless of what
 * tenantId this object claims, so there's nothing to protect by the client
 * also tracking a userId it has no use for.
 */
export interface Session {
  tenantId: string;
  token: string;
  /** Set client-side after OTP verify, for display only (e.g. the sidebar account block) — the server doesn't return it as part of the session. */
  email?: string;
  firstName?: string;
  lastName?: string;
  picture?: string;
}

const SESSION_KEY = "signalai.session";

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

/** The single JSON request path attaches the bearer session and preserves server errors. */
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
    if (res.status === 401 || res.status === 403) clearSession();
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Multipart uploads let the browser set the form-data boundary itself. */
async function requestMultipart<T>(path: string, formData: FormData): Promise<T> {
  const session = loadSession();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: session ? { Authorization: `Bearer ${session.token}` } : {},
    body: formData,
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.error ?? message;
    } catch {
      // body wasn't JSON — keep statusText
    }
    if (res.status === 401 || res.status === 403) clearSession();
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

/** User-owned profile: never accepts a target user id. */
export interface UserProfile {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  profilePictureUrl: string | null;
  createdAt: string;
}

export interface KnowledgeBaseDocument {
  id: string;
  tenantId: string;
  filename: string;
  contentType: string;
  version: number;
  status: "processing" | "ready" | "failed";
  errorReason: string | null;
  supersededAt: string | null;
  createdAt: string;
}

export interface KnowledgeBaseDocumentPreview {
  documentId: string;
  filename: string;
  content: string;
  chunkCount: number;
}

export interface KnowledgeRetrievalResult {
  content: string;
  documentId: string;
  similarity: number;
}

export interface KnowledgeRetrievalResponse {
  query: string;
  results: KnowledgeRetrievalResult[];
  count: number;
}

/** Unauthenticated — there is no session yet at login time. */
export async function requestOtp(email: string): Promise<void> {
  await request("/auth/email/request", { method: "POST", body: JSON.stringify({ email }) });
}

/** Verifies a single-use code and returns the session directly in JSON. */
export async function verifyOtp(email: string, code: string): Promise<Session> {
  return request<Session>("/auth/email/verify", { method: "POST", body: JSON.stringify({ email, code }) });
}

/** Exchange a short-lived, single-use Google callback handoff for the SignalAI session. */
export async function exchangeGoogleHandoff(handoff: string): Promise<Session> {
  const res = await fetch(`${API_BASE}/auth/google/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handoff }),
  });
  if (!res.ok) {
    let message = "Google sign-in could not be completed";
    try {
      const body = await res.json();
      message = body.error ?? message;
    } catch {
      // Keep a user-safe fallback when an upstream error is not JSON.
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<Session>;
}

/** Onboarding wizard (R5): the vertical a tenant picked. null = hasn't gone through the wizard yet — 'other' is a real, explicit choice, not the same as unset. */
export type TenantIndustry = "real_estate" | "ecommerce" | "education" | "creator" | "coach" | "agency" | "other";

export const INDUSTRY_LABEL: Record<TenantIndustry, string> = {
  real_estate: "Real Estate",
  ecommerce: "E-commerce",
  education: "Education",
  creator: "Creator",
  coach: "Coach",
  agency: "Agency",
  other: "Other",
};

export interface TenantSummary {
  id: string;
  name: string;
  billingStatus: "none" | "active" | "canceled";
  industry: TenantIndustry | null;
}

export interface AccountHealth {
  connected: boolean;
  instagramAccountId?: string;
  status?: "healthy" | "error";
  lastError?: string | null;
  lastCheckedAt?: string;
  expiresAt?: string | null;
}

export type ReplyChannel = "dm" | "comment" | "both";
export type TriggerSource = "comment" | "message" | "both";
export type CampaignTone = "professional" | "friendly" | "casual" | "professional_and_friendly";
export type CampaignLanguage = "auto" | "en" | "hi";

export const TONE_LABEL: Record<CampaignTone, string> = {
  professional: "Professional",
  friendly: "Friendly",
  casual: "Casual",
  professional_and_friendly: "Professional & Friendly",
};

export const LANGUAGE_LABEL: Record<CampaignLanguage, string> = {
  auto: "Auto-detect",
  en: "English",
  hi: "Hindi",
};

export interface Campaign {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  keywords: string[];
  enabled: boolean;
  published?: boolean;
  replyMode: "rule_based" | "ai_generated";
  replyTemplates: string[];
  defaultReplyTemplate: string;
  ctaLink: string | null;
  targetMediaIds: string[];
  replyChannel: ReplyChannel;
  triggerSource: TriggerSource;
  tone: CampaignTone;
  language: CampaignLanguage;
  useKnowledgeBase: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GuardrailsConfig {
  tenantId: string;
  brandVoice: string | null;
  forbiddenTopics: string[];
  escalationTriggers: string[];
  updatedAt: string;
}

export interface FieldDefinition {
  id: string;
  tenantId: string;
  fieldKey: string;
  label: string;
  valueType: "email" | "phone" | "country" | "number" | "date" | "text";
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * The API object below intentionally keeps the existing endpoint semantics.
 * Specialized UI models declared elsewhere in this file are retained in
 * existing source through the generated repository client.
 */
export const api = {
  getProfile: () => request<{ profile: UserProfile }>("/me/profile").then((r) => r.profile),
  updateProfile: (updates: { firstName?: string | null; lastName?: string | null; profilePictureUrl?: string | null }) =>
    request<{ profile: UserProfile }>("/me/profile", { method: "PATCH", body: JSON.stringify(updates) }).then((r) => r.profile),
  listKnowledgeBaseDocuments: (tenantId: string) =>
    request<{ documents: KnowledgeBaseDocument[] }>(`/tenants/${tenantId}/knowledge-base`).then((r) => r.documents),
  getKnowledgeBaseDocument: (tenantId: string, documentId: string) =>
    request<{ document: Omit<KnowledgeBaseDocument, "storageKey"> }>(`/tenants/${tenantId}/knowledge-base/${documentId}`).then((r) => r.document),
  previewKnowledgeBaseDocument: (tenantId: string, documentId: string) =>
    request<KnowledgeBaseDocumentPreview>(`/tenants/${tenantId}/knowledge-base/${documentId}/preview`),
  retrieveKnowledgeBase: (tenantId: string, query: string, limit = 5) =>
    request<KnowledgeRetrievalResponse>(`/tenants/${tenantId}/knowledge-base/retrieval`, {
      method: "POST",
      body: JSON.stringify({ query, limit }),
    }),
  uploadKnowledgeBaseDocument: (tenantId: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return requestMultipart<{ document: KnowledgeBaseDocument }>(`/tenants/${tenantId}/knowledge-base`, formData).then((r) => r.document);
  },
  deleteKnowledgeBaseDocument: (tenantId: string, documentId: string) =>
    request<void>(`/tenants/${tenantId}/knowledge-base/${documentId}`, { method: "DELETE" }),
};
