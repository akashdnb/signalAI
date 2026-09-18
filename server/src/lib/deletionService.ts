import { randomUUID } from "node:crypto";

export type DeletionStatus = "pending" | "complete";

/**
 * Stub until the B2 PII table exists. Once it does, `requestDeletion` hard-scrubs
 * the PII row for the lead(s) tied to this Meta user_id (soft-deleting the row,
 * per Phase 1 Platform Foundations) instead of just recording a status in memory.
 */
const statusByCode = new Map<string, DeletionStatus>();

export function requestDeletion(metaUserId: string): { confirmationCode: string } {
  const confirmationCode = randomUUID();
  statusByCode.set(confirmationCode, "pending");

  // TODO(B2): look up lead(s) by metaUserId via the identity spine, hard-scrub
  // the PII table row, and mark complete. Metadata-only for now.
  void metaUserId;
  statusByCode.set(confirmationCode, "complete");

  return { confirmationCode };
}

export function getDeletionStatus(confirmationCode: string): DeletionStatus | null {
  return statusByCode.get(confirmationCode) ?? null;
}
