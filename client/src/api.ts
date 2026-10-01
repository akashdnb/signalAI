const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

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

/**
 * Phase 2C Knowledge Base upload: the only multipart/form-data call in
 * this client — `request()` above always sets Content-Type: application/
 * json and always JSON.stringifies its body, neither of which a file
 * upload can use. A browser sets its own multipart boundary header
 * automatically when the body is a FormData, so this must NOT set
 * Content-Type itself (setting it manually loses the boundary parameter).
 * Shares the same session/error-handling contract as request() otherwise.
 */
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
    if (res.status === 401 || res.status === 403) {
      clearSession();
    }
    throw new ApiError(res.status, message);
  }

  return res.json() as Promise<T>;
}

/** Unauthenticated — there's no session yet at login time. Always resolves the same way regardless of outcome (server-side enumeration resistance); the caller just shows "check your inbox". */
export async function requestOtp(email: string): Promise<void> {
  await request("/auth/email/request", { method: "POST", body: JSON.stringify({ email }) });
}

/**
 * Verifies the 6-digit code and returns the session directly in the JSON
 * body — a plain fetch from the same page the code was entered on, not a
 * redirect. `ApiError.message` carries the server's `error` code
 * (`invalid_or_expired_code` | `too_many_attempts`) for the caller to map
 * to copy.
 */
export async function verifyOtp(email: string, code: string): Promise<Session> {
  return request<Session>("/auth/email/verify", { method: "POST", body: JSON.stringify({ email, code }) });
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
/** What kind of inbound event a campaign's keywords match against — distinct from ReplyChannel, which is where the reply goes once triggered. */
export type TriggerSource = "comment" | "message" | "both";
/** AI Behaviour panel: a coarse tone knob alongside the tenant-wide free-text brand voice. */
export type CampaignTone = "professional" | "friendly" | "casual" | "professional_and_friendly";
/** 'auto' leaves reply language unspecified (today's default behavior). */
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

export interface ObservedMedia {
  mediaId: string;
  commentCount: number;
  lastSeenAt: string | null;
  /** Cached Graph API metadata — null until enriched (see server's routes/campaigns.ts), which happens lazily whenever the picker loads an entry it doesn't have this for yet. */
  caption: string | null;
  mediaType: string | null;
  thumbnailUrl: string | null;
  permalink: string | null;
  postedAt: string | null;
}

export interface Milestone {
  id: string;
  campaignId: string;
  ordinal: number;
  goalDescription: string;
  captureFields: string[];
}

export interface JourneyNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  parentGroupId: string | null;
  collapsed: boolean;
}

export interface JourneyEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  label: string | null;
  condition: Record<string, unknown> | null;
}

export interface BuilderGraph {
  nodes: JourneyNode[];
  edges: JourneyEdge[];
  version: number;
}


export type JourneyStatus = "draft" | "published";

