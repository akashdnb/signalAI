import { config } from "../config.js";
import type {
  CompanyEvidence,
  CompanyGetInput,
  CompanySearchInput,
  CompanySearchResult,
  CompanyGetResult,
  CompanyCandidate,
} from "./types.js";

export class ConnectorError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

interface ConnectorCompanyCandidate {
  provider_record_id?: string | null;
  name?: string | null;
  domain?: string | null;
  linkedin_url?: string | null;
  website_url?: string | null;
  industry?: string | null;
  employee_count?: number | null;
  location?: string | null;
}

interface ConnectorCompanyEvidence extends ConnectorCompanyCandidate {
  description?: string | null;
  source_url?: string | null;
  raw_metadata?: Record<string, unknown>;
}

export class ConnectorsClient {
  constructor(
    private readonly baseUrl = config.connectorsBaseUrl,
    private readonly serviceToken = config.serviceToken,
  ) {}

  async searchCompanies(
    input: CompanySearchInput,
    correlationId: string,
    tenantId: string,
  ): Promise<CompanySearchResult> {
    const payload = await this.request<{ operation: "company.search"; companies: ConnectorCompanyCandidate[]; correlation_id: string }>(
      "/v1/company/search",
      input,
      correlationId,
      tenantId,
    );

    return {
      operation: "company.search",
      correlationId: payload.correlation_id,
      companies: payload.companies.map(mapCandidate),
    };
  }

  async getCompany(
    input: CompanyGetInput,
    correlationId: string,
    tenantId: string,
  ): Promise<CompanyGetResult> {
    const payload = await this.request<{ operation: "company.get"; company: ConnectorCompanyEvidence; correlation_id: string }>(
      "/v1/company/get",
      input,
      correlationId,
      tenantId,
    );

    return {
      operation: "company.get",
      correlationId: payload.correlation_id,
      company: mapEvidence(payload.company),
    };
  }

  private async request<T>(
    path: string,
    body: unknown,
    correlationId: string,
    tenantId: string,
  ): Promise<T> {
    if (!this.baseUrl || !this.serviceToken) {
      throw new ConnectorError(503, "connectors_not_configured");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.connectorsRequestTimeoutMs);

    try {
      const response = await fetch(`${this.baseUrl.replace(/\/+$/, "")}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-signalai-service-token": this.serviceToken,
          "x-signalai-tenant-id": tenantId,
          "x-correlation-id": correlationId,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const text = await response.text();
      let parsed: unknown = {};
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch {
        parsed = { error: "invalid_connector_response" };
      }

      if (!response.ok) {
        const message =
          typeof parsed === "object" && parsed !== null && "detail" in parsed
            ? String((parsed as { detail: unknown }).detail)
            : "connector_request_failed";
        throw new ConnectorError(response.status, message);
      }

      return parsed as T;
    } catch (error) {
      if (error instanceof ConnectorError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ConnectorError(504, "connector_request_timeout");
      }
      throw new ConnectorError(503, "connector_unavailable");
    } finally {
      clearTimeout(timeout);
    }
  }
}

function mapCandidate(value: ConnectorCompanyCandidate): CompanyCandidate {
  return {
    providerRecordId: value.provider_record_id ?? null,
    name: value.name ?? null,
    domain: value.domain ?? null,
    linkedinUrl: value.linkedin_url ?? null,
    websiteUrl: value.website_url ?? null,
    industry: value.industry ?? null,
    employeeCount: value.employee_count ?? null,
    location: value.location ?? null,
  };
}

function mapEvidence(value: ConnectorCompanyEvidence): CompanyEvidence {
  return {
    ...mapCandidate(value),
    description: value.description ?? null,
    sourceUrl: value.source_url ?? null,
    rawMetadata: value.raw_metadata ?? {},
  };
}
