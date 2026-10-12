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
    (items) => {
      // Older server deployments return the full campaign array and ignore
      // query parameters. Apply the same list controls locally for that
      // response shape, while preserving the server-paginated path above.
      const query = filters.q?.trim().toLocaleLowerCase();
      let campaigns = items as Campaign[];

      if (query) {
        campaigns = campaigns.filter((campaign) =>
          [
            campaign.name,
            campaign.description ?? "",
            ...campaign.keywords,
          ].some((value) => value.toLocaleLowerCase().includes(query)),
        );
      }

      if (filters.status && filters.status !== "all") {
        campaigns = campaigns.filter((campaign) => {
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
        campaigns = campaigns.filter((campaign) => campaign.triggerSource === filters.trigger);
      }

      const sort = filters.sort ?? "updated_desc";
      campaigns = [...campaigns].sort((a, b) => {
        if (sort === "name_asc" || sort === "name_desc") {
          const compared = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
          return sort === "name_asc" ? compared : -compared;
        }
        const aTime = Date.parse(a.updatedAt) || 0;
        const bTime = Date.parse(b.updatedAt) || 0;
        return sort === "updated_asc" ? aTime - bTime : bTime - aTime;
      });

      const total = campaigns.length;
      const totalPages = Math.ceil(total / pageSize);
      const safePage = totalPages === 0 ? 1 : Math.min(Math.max(1, page), totalPages);
      const start = (safePage - 1) * pageSize;

      return {
        items: campaigns.slice(start, start + pageSize),
        page: safePage,
        pageSize,
        total,
        totalPages,
      };
    },
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
