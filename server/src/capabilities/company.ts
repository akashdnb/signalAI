import { ConnectorsClient } from "./connectorsClient.js";
import type { CompanyGetInput, CompanySearchInput } from "./types.js";

export interface CapabilityContext {
  tenantId: string;
  correlationId: string;
  actor: "service" | "user";
}

export class CompanyCapability {
  constructor(private readonly connectors: ConnectorsClient) {}

  async search(input: CompanySearchInput, context: CapabilityContext) {
    const query = input.query.trim();
    if (!query) throw new CapabilityInputError("company_search_query_required");

    const limit = Math.min(Math.max(input.limit ?? 10, 1), 100);
    return this.connectors.searchCompanies(
      { query, limit },
      context.correlationId,
      context.tenantId,
    );
  }

  async get(input: CompanyGetInput, context: CapabilityContext) {
    const domain = input.domain?.trim() || undefined;
    const companyName = input.companyName?.trim() || undefined;
    const linkedinUrl = input.linkedinUrl?.trim() || undefined;

    if (!domain && !companyName && !linkedinUrl) {
      throw new CapabilityInputError("company_identifier_required");
    }

    return this.connectors.getCompany(
      { domain, companyName, linkedinUrl },
      context.correlationId,
      context.tenantId,
    );
  }
}

export class CapabilityInputError extends Error {
  readonly statusCode = 400;
  readonly expose = true;
}
