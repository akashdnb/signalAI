import { describe, expect, it, vi } from "vitest";
import { CompanyCapability } from "../capabilities/company.js";
import { ConnectorsClient } from "../capabilities/connectorsClient.js";

describe("company capability", () => {
  it("normalizes search input and preserves tenant/correlation context", async () => {
    const searchCompanies = vi.fn().mockResolvedValue({
      operation: "company.search",
      companies: [],
      correlationId: "corr-1",
    });
    const client = { searchCompanies } as unknown as ConnectorsClient;
    const capability = new CompanyCapability(client);

    await capability.search({ query: "  SignalAI  ", limit: 200 }, {
      tenantId: "tenant-1",
      correlationId: "corr-1",
      actor: "service",
    });

    expect(searchCompanies).toHaveBeenCalledWith(
      { query: "SignalAI", limit: 100 },
      "corr-1",
      "tenant-1",
    );
  });

  it("rejects company get without an identifier", async () => {
    const capability = new CompanyCapability({} as ConnectorsClient);
    await expect(capability.get({}, {
      tenantId: "tenant-1",
      correlationId: "corr-2",
      actor: "service",
    })).rejects.toThrow("company_identifier_required");
  });
});
