/**
 * Identity Refactor U7 — one-off cleanup for tenants created before U1
 * (the users/tenant_members/owner_user_id migration), i.e. `owner_user_id
 * is null`. Pre-refactor there was no signup step: a tenant was minted
 * silently the first time someone hit the Instagram connect flow, so a
 * messy production instance can carry several such tenants — at most one
 * of them actually has a connected Instagram account (a `meta_tokens`
 * row); the rest are abandoned attempts.
 *
 * This script:
 *   1. Finds legacy tenants (owner_user_id is null).
 *   2. Classifies each by counting rows across all ten tenant_id tables
 *      (leads, lead_events, lead_pii, meta_tokens, campaigns,
 *      campaign_milestones, lead_captured_facts, milestone_advancements,
 *      account_sends, ai_call_usage):
 *        - "connected": has a meta_tokens row — the real tenant.
 *        - "empty": zero rows in every one of the ten tables — safe to delete.
 *        - "ambiguous": some other data (e.g. a campaign) but no
 *          meta_tokens row — NOT auto-deleted. This is deliberately
 *          conservative: a tenant that got as far as creating a campaign
 *          before its owner walked away still isn't provably abandoned
 *          just because it never connected Instagram.
 *   3. In --apply mode, ONLY if there is exactly one "connected" tenant:
 *      creates/finds a user for --owner-email, attaches that tenant via
 *      tenant_members + owner_user_id, and deletes the "empty" tenants.
 *      Zero or multiple "connected" tenants aborts with no writes — that
 *      shape needs a human decision, not a heuristic.
 *
 * Dry run (default) only reports; pass --apply to actually write.
 * Run: npx tsx scripts/claimLegacyTenants.ts <owner-email> [--apply]
 */
import { getPool, closePool } from "../src/db/pool.js";
import { findOrCreateUserByEmail } from "../src/db/users.js";
import { addTenantMember } from "../src/db/tenantMembers.js";

const TENANT_DATA_TABLES = [
  "leads",
  "lead_events",
  "lead_pii",
  "meta_tokens",
  "campaigns",
  "campaign_milestones",
  "lead_captured_facts",
  "milestone_advancements",
  "account_sends",
  "ai_call_usage",
] as const;

interface LegacyTenant {
  id: string;
  name: string;
  counts: Record<(typeof TENANT_DATA_TABLES)[number], number>;
}

async function loadLegacyTenants(pool: ReturnType<typeof getPool>): Promise<LegacyTenant[]> {
  const { rows: tenants } = await pool.query<{ id: string; name: string }>(
    `select id, name from tenants where owner_user_id is null order by created_at asc`,
  );

  const legacy: LegacyTenant[] = [];
  for (const tenant of tenants) {
    const counts = {} as LegacyTenant["counts"];
    for (const table of TENANT_DATA_TABLES) {
      const { rows } = await pool.query<{ count: string }>(
        `select count(*)::text as count from ${table} where tenant_id = $1`,
        [tenant.id],
      );
      counts[table] = Number(rows[0]!.count);
    }
    legacy.push({ id: tenant.id, name: tenant.name, counts });
  }
  return legacy;
}

function classify(tenant: LegacyTenant): "connected" | "empty" | "ambiguous" {
  if (tenant.counts.meta_tokens > 0) return "connected";
  const totalOtherRows = TENANT_DATA_TABLES.filter((t) => t !== "meta_tokens").reduce(
    (sum, t) => sum + tenant.counts[t],
    0,
  );
  return totalOtherRows === 0 ? "empty" : "ambiguous";
}

async function main() {
  const ownerEmail = process.argv[2];
  const apply = process.argv.includes("--apply");

  if (!ownerEmail || ownerEmail.startsWith("--")) {
    console.error("Usage: npx tsx scripts/claimLegacyTenants.ts <owner-email> [--apply]");
    process.exit(1);
  }

  const pool = getPool();
  const legacy = await loadLegacyTenants(pool);

  if (legacy.length === 0) {
    console.log("No legacy tenants found (owner_user_id is null) — nothing to do.");
    await closePool();
    return;
  }

  const classified = legacy.map((tenant) => ({ tenant, verdict: classify(tenant) }));

  console.log(`Found ${legacy.length} legacy tenant(s):\n`);
  for (const { tenant, verdict } of classified) {
    console.log(`  ${tenant.id}  "${tenant.name}"  → ${verdict}`);
    for (const table of TENANT_DATA_TABLES) {
      if (tenant.counts[table] > 0) console.log(`      ${table}: ${tenant.counts[table]}`);
    }
  }

  const connected = classified.filter((c) => c.verdict === "connected");
  const empty = classified.filter((c) => c.verdict === "empty");
  const ambiguous = classified.filter((c) => c.verdict === "ambiguous");

  console.log(`\nconnected=${connected.length} empty=${empty.length} ambiguous=${ambiguous.length}`);
  if (ambiguous.length > 0) {
    console.log(
      "\nAmbiguous tenants are left untouched by this script — they have data but no connected\n" +
        "Instagram account, so they aren't provably abandoned. Review manually.",
    );
  }

  if (connected.length !== 1) {
    console.log(
      `\nAborting: expected exactly one "connected" tenant to claim, found ${connected.length}. No changes made.`,
    );
    await closePool();
    return;
  }

  const [{ tenant: real }] = connected;
  console.log(`\nReal tenant to claim: ${real.id} ("${real.name}")`);
  console.log(`Tenants that would be deleted (empty, zero rows across all ten tables): ${empty.length}`);
  for (const { tenant } of empty) console.log(`  ${tenant.id}  "${tenant.name}"`);

  if (!apply) {
    console.log("\nDry run only — pass --apply to write these changes.");
    await closePool();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const user = await findOrCreateUserByEmail(client, ownerEmail);
    await addTenantMember(client, real.id, user.id, "owner");
    await client.query(`update tenants set owner_user_id = $1 where id = $2`, [user.id, real.id]);
    for (const { tenant } of empty) {
      // Re-verify at write time, inside the transaction — a re-check costs
      // nothing and defends against any row having landed between the
      // report above and this write.
      let stillEmpty = true;
      for (const table of TENANT_DATA_TABLES) {
        const { rows } = await client.query<{ count: string }>(
          `select count(*)::text as count from ${table} where tenant_id = $1`,
          [tenant.id],
        );
        if (Number(rows[0]!.count) > 0) {
          stillEmpty = false;
          break;
        }
      }
      if (!stillEmpty) {
        throw new Error(`Tenant ${tenant.id} gained data since the report — aborting the whole transaction.`);
      }
      await client.query(`delete from tenants where id = $1`, [tenant.id]);
    }
    await client.query("COMMIT");
    console.log(`\nDone. ${real.id} is now owned by ${ownerEmail}; deleted ${empty.length} empty tenant(s).`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  await closePool();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
