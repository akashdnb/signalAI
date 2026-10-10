import { loadSession, clearSession, ApiError, type Campaign } from "../api";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export interface CampaignPresetInput {
  name: string;
  keywords: string[];
  preset: {
    triggerSource: "comment" | "message" | "both";
    replyChannel: "dm" | "comment" | "both";
    replyMode: "rule_based" | "ai_generated";
    tone: "professional" | "friendly" | "casual" | "professional_and_friendly";
    language: "auto" | "en" | "hi";
    defaultReplyTemplate: string;
    description: string;
    ctaLink?: string | null;
    useKnowledgeBase?: boolean;
    milestones?: Array<{ goalDescription: string; captureFields: string[] }>;
  };
}

/**
 * Creates a fully configured starter journey in one server-side transaction.
 * Unlike the legacy createCampaign + PATCH + milestones sequence, a failed
 * preset operation cannot leave a campaign behind without its configuration.
 */
export async function createCampaignFromPreset(
  tenantId: string,
  input: CampaignPresetInput,
): Promise<Campaign> {
  const session = loadSession();
  const response = await fetch(`${API_BASE}/tenants/${tenantId}/campaigns/from-preset`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = await response.json();
      message = body.error ?? message;
    } catch {
      // Keep statusText when the server did not return JSON.
    }
    if (response.status === 401 || response.status === 403) clearSession();
    throw new ApiError(response.status, message);
  }

  return response.json() as Promise<Campaign>;
}
