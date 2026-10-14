import { Router } from "express";
import { config } from "../config.js";
import { getPool } from "../db/pool.js";
import { verifyBearerSession } from "../lib/tenantAuth.js";
import { getTenantMemberRole } from "../db/tenantMembers.js";
import { getTokenUsageSince } from "../db/tokenUsage.js";
import {
  createBillingAccount,
  getBillingAccount,
  getBillingAccountByOwner,
  listCoveredWorkspaces,
  countCoveredWorkspaces,
  addWorkspaceToBillingAccount,
  removeWorkspaceFromBillingAccount,
  setWorkspaceTokenCap,
  type BillingAccount,
} from "../db/billingAccounts.js";
import { AGENCY_PLAN_LABEL, AGENCY_PER_WORKSPACE_TOKEN_ALLOWANCE } from "../lib/planTiers.js";
import {
  isAgencyBillingConfigured,
  createAgencyCheckoutSession,
  syncAgencySubscriptionQuantity,
} from "../lib/agencyBilling.js";
import { Sentry } from "../lib/sentry.js";

/**
 * Agency Bulk Billing — plan management. These are owner-scoped (the personal
 * email paying the bill), not tenant-scoped: a plan spans many workspaces, so
 * authorization is "are you this plan's owner" plus, for adding a workspace,
 * "are you that workspace's owner" — never requireTenantRole against a single
 * :tenantId.
 */
export const billingAccountsRouter = Router();

const DEFAULT_WORKSPACE_LIMIT = 10;
const MAX_WORKSPACE_LIMIT = 100;

function currentMonthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function serializeAccount(account: BillingAccount) {
  return {
    id: account.id,
    plan: account.plan,
    planLabel: AGENCY_PLAN_LABEL,
    workspaceLimit: account.workspaceLimit,
    billingStatus: account.billingStatus,
    billingConfigured: isAgencyBillingConfigured(),
  };
}

/** Full plan view: the account, its covered workspaces (with per-cycle usage + cap), and the aggregate pool usage. */
async function buildAccountDetail(account: BillingAccount) {
  const pool = getPool();
  const [covered, count] = await Promise.all([
    listCoveredWorkspaces(pool, account.id),
    countCoveredWorkspaces(pool, account.id),
  ]);
  const cycleStart = currentMonthStart();

  const workspaces = await Promise.all(
    covered.map(async (workspace) => {
      const usage = await getTokenUsageSince(pool, workspace.tenantId, cycleStart);
      return {
        tenantId: workspace.tenantId,
        name: workspace.name,
        perWorkspaceTokenCap: workspace.perWorkspaceTokenCap,
        tokensUsedThisCycle: usage.totalTokens,
      };
    }),
  );

  const pooledTokens = workspaces.reduce((sum, w) => sum + w.tokensUsedThisCycle, 0);

  return {
    billingAccount: serializeAccount(account),
    cycleStart,
    pool: {
      allowance: count * AGENCY_PER_WORKSPACE_TOKEN_ALLOWANCE,
      used: pooledTokens,
    },
    workspaces,
  };
}

/** Create the caller's agency plan. One plan per owner — 409 if they already have one. */
billingAccountsRouter.post("/billing-accounts", async (req, res) => {
  const session = await verifyBearerSession(req);
  if (!session) return res.status(401).json({ error: "missing or invalid session" });

  const rawLimit = req.body?.workspaceLimit;
  let workspaceLimit = DEFAULT_WORKSPACE_LIMIT;
  if (rawLimit !== undefined) {
    if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > MAX_WORKSPACE_LIMIT) {
      return res.status(400).json({ error: `workspaceLimit must be an integer between 1 and ${MAX_WORKSPACE_LIMIT}` });
    }
    workspaceLimit = rawLimit;
  }

  const pool = getPool();
  if (await getBillingAccountByOwner(pool, session.userId)) {
    return res.status(409).json({ error: "you already own an agency plan" });
  }

  const account = await createBillingAccount(pool, session.userId, workspaceLimit);
  return res.status(201).json({ billingAccount: serializeAccount(account) });
});

/** The caller's own plan (billingAccount: null when they don't have one). */
billingAccountsRouter.get("/me/billing-account", async (req, res) => {
  const session = await verifyBearerSession(req);
  if (!session) return res.status(401).json({ error: "missing or invalid session" });

  const account = await getBillingAccountByOwner(getPool(), session.userId);
  if (!account) return res.json({ billingAccount: null });
  return res.json(await buildAccountDetail(account));
});

/**
 * Loads the plan named in :id and asserts the caller owns it. Returns the
 * account, or sends the right error and returns null (callers must stop).
 */
