import type { Pool } from "pg";

/**
 * Meta's Data Deletion Callback is app-scoped, not tenant-scoped — the same
 * signed_request user_id could, in principle, match a lead under more than
 * one tenant (the same real person commenting on different creators' posts)
 * or the tenant's own connected account. This is the one legitimate
 * cross-tenant query in the system, and it exists only to feed hardScrubLead
 * (which remains itself tenant-scoped) for every match.
 */
export async function findLeadsByInstagramUserIdAcrossTenants(
  pool: Pool,
  instagramUserId: string,
): Promise<Array<{ tenantId: string; leadId: string }>> {
  const result = await pool.query<{ tenant_id: string; id: string }>(
    `select tenant_id, id from leads where instagram_user_id = $1`,
    [instagramUserId],
  );
  return result.rows.map((row) => ({ tenantId: row.tenant_id, leadId: row.id }));
}

export async function insertPii(
  pool: Pool,
  params: {
    leadEventId: string;
    leadId: string;
    commentText?: string;
    dmText?: string;
    username?: string;
    phone?: string;
  },
): Promise<void> {
  await pool.query(
    `insert into lead_pii (lead_event_id, lead_id, comment_text, dm_text, username, phone)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      params.leadEventId,
      params.leadId,
      params.commentText ?? null,
      params.dmText ?? null,
      params.username ?? null,
      params.phone ?? null,
    ],
  );
}

/**
 * The real implementation behind the Data Deletion Callback (see
 * src/lib/deletionService.ts, which still stubs this until it's wired in).
 * Soft-deletes: lead_id, timestamps, and foreign keys on leads/lead_events
 * stay intact for Attribution/Analytics/Billing, but every PII content
 * field is overwritten, not just flagged, and the identity-spine routing
 * key (instagram_user_id) is scrubbed too. Tenant-scoped so a deletion
 * request can never reach across tenants.
 *
 * Returns false if no lead matched (leadId, tenantId) — the caller's signal
 * that there was nothing to delete under that tenant.
 */
export async function hardScrubLead(pool: Pool, tenantId: string, leadId: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const leadResult = await client.query(
      `update leads set instagram_user_id = null
       where id = $1 and tenant_id = $2
       returning id`,
      [leadId, tenantId],
    );

    if (leadResult.rowCount !== 1) {
      await client.query("ROLLBACK");
      return false;
    }

    await client.query(
      `update lead_pii
       set comment_text = null, dm_text = null, username = null, phone = null, deleted_at = now()
       where lead_id = $1`,
      [leadId],
    );

    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
