import type { Pool } from "pg";
import { countRecentAiCalls, recordAiCall } from "../db/aiCallUsage.js";

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
   * (and records nothing) if the cap is already reached. Not perfectly
   * atomic under concurrent leads on the same account — same accepted
   * trade-off as accountSends.ts's send-rate check, and the consequence of
   * losing the race is one call over the cap, not an unbounded one.
   */
  tryConsume(): Promise<boolean>;
}

/** No metering — used where no real caller/account context exists (tests, or a future trusted internal caller that deliberately opts out). */
export const ALLOW_ALL_SPEND_GUARD: AiSpendGuard = {
  async tryConsume() {
    return true;
  },
};

export function createAccountSpendGuard(
  pool: Pool,
  tenantId: string,
  instagramAccountId: string,
  dailyCap: number,
): AiSpendGuard {
  return {
    async tryConsume() {
      const count = await countRecentAiCalls(pool, instagramAccountId);
      if (count >= dailyCap) return false;
      await recordAiCall(pool, tenantId, instagramAccountId);
      return true;
    },
  };
}
