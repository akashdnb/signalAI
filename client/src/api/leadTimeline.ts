import { ApiError, loadSession, type TimelinePage } from "../api";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

/**
 * Inbox-specific timeline pagination. The shared api method intentionally
 * keeps its legacy page size; Inbox uses a smaller initial window so opening
 * a conversation is fast and the user starts at the newest messages.
 */
export async function getLeadTimelinePage(
  tenantId: string,
  leadId: string,
  options?: { before?: string; limit?: number },
): Promise<TimelinePage> {
  const params = new URLSearchParams();
  if (options?.before) params.set("before", options.before);
  if (options?.limit) params.set("limit", String(options.limit));
  const qs = params.toString();
  const session = loadSession();
  const response = await fetch(
    `${API_BASE}/tenants/${tenantId}/leads/${leadId}/timeline${qs ? `?${qs}` : ""}`,
    {
      headers: {
        "Content-Type": "application/json",
        ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
      },
    },
  );

  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = await response.json();
      message = body.error ?? message;
    } catch {
      // Keep the HTTP status text when the response is not JSON.
    }
    throw new ApiError(response.status, message);
  }

  return response.json() as Promise<TimelinePage>;
}
