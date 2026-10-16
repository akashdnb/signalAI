export interface CompanySearchInput {
  query: string;
  limit?: number;
}

export interface CompanyGetInput {
  domain?: string;
  companyName?: string;
  linkedinUrl?: string;
}

export interface CompanyCandidate {
  providerRecordId: string | null;
  name: string | null;
  domain: string | null;
  linkedinUrl: string | null;
  websiteUrl: string | null;
  industry: string | null;
  employeeCount: number | null;
  location: string | null;
}

export interface CompanyEvidence extends CompanyCandidate {
  description: string | null;
  sourceUrl: string | null;
  rawMetadata: Record<string, unknown>;
}

export interface CompanySearchResult {
  operation: "company.search";
  companies: CompanyCandidate[];
  correlationId: string;
}

export interface CompanyGetResult {
  operation: "company.get";
  company: CompanyEvidence;
  correlationId: string;
}
