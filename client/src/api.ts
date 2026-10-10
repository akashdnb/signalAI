const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export interface Session { tenantId: string; token: string; email?: string; }
const SESSION_KEY = "signalai.session";
export function loadSession(): Session | null { try { const raw = localStorage.getItem(SESSION_KEY); return raw ? (JSON.parse(raw) as Session) : null; } catch { return null; } }
export function saveSession(session: Session): void { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); }
export function clearSession(): void { localStorage.removeItem(SESSION_KEY); }
export class ApiError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }

export type TenantIndustry = "real_estate" | "ecommerce" | "education" | "creator" | "coach" | "agency" | "other";
export const INDUSTRY_LABEL: Record<TenantIndustry, string> = { real_estate: "Real Estate", ecommerce: "E-commerce", education: "Education", creator: "Creator", coach: "Coach", agency: "Agency", other: "Other" };
export type ReplyChannel = "comment" | "dm" | "both";
export type TriggerSource = "comment" | "message" | "both";
export type CampaignTone = "professional" | "friendly" | "casual" | "professional_and_friendly";
export type CampaignLanguage = "auto" | "en" | "hi";
export const TONE_LABEL: Record<CampaignTone, string> = { professional: "Professional", friendly: "Friendly", casual: "Casual", professional_and_friendly: "Professional & Friendly" };
export const LANGUAGE_LABEL: Record<CampaignLanguage, string> = { auto: "Auto-detect", en: "English", hi: "Hindi" };
export interface Campaign { id: string; tenantId: string; name: string; description: string | null; keywords: string[]; enabled: boolean; replyMode: "rule_based" | "ai_generated"; replyTemplates: string[]; defaultReplyTemplate: string; ctaLink: string | null; targetMediaIds: string[]; replyChannel: ReplyChannel; triggerSource: TriggerSource; tone: CampaignTone; language: CampaignLanguage; useKnowledgeBase: boolean; createdAt: string; updatedAt: string; }
export interface ObservedMedia { mediaId: string; commentCount: number; lastSeenAt: string | null; caption: string | null; mediaType: string | null; thumbnailUrl: string | null; permalink: string | null; postedAt: string | null; }
export interface Milestone { id: string; campaignId: string; ordinal: number; goalDescription: string; captureFields: string[]; }
export type InstagramMessageButton = { type: "web_url"; title: string; url: string } | { type: "postback"; title: string; payload: string };
export interface InstagramQuickReply { title: string; payload: string; }
export interface InstagramMessageCard { title: string; subtitle?: string; imageUrl?: string; buttons?: InstagramMessageButton[]; }
export type InstagramMessagePresentation = { type: "text" } | { type: "buttons"; buttons: InstagramMessageButton[] } | { type: "card"; card: InstagramMessageCard } | { type: "gallery"; cards: InstagramMessageCard[] } | { type: "quick_replies"; replies: InstagramQuickReply[] };
export interface JourneyNode { id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown>; parentGroupId: string | null; collapsed: boolean; }
export interface JourneyEdge { id: string; sourceNodeId: string; targetNodeId: string; label: string | null; condition: Record<string, unknown> | null; }
export interface BuilderGraph { nodes: JourneyNode[]; edges: JourneyEdge[]; version: number; }
export interface BuilderGraphSaveResult extends BuilderGraph { milestones?: Milestone[]; }
export type JourneyStatus = "draft" | "published";
export interface JourneyValidationError { code: string; message: string; nodeId?: string; edgeId?: string; }
export interface JourneyValidationResult { valid: boolean; errors: JourneyValidationError[]; }
export interface PublishedJourney { id: string; tenantId: string; campaignId: string; version: number; graph: BuilderGraph; createdAt: string; publishedAt: string; }
export type FieldDefinitionValueType = "email" | "phone" | "country" | "number" | "date" | "text";
export interface FieldDefinition { id: string; tenantId: string; fieldKey: string; label: string; valueType: FieldDefinitionValueType; createdAt: string; updatedAt: string; }
export type PipelineStage = "new" | "contacted" | "qualified" | "meeting_scheduled" | "won" | "lost";
export type HandoffStatus = "ai" | "requested" | "human";
export interface LeadListItem { id: string; instagramUserId: string | null; username: string | null; lastEventType: "comment" | "message" | string | null; lastMessagePreview: string | null; unread: boolean; activeMilestoneId: string | null; lastInboundAt: string | null; windowOpenUntil: string | null; createdAt: string; pipelineStage: PipelineStage; ownerUserId: string | null; handoffStatus: HandoffStatus; }
export interface LeadDetail extends LeadListItem { tenantId: string; customerId: string | null; }
export type LeadScoreBand = "cold" | "warm" | "hot" | "very_hot";
export interface LeadIntelligence { leadId: string; tenantId: string; intent: string | null; need: string | null; budgetValue: number | null; budgetText: string | null; location: string | null; score: number; scoreBand: LeadScoreBand; scoreReasons: string[]; createdAt: string; updatedAt: string; }
export interface LeadIntelligenceHistoryEntry { id: string; leadId: string; tenantId: string; intent: string | null; need: string | null; budgetValue: number | null; budgetText: string | null; location: string | null; score: number; scoreBand: LeadScoreBand; scoreReasons: string[]; createdAt: string; }
export type ScoringRuleField = "budget_value" | "intent" | "need" | "location";
export type ScoringRuleOperator = "gte" | "lte" | "eq" | "exists";
export type ScoringRuleDefinition = { kind: "field_compare"; field: ScoringRuleField; operator: ScoringRuleOperator; value?: number | string } | { kind: "milestone_completed"; milestoneId: string };
export interface ScoringRule { id: string; tenantId: string; name: string; definition: ScoringRuleDefinition; points: number; enabled: boolean; createdAt: string; updatedAt: string; }
export interface TenantMember { userId: string; email: string; role: "owner"; }
export interface LeadNote { id: string; leadId: string; authorUserId: string | null; body: string; createdAt: string; }
export interface Tag { id: string; tenantId: string; name: string; createdAt: string; }
export interface LeadTag { tagId: string; name: string; source: "manual" | "automatic"; }
export type DealStage = "open" | "won" | "lost";
export interface Deal { id: string; tenantId: string; customerId: string; leadId: string; stage: DealStage; value: number | null; currency: string; ownerUserId: string | null; wonAt: string | null; lostAt: string | null; createdAt: string; }
export type TimelineEntry =
  | { kind: "event"; source: "event"; id: string; occurredAt: string; eventType: string; text: string | null; username: string | null; matchedKeyword: string | null }
  | { kind: "activity"; source: "activity"; id: string; occurredAt: string; type: string; summary: string; actorUserId: string | null }
  | { kind: "reply"; source: "reply"; id: string; occurredAt: string; channel: "dm" | "comment"; engine: "rule_based" | "ai_generated" | "human"; text: string };
export interface TimelinePage { entries: TimelineEntry[]; hasMore: boolean; nextCursor: string | null; }