async function requireOwnedAccount(
  req: import("express").Request,
  res: import("express").Response,
): Promise<BillingAccount | null> {
  const session = await verifyBearerSession(req);
  if (!session) {
    res.status(401).json({ error: "missing or invalid session" });
    return null;
  }
  const account = await getBillingAccount(getPool(), req.params.id!);
  if (!account || account.ownerUserId !== session.userId) {
    // Same response whether it doesn't exist or isn't yours — never reveal
    // another user's plan id as "exists but forbidden".
    res.status(404).json({ error: "billing account not found" });
    return null;
  }
  return account;
}

billingAccountsRouter.get("/billing-accounts/:id", async (req, res) => {
  const account = await requireOwnedAccount(req, res);
  if (!account) return;
  return res.json(await buildAccountDetail(account));
});

/**
 * Cover a workspace. The caller must own the plan AND be the owner of the
 * workspace (not merely a member/admin) — the agency created these
 * workspaces, so they are the owner; this keeps v1 free of a consent
 * handshake. Enforces workspace_limit and rejects a workspace already covered
 * by any plan.
 */
billingAccountsRouter.post("/billing-accounts/:id/workspaces/:tenantId", async (req, res) => {
  const account = await requireOwnedAccount(req, res);
  if (!account) return;

  const pool = getPool();
  const role = await getTenantMemberRole(pool, req.params.tenantId!, account.ownerUserId);
  if (role !== "owner") {
    return res.status(403).json({ error: "you must be the owner of a workspace to add it to a plan" });
  }

  const result = await addWorkspaceToBillingAccount(pool, account.id, req.params.tenantId!);
  if (result === "limit_reached") {
    return res.status(409).json({ error: `plan is at its workspace limit (${account.workspaceLimit})` });
  }
  if (result === "already_covered") {
    return res.status(409).json({ error: "workspace is already covered by a plan" });
  }

  await syncAgencySubscriptionQuantity(account, await countCoveredWorkspaces(pool, account.id));
  return res.status(201).json(await buildAccountDetail(account));
});

/** Remove a workspace from the plan — it falls back to its own per-workspace billing. */
billingAccountsRouter.delete("/billing-accounts/:id/workspaces/:tenantId", async (req, res) => {
  const account = await requireOwnedAccount(req, res);
  if (!account) return;

  const pool = getPool();
  const removed = await removeWorkspaceFromBillingAccount(pool, account.id, req.params.tenantId!);
  if (!removed) return res.status(404).json({ error: "workspace is not covered by this plan" });

  await syncAgencySubscriptionQuantity(account, await countCoveredWorkspaces(pool, account.id));
  return res.json(await buildAccountDetail(account));
});

/** Set or clear a covered workspace's soft per-cycle token cap. */
billingAccountsRouter.patch("/billing-accounts/:id/workspaces/:tenantId", async (req, res) => {
  const account = await requireOwnedAccount(req, res);
  if (!account) return;

  const rawCap = req.body?.perWorkspaceTokenCap;
  let cap: number | null;
  if (rawCap === null || rawCap === undefined) {
    cap = null;
  } else if (Number.isInteger(rawCap) && rawCap >= 0) {
    cap = rawCap;
  } else {
    return res.status(400).json({ error: "perWorkspaceTokenCap must be a non-negative integer or null" });
  }

  const updated = await setWorkspaceTokenCap(getPool(), account.id, req.params.tenantId!, cap);
  if (!updated) return res.status(404).json({ error: "workspace is not covered by this plan" });
  return res.json(await buildAccountDetail(account));
});

/** Start Stripe Checkout for the agency subscription (quantity = covered count). */
billingAccountsRouter.post("/billing-accounts/:id/checkout", async (req, res) => {
  const account = await requireOwnedAccount(req, res);
  if (!account) return;

  // Guard against starting a second subscription on an already-active plan:
  // the webhook would overwrite stripe_subscription_id with the new one,
  // orphaning the old subscription (it keeps billing, and our stale-event
  // guards then ignore it). Manage an existing subscription via Stripe, not a
  // fresh checkout.
  if (account.billingStatus === "active") {
    return res.status(409).json({ error: "this plan already has an active subscription" });
  }

  if (!isAgencyBillingConfigured()) {
    return res.status(503).json({ error: "agency billing is not configured on this server" });
  }

  const count = await countCoveredWorkspaces(getPool(), account.id);
  try {
    const url = await createAgencyCheckoutSession(
      account,
      count,
      `${config.appBaseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      `${config.appBaseUrl}/billing/cancelled`,
    );
    return res.status(200).json({ url });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Failed to create agency Checkout session:", err);
    Sentry.captureException(err);
    return res.status(502).json({ error: "failed to start checkout" });
  }
});
