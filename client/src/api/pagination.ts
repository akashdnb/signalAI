import { ApiError, loadSession, type Campaign, type HandoffStatus, type KnowledgeBaseDocument, type LeadListItem, type PipelineStage } from "../api";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface LeadListFilters {
  stage?: PipelineStage;
  ownerUserId?: string;
  q?: string;
  tagId?: string;
  handoffStatus?: HandoffStatus;
  unreadOnly?: boolean;
}

export interface CampaignListFilters {
  q?: string;
  status?: "all" | "active" | "inactive";
  trigger?: "all" | "comment" | "message" | "both";
  sort?: "updated_desc" | "updated_asc" | "name_asc" | "name_desc";
}

async function getPage<T>(path: string): Promise<T> {
  const session = loadSession();
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
    },
  });

  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = await response.json();
      message = body.error ?? message;
    } catch {
      // Keep the HTTP status text when the response is not JSON.
    }
    if (response.status === 401 || response.status === 403) {
      // Match the shared API client's session handling.
      localStorage.removeItem("signalai.session");
    }
    throw new ApiError(response.status, message);
  }

  return response.json() as Promise<T>;
}

function queryString(values: Record<string, string | number | boolean | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function getLeadsPage(
  tenantId: string,
  page: number,
  pageSize = 20,
  filters: LeadListFilters = {},
): Promise<PaginatedResponse<LeadListItem>> {
  return getPage<PaginatedResponse<LeadListItem>>(
    `/tenants/${tenantId}/leads${queryString({
      page,
      pageSize,
      stage: filters.stage,
      ownerUserId: filters.ownerUserId,
      q: filters.q,
      tagId: filters.tagId,
      handoffStatus: filters.handoffStatus,
      unread: filters.unreadOnly,
    })}`,
  );
}

export function getCampaignsPage(
  tenantId: string,
  page: number,
  pageSize = 10,
  filters: CampaignListFilters = {},
): Promise<PaginatedResponse<Campaign>> {
  return getPage<PaginatedResponse<Campaign>>(
    `/tenants/${tenantId}/campaigns${queryString({
      page,
      pageSize,
      q: filters.q,
      status: filters.status,
      trigger: filters.trigger,
      sort: filters.sort,
    })}`,
  );
}

export function getKnowledgeBaseDocumentsPage(
  tenantId: string,
  page: number,
  pageSize = 20,
): Promise<PaginatedResponse<KnowledgeBaseDocument>> {
  return getPage<PaginatedResponse<KnowledgeBaseDocument>>(
    `/tenants/${tenantId}/knowledge-base${queryString({ page, pageSize })}`,
  );
}
