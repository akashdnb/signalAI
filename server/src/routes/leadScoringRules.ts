import { Router } from "express";
import type { PoolClient } from "pg";
import { getPool } from "../db/pool.js";
import {
  listScoringRules,
  createScoringRule,
  updateScoringRule,
  deleteScoringRule,
  validateScoringRuleDefinition,
  validateScoringRuleName,
  validateScoringRulePoints,
  validateOptionalBoolean,
  assertScoringRuleMilestoneOwnership,
  ScoringRuleMilestoneNotFoundError,
  type ScoringRuleDefinition,
} from "../db/leadScoringRules.js";
import { requireTenantSession } from "../lib/tenantAuth.js";
import { getBoss } from "../queue/boss.js";
import { enqueueTenantScoringRefresh } from "../queue/tenantScoringRefreshQueue.js";

/**
 * SLICE C: tenant-configurable custom lead-scoring rules — a clean
 * extension point on top of the deterministic base score (leadScoring.ts),
 * never an eval/expression target. Every route below is tenant-scoped via
 * requireTenantSession + the tenantId in every db/leadScoringRules.ts call.
 */
export const leadScoringRulesRouter = Router();

leadScoringRulesRouter.use("/tenants/:tenantId", requireTenantSession);

/** Thrown only for 400-shaped problems (bad input) — distinguished from an infra failure, which propagates unconverted to app.ts's global 500 handler. */
class ScoringRuleValidationError extends Error {}

/**
 * Structural validation only (name/definition shape/points/enabled) — pure
 * and synchronous-in-spirit, no DB access, so a malformed-input request
 * never even reaches a connection. Kept separate from the milestone
 * ownership check below specifically so a DB failure in THAT check can
 * never be mistaken for one of these.
 */
function validateMutationShape(
  body: Record<string, unknown> | undefined,
  opts: { requireFields: boolean },
): { name?: string; definition?: ScoringRuleDefinition; points?: number; enabled?: boolean } {
  try {
    const name = body?.name !== undefined || opts.requireFields ? validateScoringRuleName(body?.name) : undefined;
    const definition = body?.definition !== undefined || opts.requireFields ? validateScoringRuleDefinition(body?.definition) : undefined;
    const points = body?.points !== undefined || opts.requireFields ? validateScoringRulePoints(body?.points) : undefined;
    const enabled = validateOptionalBoolean(body?.enabled, "enabled");
    return { name, definition, points, enabled };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ScoringRuleValidationError(message);
  }
}

async function validateMutationInput(
  tenantId: string,
  body: Record<string, unknown> | undefined,
  opts: { requireFields: boolean },
): Promise<{ name?: string; definition?: ScoringRuleDefinition; points?: number; enabled?: boolean }> {
  const input = validateMutationShape(body, opts);

  // Configuration validation (not scoring evaluation): a milestone_completed
  // rule must reference a real, active milestone belonging to THIS tenant.
  // Only ScoringRuleMilestoneNotFoundError is a 400 — any other failure
  // here (e.g. the DB connection itself) is an infra problem and must be
  // allowed to propagate to the global error handler as a 500, not get
  // folded into "bad input."
  if (input.definition) {
    try {
      await assertScoringRuleMilestoneOwnership(getPool(), tenantId, input.definition);
    } catch (err) {
      if (err instanceof ScoringRuleMilestoneNotFoundError) {
        throw new ScoringRuleValidationError(err.message);
      }
      throw err;
    }
  }

  return input;
}

/**
 * Runs `mutate` (a create/update/delete against the DB) and the tenant
 * scoring-refresh enqueue in ONE transaction: both commit together, or
 * neither does. Without this, a queue-send failure after a committed rule
 * mutation would leave existing lead intelligence silently stale with no
 * pending refresh to ever fix it — and a transaction that rolls back for
 * any other reason could otherwise still leave an orphaned refresh job
 * behind for a mutation that never actually happened.
 *
 * Reuses the existing Queryable (Pool | PoolClient) pattern already used
 * throughout db/leadScoringRules.ts — no new "WithClient" variants needed,
 * the same functions just get called with a checked-out client instead of
 * the pool.
 */
