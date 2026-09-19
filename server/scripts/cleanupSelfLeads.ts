/**
 * Identity Refactor U7 — cleans up "self-leads": a lead row where
 * leads.instagram_user_id equals the tenant's OWN connected account id
 * (meta_tokens.instagram_account_id for that tenant). These are not real
 * end-users; they were ingested by a webhook-echo bug where the connected
 * account's own id showed up as the commenter/sender on some event types.
 * Fixed going forward in commit b698505 (the ingestion path now drops such
 * events), but any already-ingested rows survive until cleaned up here.
 *
 * A self-lead can have dependents (lead_events, lead_pii,
 * lead_captured_facts, milestone_advancements all reference lead_id with
 * no ON DELETE CASCADE), so deleting one means deleting its dependents
 * first, in FK order: milestone_advancements, lead_captured_facts,
 * lead_pii, lead_events, then the lead itself.
 *
 * Dry run (default) only reports; pass --apply to actually delete.
 * Run: npx tsx scripts/cleanupSelfLeads.ts [--apply]
 */
import { getPool, closePool } from "../src/db/pool.js";

interface SelfLead {
  leadId: string;
  tenantId: string;
  instagramUserId: string;
}

async function findSelfLeads(pool: ReturnType<typeof getPool>): Promise<SelfLead[]> {
  const { rows } = await pool.query<{ lead_id: string; tenant_id: string; instagram_user_id: string }>(
    `select l.id as lead_id, l.tenant_id, l.instagram_user_id
     from leads l
     join meta_tokens t
       on t.tenant_id = l.tenant_id
      and t.instagram_account_id = l.instagram_user_id`,
  );
  return rows.map((r) => ({ leadId: r.lead_id, tenantId: r.tenant_id, instagramUserId: r.instagram_user_id }));
}

async function main() {
  const apply = process.argv.includes("--apply");
  const pool = getPool();

  const selfLeads = await findSelfLeads(pool);
  if (selfLeads.length === 0) {
    console.log("No self-leads found — nothing to do.");
    await closePool();
    return;
  }

  console.log(`Found ${selfLeads.length} self-lead(s):`);
  for (const lead of selfLeads) {
    console.log(`  lead=${lead.leadId} tenant=${lead.tenantId} instagram_user_id=${lead.instagramUserId}`);
  }

  if (!apply) {
    console.log("\nDry run only — pass --apply to delete these rows and their dependents.");
    await closePool();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const lead of selfLeads) {
      await client.query(`delete from milestone_advancements where lead_id = $1`, [lead.leadId]);
      await client.query(`delete from lead_captured_facts where lead_id = $1`, [lead.leadId]);
      await client.query(`delete from lead_pii where lead_id = $1`, [lead.leadId]);
      await client.query(`delete from lead_events where lead_id = $1`, [lead.leadId]);
      await client.query(`delete from leads where id = $1`, [lead.leadId]);
    }
    await client.query("COMMIT");
    console.log(`\nDeleted ${selfLeads.length} self-lead(s) and their dependents.`);
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
