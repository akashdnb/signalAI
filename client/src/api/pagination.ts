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
  from?: string;
  to?: string;
  qualification?: "qualified" | "unqualified";
  sort?: "activity_desc" | "activity_asc" | "created_desc" | "created_asc" | "stage_asc" | "stage_desc" | "username_asc" | "username_desc";
}

export interface CampaignListFilters {
  q?: string;
  status?: "all" | "live" | "paused" | "draft" | "needs_publishing";
  trigger?: "all" | "comment" | "message" | "both";
  sort?: "updated_desc" | "updated_asc" | "name_asc" | "name_desc";
}

async function getPage<T>(
  path: string,
  adaptLegacyArray?: (items: unknown[]) => T,
): Promise<T> {
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
      localStorage.removeItem("signalai.session");
    }
    throw new ApiError(response.status, message);
  }

  const body = await response.json();
  // Keep the paginated contract as the primary path, while tolerating legacy
  // list responses from older deployments and fixtures during rollout.
  if (Array.isArray(body)) {
    if (adaptLegacyArray) return adaptLegacyArray(body);
    return {
      items: body,
      page: 1,
      pageSize: body.length,
      total: body.length,
      totalPages: body.length > 0 ? 1 : 0,
    } as T;
  }
  return body as T;
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
      from: filters.from,
      to: filters.to,
      qualification: filters.qualification,
      sort: filters.sort,
    })}`,
  );
}

const CAMPAIGN_FETCH_PAGE_SIZE = 50;

function campaignStatusForApi(status: CampaignListFilters["status"]): "all" | "active" | "inactive" {
  // The deployed campaigns API still accepts the legacy active/inactive
  // contract. Fetch the coarse enabled state from the server, then apply the
  // richer product statuses (Live, Paused, Draft, Needs publishing) locally.
  switch (status) {
    case "live":
    case "needs_publishing":
      return "active";
    case "paused":
    case "draft":
      return "inactive";
    default:
      return "all";
  }
}

export async function getCampaignsPage(
  tenantId: string,
  page: number,
  pageSize = 10,
  filters: CampaignListFilters = {},
): Promise<PaginatedResponse<Campaign>> {
  const serverStatus = campaignStatusForApi(filters.status);
  const fetchServerPage = (serverPage: number) =>
    getPage<PaginatedResponse<Campaign>>(
      `/tenants/${tenantId}/campaigns${queryString({
        page: serverPage,
        pageSize: CAMPAIGN_FETCH_PAGE_SIZE,
        q: filters.q,
        status: serverStatus,
        trigger: filters.trigger,
        sort: filters.sort,
      })}`,
      (items) => ({
        items: items as Campaign[],
        page: 1,
        pageSize: items.length,
        total: items.length,
        totalPages: 1,
      }),
    );

  // Some deployments return the complete legacy array, while newer ones return
  // a paginated object. Fetch every page of the coarse server-side result before
  // applying the more specific UI status locally, so status counts and pages
  // remain correct when a workspace contains more campaigns than one page.
  const firstPage = await fetchServerPage(1);
  if (!firstPage || !Array.isArray(firstPage.items)) {
    throw new ApiError(502, "Campaign list returned an unexpected response");
  }

  const campaigns = [...firstPage.items];
  const serverTotalPages =
    Number.isFinite(firstPage.totalPages) && firstPage.totalPages > 0
      ? Math.floor(firstPage.totalPages)
      : 1;

  for (let serverPage = 2; serverPage <= serverTotalPages; serverPage += 1) {
    const nextPage = await fetchServerPage(serverPage);
    if (!nextPage || !Array.isArray(nextPage.items)) {
      throw new ApiError(502, "Campaign list returned an unexpected response");
    }
    if (nextPage.items.length === 0) break;
    campaigns.push(...nextPage.items);
  }

  const query = filters.q?.trim().toLocaleLowerCase();
  let filtered = campaigns;

  if (query) {
    filtered = filtered.filter((campaign) =>
      [
        campaign.name,
        campaign.description ?? "",
        ...(campaign.keywords ?? []),
      ].some((value) => value.toLocaleLowerCase().includes(query)),
    );
  }

  if (filters.status && filters.status !== "all") {
    filtered = filtered.filter((campaign) => {
      switch (filters.status) {
        case "live":
          return campaign.published === true && campaign.enabled;
        case "paused":
          return campaign.published === true && !campaign.enabled;
        case "draft":
          return campaign.published !== true && !campaign.enabled;
        case "needs_publishing":
          return campaign.published !== true && campaign.enabled;
      }
    });
  }

  if (filters.trigger && filters.trigger !== "all") {
    filtered = filtered.filter((campaign) => campaign.triggerSource === filters.trigger);
  }

  const sort = filters.sort ?? "updated_desc";
  filtered = [...filtered].sort((a, b) => {
    if (sort === "name_asc" || sort === "name_desc") {
      const compared = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      return sort === "name_asc" ? compared : -compared;
    }
    const aTime = Date.parse(a.updatedAt) || 0;
    const bTime = Date.parse(b.updatedAt) || 0;
    return sort === "updated_asc" ? aTime - bTime : bTime - aTime;
  });

  const total = filtered.length;
  const safePageSize = Math.max(1, pageSize);
  const totalPages = Math.ceil(total / safePageSize);
  const safePage = totalPages === 0 ? 1 : Math.min(Math.max(1, page), totalPages);
  const startIndex = (safePage - 1) * safePageSize;

  return {
    items: filtered.slice(startIndex, startIndex + safePageSize),
    page: safePage,
    pageSize: safePageSize,
    total,
    totalPages,
  };
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
