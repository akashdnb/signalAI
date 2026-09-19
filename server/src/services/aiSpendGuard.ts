import type { Pool } from "pg";
import { countRecentAiCalls, deleteAiCallUsage, recordAiCall } from "../db/aiCallUsage.js";

/**
 * B10: hard per-account AI spend ceiling, enforced before the provider
 * call. Modeled as a swappable dependency (like LLMProvider) rather than a
 * pool+accountId pair threaded through replyEngine/milestoneEngine
 * directly, so those modules stay persistence-agnostic and a test can drop
 * in `ALLOW_ALL_SPEND_GUARD` with no DB involved.
 */
export interface AiSpendGuard {
  /**
   * Returns true and records the call if under the cap; returns false
   * (and records nothing) if the cap is already reached. Count-then-insert
   * is not atomic under concurrent leads on the same account (unlike
   * accountSends.ts's `tryReserveSend`, which was made atomic for R7-01) —
   * that race is accepted here because the cost of losing it is bounded
   * and cheap (R7-03): with N workers concurrently processing different
   * leads on the same account, which `key_strict_fifo` does by design, the
   * overshoot can be up to N−1 calls over the cap, not just one.
   */
  tryConsume(): Promise<boolean>;
  /**
   * R7-02: reverses a successful `tryConsume()` whose gated provider call
   * then failed at the transport layer. Consuming before the call is right
   * for cost safety (nothing calls the provider without a reservation),
   * but a provider outage would otherwise burn real cap on calls that were
   * never actually billed, and could leave an account locked out for the
   * rest of the 24h window even after the provider recovers. Only ever
   * call this for a transport-layer failure — an output-validation
   * rejection or a parse failure means the call DID complete (and was
   * billed), so it must stay counted.
   */
  release(): Promise<void>;
}

/** No metering — used where no real caller/account context exists (tests, or a future trusted internal caller that deliberately opts out). */
export const ALLOW_ALL_SPEND_GUARD: AiSpendGuard = {
  async tryConsume() {
    return true;
  },
  async release() {},
};

export function createAccountSpendGuard(
  pool: Pool,
  tenantId: string,
  instagramAccountId: string,
  dailyCap: number,
): AiSpendGuard {
  let reservationId: string | null = null;

  return {
    async tryConsume() {
      const count = await countRecentAiCalls(pool, instagramAccountId);
      if (count >= dailyCap) return false;
      reservationId = await recordAiCall(pool, tenantId, instagramAccountId);
      return true;
    },
    async release() {
      if (!reservationId) return;
      await deleteAiCallUsage(pool, reservationId);
      reservationId = null;
    },
  };
}
