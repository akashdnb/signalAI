import type { Pool } from "pg";
import { recordLeadActivity } from "./leadActivity.js";

export interface LeadNote {
  id: string;
  leadId: string;
  authorUserId: string | null;
  body: string;
  createdAt: Date;
}

interface LeadNoteRow {
  id: string;
  lead_id: string;
  author_user_id: string | null;
  body: string;
  created_at: Date;
}

function toLeadNote(row: LeadNoteRow): LeadNote {
  return {
    id: row.id,
    leadId: row.lead_id,
    authorUserId: row.author_user_id,
    body: row.body,
    createdAt: row.created_at,
  };
}

/**
 * Phase 2A "Lead Notes" / "Internal Comments" — one table backs both; the
 * roadmap doesn't distinguish them, and neither does this. Also records a
 * lead_activity row, in the same transaction (matching tenants.ts's
 * createTenantForUser pattern — this is route-triggered, not nested inside
 * a larger caller transaction the way leads.ts's writes are), so a note
 * appearing in the Lead Timeline can never lag behind the note itself, and
 * a crash between the two inserts can't leave one without the other.
 */
export async function addLeadNote(
  pool: Pool,
  params: { tenantId: string; leadId: string; authorUserId: string | null; body: string },
): Promise<LeadNote> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<LeadNoteRow>(
      `insert into lead_notes (tenant_id, lead_id, author_user_id, body)
       values ($1, $2, $3, $4)
       returning *`,
      [params.tenantId, params.leadId, params.authorUserId, params.body],
    );
    const note = toLeadNote(result.rows[0]!);

    await recordLeadActivity(client, {
      tenantId: params.tenantId,
      leadId: params.leadId,
      actorUserId: params.authorUserId,
      type: "note_added",
      summary: params.body.length > 140 ? `${params.body.slice(0, 140)}…` : params.body,
    });

    await client.query("COMMIT");
    return note;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listLeadNotes(pool: Pool, tenantId: string, leadId: string): Promise<LeadNote[]> {
  const result = await pool.query<LeadNoteRow>(
    `select * from lead_notes where tenant_id = $1 and lead_id = $2 order by created_at desc`,
    [tenantId, leadId],
  );
  return result.rows.map(toLeadNote);
}
