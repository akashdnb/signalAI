import type { PoolClient } from "pg";

export interface JourneyEvent {
  id: string;
  tenantId: string;
  executionId: string;
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

interface JourneyEventRow {
  id: string;
  tenant_id: string;
  execution_id: string;
  event_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

function toJourneyEvent(row: JourneyEventRow): JourneyEvent {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    executionId: row.execution_id,
    eventId: row.event_id,
    eventType: row.event_type,
    payload: row.payload,
    createdAt: row.created_at,
  };
}

/**
 * Attempts to claim an inbound event.
 *
 * Returns:
 *   inserted event -> this transaction owns processing
 *   null           -> event was already processed
 *
 * The unique constraint on (tenant_id, event_id) is the actual
 * concurrency guarantee. Application-level "check then insert"
 * is intentionally avoided.
 */
export async function claimJourneyEvent(
  client: PoolClient,
  input: {
    tenantId: string;
    executionId: string;
    eventId: string;
    eventType: string;
    payload: Record<string, unknown>;
  },
): Promise<JourneyEvent | null> {
  const result = await client.query<JourneyEventRow>(
    `insert into journey_events (
       tenant_id,
       execution_id,
       event_id,
       event_type,
       payload
     )
     values ($1, $2, $3, $4, $5)
     on conflict (tenant_id, event_id)
     do nothing
     returning *`,
    [
      input.tenantId,
      input.executionId,
      input.eventId,
      input.eventType,
      input.payload,
    ],
  );

  return result.rows[0]
    ? toJourneyEvent(result.rows[0])
    : null;
}