async function mutateAndRefresh<T>(tenantId: string, mutate: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await mutate(client);
    await enqueueTenantScoringRefresh(await getBoss(), tenantId, { client });
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

leadScoringRulesRouter.get("/tenants/:tenantId/scoring-rules", async (req, res) => {
  const rules = await listScoringRules(getPool(), req.params.tenantId!);
  return res.status(200).json({ rules });
});

leadScoringRulesRouter.post("/tenants/:tenantId/scoring-rules", async (req, res) => {
  const tenantId = req.params.tenantId!;
  let input: Awaited<ReturnType<typeof validateMutationInput>>;
  try {
    input = await validateMutationInput(tenantId, req.body, { requireFields: true });
  } catch (err) {
    if (err instanceof ScoringRuleValidationError) return res.status(400).json({ error: err.message });
    throw err;
  }

  try {
    const rule = await mutateAndRefresh(tenantId, (client) =>
      createScoringRule(client, tenantId, {
        name: input.name!,
        definition: input.definition!,
        points: input.points!,
        enabled: input.enabled ?? true,
      }),
    );
    return res.status(201).json({ rule });
  } catch (err) {
    // Everything past validation is an infra failure (DB error, queue
    // enqueue failure) — never a 400. The transaction already rolled back,
    // so no rule was persisted and no refresh job was left behind.
    // eslint-disable-next-line no-console
    console.error("Failed to create scoring rule (rolled back)", err);
    return res.status(500).json({ error: "failed to create scoring rule" });
  }
});

leadScoringRulesRouter.patch("/tenants/:tenantId/scoring-rules/:id", async (req, res) => {
  const tenantId = req.params.tenantId!;
  const id = req.params.id!;
  let input: Awaited<ReturnType<typeof validateMutationInput>>;
  try {
    input = await validateMutationInput(tenantId, req.body, { requireFields: false });
  } catch (err) {
    if (err instanceof ScoringRuleValidationError) return res.status(400).json({ error: err.message });
    throw err;
  }

  // Not-found is resolved BEFORE opening the mutating transaction — a
  // missing rule is a 404, never a rolled-back 500, and never enqueues a
  // refresh for a mutation that didn't happen.
  try {
    let notFound = false;
    const rule = await mutateAndRefresh(tenantId, async (client) => {
      const updated = await updateScoringRule(client, tenantId, id, input);
      if (!updated) {
        notFound = true;
        // Throwing aborts the transaction (ROLLBACK) and skips the
        // refresh enqueue — there is nothing to refresh for a mutation
        // that affected zero rows.
        throw new Error("not found");
      }
      return updated;
    });
    return res.status(200).json({ rule });
  } catch (err) {
    if (err instanceof Error && err.message === "not found") {
      return res.status(404).json({ error: "scoring rule not found for this tenant" });
    }
    // eslint-disable-next-line no-console
    console.error("Failed to update scoring rule (rolled back)", err);
    return res.status(500).json({ error: "failed to update scoring rule" });
  }
});

leadScoringRulesRouter.delete("/tenants/:tenantId/scoring-rules/:id", async (req, res) => {
  const tenantId = req.params.tenantId!;
  const id = req.params.id!;

  try {
    await mutateAndRefresh(tenantId, async (client) => {
      const deleted = await deleteScoringRule(client, tenantId, id);
      if (!deleted) throw new Error("not found"); // same rollback-and-skip-refresh reasoning as PATCH above
      return deleted;
    });
    return res.status(204).send();
  } catch (err) {
    if (err instanceof Error && err.message === "not found") {
      return res.status(404).json({ error: "scoring rule not found for this tenant" });
    }
    // eslint-disable-next-line no-console
    console.error("Failed to delete scoring rule (rolled back)", err);
    return res.status(500).json({ error: "failed to delete scoring rule" });
  }
});