export interface JourneyValidationError {
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

export interface JourneyValidationResult {
  valid: boolean;
  errors: JourneyValidationError[];
}

export interface PublishedJourney {
  id: string;
  tenantId: string;
  campaignId: string;
  version: number;
  graph: BuilderGraph;
  createdAt: string;
  publishedAt: string;
}

export type FieldDefinitionValueType = "email" | "phone" | "country" | "number" | "date" | "text";

export interface FieldDefinition {
  id: string;
  tenantId: string;
  fieldKey: string;
  label: string;
  valueType: FieldDefinitionValueType;
  createdAt: string;
  updatedAt: string;
}

export type PipelineStage = "new" | "contacted" | "qualified" | "meeting_scheduled" | "won" | "lost";
export type HandoffStatus = "ai" | "requested" | "human";

export interface LeadListItem {
  id: string;
  instagramUserId: string | null;
  username: string | null;
  /** The most recent event's type for this lead — 'comment' means their last contact was a public comment, 'message' means a DM (including a shared post/Reel, which arrives as a message event). */
  lastEventType: "comment" | "message" | string | null;
  /** Inbox: that same event's comment/DM text, for a conversation-list preview. */
  lastMessagePreview: string | null;
  /** Inbox "Unread": true when there's an inbound message the lead's owner hasn't opened this conversation since. */
  unread: boolean;
  activeMilestoneId: string | null;
  lastInboundAt: string | null;
  windowOpenUntil: string | null;
  createdAt: string;
  pipelineStage: PipelineStage;
  ownerUserId: string | null;
  handoffStatus: HandoffStatus;
}

export interface LeadDetail extends LeadListItem {
  tenantId: string;
  customerId: string | null;
}

export type LeadScoreBand = "cold" | "warm" | "hot" | "very_hot";

/** Phase 2C Lead Intelligence: the current qualification/scoring projection for one lead. null when nothing has been calculated for this lead yet — a normal, common state, not an error. */
export interface LeadIntelligence {
  leadId: string;
  tenantId: string;
  intent: string | null;
  need: string | null;
  budgetValue: number | null;
  budgetText: string | null;
  location: string | null;
  score: number;
  scoreBand: LeadScoreBand;
  scoreReasons: string[];
  createdAt: string;
  updatedAt: string;
}

export interface LeadIntelligenceHistoryEntry {
  id: string;
  leadId: string;
  tenantId: string;
  intent: string | null;
  need: string | null;
  budgetValue: number | null;
  budgetText: string | null;
  location: string | null;
  score: number;
  scoreBand: LeadScoreBand;
  scoreReasons: string[];
  createdAt: string;
}

export type ScoringRuleField = "budget_value" | "intent" | "need" | "location";
export type ScoringRuleOperator = "gte" | "lte" | "eq" | "exists";

export type ScoringRuleDefinition =
  | { kind: "field_compare"; field: ScoringRuleField; operator: ScoringRuleOperator; value?: number | string }
  | { kind: "milestone_completed"; milestoneId: string };

export interface ScoringRule {
  id: string;
  tenantId: string;
  name: string;
  definition: ScoringRuleDefinition;
  points: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TenantMember {
  userId: string;
  email: string;
  role: "owner";
}

export interface LeadNote {
  id: string;
  leadId: string;
  authorUserId: string | null;
  body: string;
  createdAt: string;
}

export interface Tag {
  id: string;
  tenantId: string;
  name: string;
  createdAt: string;
}

export interface LeadTag {
  tagId: string;
  name: string;
  source: "manual" | "automatic";
}

export type DealStage = "open" | "won" | "lost";

export interface Deal {
  id: string;
  tenantId: string;
  customerId: string;
  leadId: string;
  stage: DealStage;
  value: number | null;
  currency: string;
  ownerUserId: string | null;
  wonAt: string | null;
  lostAt: string | null;
  createdAt: string;
}

export type TimelineEntry =
  | { kind: "event"; occurredAt: string; eventType: string; text: string | null; username: string | null; matchedKeyword: string | null }
  | { kind: "activity"; occurredAt: string; type: string; summary: string; actorUserId: string | null }
  | { kind: "reply"; occurredAt: string; channel: "dm" | "comment"; engine: "rule_based" | "ai_generated" | "human"; text: string };

export interface TimelinePage {
  /** Oldest-first, same as the old unpaginated shape. */
  entries: TimelineEntry[];
  hasMore: boolean;
  /** Pass as `before` on the next call to load the next (older) page. */
  nextCursor: string | null;
}

export interface TopPost {
  mediaId: string;
  caption: string | null;
  permalink: string | null;
  commentCount: number;
}

export interface TopKeyword {
  keyword: string;
  matchCount: number;
}

export interface Analytics {
  commentsReceived: number;
  dmsSent: number;
  dmFailures: number;
  uniqueLeads: number;
}

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
}

export interface Funnel {
  stages: FunnelStage[];
  openWithNoOutcome: number;
}

export interface RevenueByCurrency {
  currency: string;
  total: number;
}

export interface ConversationsTimeseriesPoint {
  date: string;
  comments: number;
  dms: number;
}

export interface CampaignAnalyticsPoint {
  date: string;
  comments: number;
  messages: number;
}

export interface CampaignAnalytics {
  commentsMatched: number;
  messagesMatched: number;
  conversationsStarted: number;
  timeseries: CampaignAnalyticsPoint[];
}

export interface Dropoff {
  milestoneId: string;
  ordinal: number;
  goalDescription: string;
  advancedCount: number;
}

export interface PreviewResult {
  ruleBased: { text: string };
  aiGenerated: { text: string; fellBackReason?: string; requiresHumanHandoff?: boolean };
}

export type PlanTier = "trial" | "starter" | "growth";

export interface PlanQuotas {
  dmsPerMonth: number;
  connectedAccounts: number;
  campaigns: number;
  tokenAllowance: number;
}

export interface AvailableTier extends PlanQuotas {
  tier: PlanTier;
  label: string;
}

export interface BillingSummary {
  billingStatus: "none" | "active" | "canceled";
  billingConfigured: boolean;
  planTier: PlanTier;
  planTierLabel: string;
  quotas: PlanQuotas;
  trialEndsAt: string | null;
  availableTiers: AvailableTier[];
}

export interface UsageSummary {
  planTier: PlanTier;
  planTierLabel: string;
  cycleStart: string;
  trialEndsAt: string | null;
  isTrialExpired: boolean;
  isEntitled: boolean;
  tokens: { used: number; allowance: number; overage: number; estimatedOverageCostUsd: number; nearingLimit: boolean };
  dms: { sent: number; allowance: number; nearingLimit: boolean };
}

export type KnowledgeBaseDocumentStatus = "processing" | "ready" | "failed";

export interface KnowledgeBaseDocument {
  id: string;
  tenantId: string;
  filename: string;
  contentType: string;
  version: number;
  status: KnowledgeBaseDocumentStatus;
  errorReason: string | null;
  supersededAt: string | null;
  createdAt: string;
}

export interface GuardrailsConfig {
  tenantId: string;
  brandVoice: string | null;
  forbiddenTopics: string[];
  escalationTriggers: string[];
}

export const api = {
  getTenant: (tenantId: string) => request<TenantSummary>(`/tenants/${tenantId}`),
  applyIndustry: (tenantId: string, industry: TenantIndustry) =>
    request<TenantSummary>(`/tenants/${tenantId}/onboarding/apply-industry`, {
      method: "POST",
      body: JSON.stringify({ industry }),
    }),
  // Identity Refactor U4/U6: connecting Instagram is authenticated (the
  // caller's session must be a member of tenantId) and is reached via a
  // top-level navigation, which can't carry an Authorization header — this
  // authenticated JSON call mints a short-lived one-time link first, and
  // the caller navigates the browser to the URL it returns.
  startInstagramConnect: (tenantId: string) =>
    request<{ url: string }>(`/tenants/${tenantId}/instagram/connect-link`, { method: "POST" }),
  getAccountHealth: (tenantId: string) => request<AccountHealth>(`/tenants/${tenantId}/account`),
  getLeads: (
    tenantId: string,
    filters?: { stage?: PipelineStage; ownerUserId?: string; q?: string; tagId?: string; handoffStatus?: HandoffStatus; unreadOnly?: boolean },
  ) => {
    const params = new URLSearchParams();
    if (filters?.stage) params.set("stage", filters.stage);
    if (filters?.ownerUserId) params.set("ownerUserId", filters.ownerUserId);
    if (filters?.q) params.set("q", filters.q);
    if (filters?.tagId) params.set("tagId", filters.tagId);
    if (filters?.handoffStatus) params.set("handoffStatus", filters.handoffStatus);
    if (filters?.unreadOnly) params.set("unread", "true");
    const qs = params.toString();
    return request<LeadListItem[]>(`/tenants/${tenantId}/leads${qs ? `?${qs}` : ""}`);
  },
  getLead: (tenantId: string, leadId: string) => request<LeadDetail>(`/tenants/${tenantId}/leads/${leadId}`),
  getLeadTimeline: (tenantId: string, leadId: string, opts?: { before?: string }) => {
    const params = new URLSearchParams();
    if (opts?.before) params.set("before", opts.before);
    const qs = params.toString();
    return request<TimelinePage>(`/tenants/${tenantId}/leads/${leadId}/timeline${qs ? `?${qs}` : ""}`);
  },
  updateLead: (tenantId: string, leadId: string, updates: { pipelineStage?: PipelineStage; ownerUserId?: string | null }) =>
    request<LeadDetail>(`/tenants/${tenantId}/leads/${leadId}`, { method: "PATCH", body: JSON.stringify(updates) }),
  handoffAction: (tenantId: string, leadId: string, action: "request" | "takeover" | "release") =>
    request<LeadDetail>(`/tenants/${tenantId}/leads/${leadId}/handoff`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),
  markLeadRead: (tenantId: string, leadId: string) =>
    request<void>(`/tenants/${tenantId}/leads/${leadId}/read`, { method: "POST" }),
  sendLeadReply: (tenantId: string, leadId: string, text: string) =>
    request<{ ok: true }>(`/tenants/${tenantId}/leads/${leadId}/reply`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  getCapturedFacts: (tenantId: string, leadId: string) =>
    request<{ facts: Record<string, string> }>(`/tenants/${tenantId}/leads/${leadId}/captured-facts`).then((r) => r.facts),

  // Phase 2C Lead Intelligence
  getLeadIntelligence: (tenantId: string, leadId: string) =>
    request<LeadIntelligence | null>(`/tenants/${tenantId}/leads/${leadId}/intelligence`),
  getLeadIntelligenceHistory: (tenantId: string, leadId: string) =>
    request<LeadIntelligenceHistoryEntry[]>(`/tenants/${tenantId}/leads/${leadId}/intelligence/history`),
  recalculateLeadIntelligence: (tenantId: string, leadId: string) =>
    request<LeadIntelligence>(`/tenants/${tenantId}/leads/${leadId}/intelligence/recalculate`, { method: "POST" }),

  // SLICE C: tenant-configurable custom lead scoring rules
  listScoringRules: (tenantId: string) =>
    request<{ rules: ScoringRule[] }>(`/tenants/${tenantId}/scoring-rules`).then((r) => r.rules),
  createScoringRule: (tenantId: string, input: { name: string; definition: ScoringRuleDefinition; points: number; enabled?: boolean }) =>
    request<{ rule: ScoringRule }>(`/tenants/${tenantId}/scoring-rules`, {
      method: "POST",
      body: JSON.stringify(input),
    }).then((r) => r.rule),
  updateScoringRule: (
    tenantId: string,
    id: string,
    updates: { name?: string; definition?: ScoringRuleDefinition; points?: number; enabled?: boolean },
  ) =>
    request<{ rule: ScoringRule }>(`/tenants/${tenantId}/scoring-rules/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    }).then((r) => r.rule),
  deleteScoringRule: (tenantId: string, id: string) =>
    request<void>(`/tenants/${tenantId}/scoring-rules/${id}`, { method: "DELETE" }),

  listMembers: (tenantId: string) => request<TenantMember[]>(`/tenants/${tenantId}/members`),

  listLeadNotes: (tenantId: string, leadId: string) => request<LeadNote[]>(`/tenants/${tenantId}/leads/${leadId}/notes`),
  addLeadNote: (tenantId: string, leadId: string, body: string) =>
    request<LeadNote>(`/tenants/${tenantId}/leads/${leadId}/notes`, { method: "POST", body: JSON.stringify({ body }) }),

  listTenantTags: (tenantId: string) => request<Tag[]>(`/tenants/${tenantId}/tags`),
  listLeadTags: (tenantId: string, leadId: string) => request<LeadTag[]>(`/tenants/${tenantId}/leads/${leadId}/tags`),
  addLeadTag: (tenantId: string, leadId: string, name: string) =>
    request<Tag>(`/tenants/${tenantId}/leads/${leadId}/tags`, { method: "POST", body: JSON.stringify({ name }) }),
  removeLeadTag: (tenantId: string, leadId: string, tagId: string) =>
    request<void>(`/tenants/${tenantId}/leads/${leadId}/tags/${tagId}`, { method: "DELETE" }),

  listLeadDeals: (tenantId: string, leadId: string) => request<Deal[]>(`/tenants/${tenantId}/leads/${leadId}/deals`),
  createLeadDeal: (tenantId: string, leadId: string, value: number | null, currency?: string) =>
    request<Deal>(`/tenants/${tenantId}/leads/${leadId}/deals`, {
      method: "POST",
      body: JSON.stringify({ value, currency }),
    }),
  updateDealStage: (tenantId: string, dealId: string, stage: DealStage) =>
    request<Deal>(`/tenants/${tenantId}/deals/${dealId}`, { method: "PATCH", body: JSON.stringify({ stage }) }),

  getTopPosts: (tenantId: string) => request<TopPost[]>(`/tenants/${tenantId}/analytics/top-posts`),
  getTopKeywords: (tenantId: string) => request<TopKeyword[]>(`/tenants/${tenantId}/analytics/top-keywords`),
  getAnalytics: (tenantId: string) => request<Analytics>(`/tenants/${tenantId}/analytics`),
  getFunnel: (tenantId: string) => request<Funnel>(`/tenants/${tenantId}/analytics/funnel`),
  getRevenue: (tenantId: string) => request<RevenueByCurrency[]>(`/tenants/${tenantId}/analytics/revenue`),
  getConversationsTimeseries: (tenantId: string) =>
    request<ConversationsTimeseriesPoint[]>(`/tenants/${tenantId}/analytics/timeseries`),
  getDropoff: (tenantId: string, campaignId: string) =>
    request<Dropoff[]>(`/tenants/${tenantId}/campaigns/${campaignId}/dropoff`),
  getCampaignAnalytics: (tenantId: string, campaignId: string) =>
    request<CampaignAnalytics>(`/tenants/${tenantId}/campaigns/${campaignId}/analytics`),

  listCampaigns: (tenantId: string) => request<Campaign[]>(`/tenants/${tenantId}/campaigns`),
  getCampaign: (tenantId: string, campaignId: string) =>
    request<Campaign>(`/tenants/${tenantId}/campaigns/${campaignId}`),
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
    updates: {
      replyMode?: "rule_based" | "ai_generated";
      ctaLink?: string | null;
      defaultReplyTemplate?: string;
      replyChannel?: ReplyChannel;
      triggerSource?: TriggerSource;
      tone?: CampaignTone;
      language?: CampaignLanguage;
      useKnowledgeBase?: boolean;
      keywords?: string[];
      name?: string;
      description?: string | null;
    },
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

  // Backs the campaign editor's post-targeting picker: posts this tenant
  // has actually received a comment on, derived from ingested events
  // rather than a Graph API media-listing call.
  listObservedMedia: (tenantId: string) => request<ObservedMedia[]>(`/tenants/${tenantId}/observed-media`),
  // Resolves a pasted post/Reel URL against the connected account's own
  // media and adds it as a known post — usable for targeting even before
  // any comment on it has arrived.
  addKnownMediaByUrl: (tenantId: string, url: string) =>
    request<ObservedMedia>(`/tenants/${tenantId}/known-media`, {
      method: "POST",
      body: JSON.stringify({ url }),
    }),
  setCampaignTargetMedia: (tenantId: string, campaignId: string, targetMediaIds: string[]) =>
    request<Campaign>(`/tenants/${tenantId}/campaigns/${campaignId}/target-media`, {
      method: "PUT",
      body: JSON.stringify({ targetMediaIds }),
    }),
  setCampaignReplyTemplates: (tenantId: string, campaignId: string, replyTemplates: string[]) =>
    request<Campaign>(`/tenants/${tenantId}/campaigns/${campaignId}/reply-templates`, {
      method: "PUT",
      body: JSON.stringify({ replyTemplates }),
    }),

  listMilestones: (tenantId: string, campaignId: string) =>
    request<Milestone[]>(`/tenants/${tenantId}/campaigns/${campaignId}/milestones`),
  setMilestones: (
    tenantId: string,
    campaignId: string,
    milestones: Array<{ goalDescription: string; captureFields?: string[] }>,
    oldIndexToNewIndex?: Array<number | null>,
  ) =>
    request<Milestone[]>(`/tenants/${tenantId}/campaigns/${campaignId}/milestones`, {
      method: "PUT",
      body: JSON.stringify({ milestones, oldIndexToNewIndex }),
    }),
  getBuilderGraph: (tenantId: string, campaignId: string) =>
    request<BuilderGraph>(`/tenants/${tenantId}/campaigns/${campaignId}/builder`),
  saveBuilderGraph: (
    tenantId: string,
    campaignId: string,
    graph: { expectedVersion: number; nodes: JourneyNode[]; edges: JourneyEdge[] },
  ) =>
    request<BuilderGraph>(`/tenants/${tenantId}/campaigns/${campaignId}/builder`, {
      method: "PUT",
      body: JSON.stringify(graph),
    }),

  publishJourney: (
    tenantId: string,
    campaignId: string,
    expectedBuilderVersion: number,
  ) =>
    request<PublishedJourney>(
      `/tenants/${tenantId}/campaigns/${campaignId}/journey/publish`,
      {
        method: "POST",
        body: JSON.stringify({ expectedBuilderVersion }),
      },
    ),

  getLatestPublishedJourney: (
    tenantId: string,
    campaignId: string,
  ) =>
    request<PublishedJourney | null>(
      `/tenants/${tenantId}/campaigns/${campaignId}/journey/published`,
    ),

  getBilling: (tenantId: string) => request<BillingSummary>(`/tenants/${tenantId}/billing`),
  startCheckout: (tenantId: string, tier: PlanTier = "starter") =>
    request<{ url: string }>(`/tenants/${tenantId}/billing/checkout`, {
      method: "POST",
      body: JSON.stringify({ tier }),
    }),
  getUsage: (tenantId: string) => request<UsageSummary>(`/tenants/${tenantId}/usage`),

  listKnowledgeBaseDocuments: (tenantId: string) =>
    request<{ documents: KnowledgeBaseDocument[] }>(`/tenants/${tenantId}/knowledge-base`).then((r) => r.documents),
  uploadKnowledgeBaseDocument: (tenantId: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return requestMultipart<{ document: KnowledgeBaseDocument }>(`/tenants/${tenantId}/knowledge-base`, formData).then(
      (r) => r.document,
    );
  },
  deleteKnowledgeBaseDocument: (tenantId: string, documentId: string) =>
    request<void>(`/tenants/${tenantId}/knowledge-base/${documentId}`, { method: "DELETE" }),

  getGuardrailsConfig: (tenantId: string) =>
    request<{ config: GuardrailsConfig }>(`/tenants/${tenantId}/guardrails-config`).then((r) => r.config),
  updateGuardrailsConfig: (
    tenantId: string,
    updates: { brandVoice: string | null; forbiddenTopics: string[]; escalationTriggers: string[] },
  ) =>
    request<{ config: GuardrailsConfig }>(`/tenants/${tenantId}/guardrails-config`, {
      method: "PUT",
      body: JSON.stringify(updates),
    }).then((r) => r.config),

  listFieldDefinitions: (tenantId: string) =>
    request<{ fieldDefinitions: FieldDefinition[] }>(`/tenants/${tenantId}/field-definitions`).then(
      (r) => r.fieldDefinitions,
    ),
  createFieldDefinition: (tenantId: string, input: { fieldKey: string; label: string; valueType: FieldDefinitionValueType }) =>
    request<{ fieldDefinition: FieldDefinition }>(`/tenants/${tenantId}/field-definitions`, {
      method: "POST",
      body: JSON.stringify(input),
    }).then((r) => r.fieldDefinition),
  updateFieldDefinition: (tenantId: string, id: string, updates: { label?: string; valueType?: FieldDefinitionValueType }) =>
    request<{ fieldDefinition: FieldDefinition }>(`/tenants/${tenantId}/field-definitions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    }).then((r) => r.fieldDefinition),
  deleteFieldDefinition: (tenantId: string, id: string) =>
    request<void>(`/tenants/${tenantId}/field-definitions/${id}`, { method: "DELETE" }),
};
