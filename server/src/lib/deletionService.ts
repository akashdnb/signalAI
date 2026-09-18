import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { findLeadsByInstagramUserIdAcrossTenants, hardScrubLead } from "../db/pii.js";

export type DeletionStatus = "pending" | "complete";

// Confirmation-code status is fine in memory: it's a short-lived receipt for
// Meta's status URL, not the deletion record itself (that's the DB row's
// deleted_at). Does not survive a restart — acceptable for what it is.
const statusByCode = new Map<string, DeletionStatus>();

/**
 * OPEN QUESTION, resolve before App Review submission: the callback's
 * user_id is the Instagram-scoped id of whoever authorized the app. For an
 * Instagram Login app that is the connected professional account (the
 * tenant/creator), not an end-user commenter — so in the common case this
 * scrubs the tenant's own leads, which is very likely correct, but the
 * product/legal question of "does a creator's own account-deletion request
 * also erase their leads' conversation history" has not been decided. This
 * implementation scrubs every lead matching the id, across tenants, which
 * is the safer (more deletes, not fewer) default until that's settled.
 */
export async function requestDeletion(
  pool: Pool,
  metaUserId: string,
): Promise<{ confirmationCode: string }> {
  const confirmationCode = randomUUID();
  statusByCode.set(confirmationCode, "pending");

  const matches = await findLeadsByInstagramUserIdAcrossTenants(pool, metaUserId);
  for (const match of matches) {
    await hardScrubLead(pool, match.tenantId, match.leadId);
  }

  statusByCode.set(confirmationCode, "complete");
  return { confirmationCode };
}

export function getDeletionStatus(confirmationCode: string): DeletionStatus | null {
  return statusByCode.get(confirmationCode) ?? null;
}
