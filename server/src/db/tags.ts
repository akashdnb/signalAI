import type { Pool } from "pg";
import { recordLeadActivity } from "./leadActivity.js";

export interface Tag {
  id: string;
  tenantId: string;
  name: string;
  createdAt: Date;
}

interface TagRow {
  id: string;
  tenant_id: string;
  name: string;
  created_at: Date;
}

function toTag(row: TagRow): Tag {
  return { id: row.id, tenantId: row.tenant_id, name: row.name, createdAt: row.created_at };
}

/** Idempotent by (tenant_id, name) — the tag picker calls this on every "add tag by name" rather than requiring a separate create-then-attach round trip. */
export async function findOrCreateTag(pool: Pool, tenantId: string, name: string): Promise<Tag> {
  const result = await pool.query<TagRow>(
    `insert into tags (tenant_id, name) values ($1, $2)
     on conflict (tenant_id, name) do update set name = excluded.name
     returning *`,
    [tenantId, name.trim()],
  );
  return toTag(result.rows[0]!);
}

export async function listTagsForTenant(pool: Pool, tenantId: string): Promise<Tag[]> {
  const result = await pool.query<TagRow>(`select * from tags where tenant_id = $1 order by name`, [tenantId]);
  return result.rows.map(toTag);
}

export interface LeadTag {
  tagId: string;
  name: string;
  source: "manual" | "automatic";
}

export async function listTagsForLead(pool: Pool, tenantId: string, leadId: string): Promise<LeadTag[]> {
  const result = await pool.query<{ tag_id: string; name: string; source: "manual" | "automatic" }>(
    `select t.id as tag_id, t.name, lt.source
     from lead_tags lt
     join tags t on t.id = lt.tag_id
     where lt.tenant_id = $1 and lt.lead_id = $2
     order by t.name`,
    [tenantId, leadId],
  );
  return result.rows.map((row) => ({ tagId: row.tag_id, name: row.name, source: row.source }));
}

/** `on conflict do nothing`: tagging an already-tagged lead is a no-op, not an error — the caller doesn't need to check first. */
export async function addTagToLead(
  pool: Pool,
  params: { tenantId: string; leadId: string; tagId: string; tagName: string; actorUserId?: string | null; source?: "manual" | "automatic" },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `insert into lead_tags (tenant_id, lead_id, tag_id, source) values ($1, $2, $3, $4)
       on conflict (lead_id, tag_id) do nothing`,
      [params.tenantId, params.leadId, params.tagId, params.source ?? "manual"],
    );
    if ((result.rowCount ?? 0) > 0) {
      await recordLeadActivity(client, {
        tenantId: params.tenantId,
        leadId: params.leadId,
        actorUserId: params.actorUserId ?? null,
        type: "tag_added",
        summary: `Tagged "${params.tagName}"`,
      });
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function removeTagFromLead(
  pool: Pool,
  params: { tenantId: string; leadId: string; tagId: string; tagName: string; actorUserId?: string | null },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `delete from lead_tags where tenant_id = $1 and lead_id = $2 and tag_id = $3`,
      [params.tenantId, params.leadId, params.tagId],
    );
    if ((result.rowCount ?? 0) > 0) {
      await recordLeadActivity(client, {
        tenantId: params.tenantId,
        leadId: params.leadId,
        actorUserId: params.actorUserId ?? null,
        type: "tag_removed",
        summary: `Removed tag "${params.tagName}"`,
      });
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
