import type { Pool, PoolClient } from "pg";

export type InstagramInboundEventStatus =
  | "received"
  | "processed"
  | "ignored"
  | "failed";

export interface InstagramInboundEvent {
  id: string;
  tenantId: string;
  instagramAccountId: string;
  providerEventId: string;
  instagramUserId: string;
  eventType: string;
  messageText: string | null;
  eventAt: string | null;
  payload: Record<string, unknown>;
  journeyExecutionId: string | null;
  status: InstagramInboundEventStatus;
  createdAt: string;
  processedAt: string | null;
}

function mapRow(row: Record<string, unknown>): InstagramInboundEvent {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    instagramAccountId: String(row.instagram_account_id),
    providerEventId: String(row.provider_event_id),
    instagramUserId: String(row.instagram_user_id),
    eventType: String(row.event_type),
    messageText:
      row.message_text == null
        ? null
        : String(row.message_text),
    eventAt:
      row.event_at == null
        ? null
        : String(row.event_at),
    payload:
      (row.payload ?? {}) as Record<string, unknown>,
    journeyExecutionId:
      row.journey_execution_id == null
        ? null
        : String(row.journey_execution_id),
    status:
      String(row.status) as InstagramInboundEventStatus,
    createdAt: String(row.created_at),
    processedAt:
      row.processed_at == null
        ? null
        : String(row.processed_at),
  };
}

export interface CreateInstagramInboundEventInput {
  tenantId: string;
  instagramAccountId: string;
  providerEventId: string;
  instagramUserId: string;
  eventType: string;
  messageText?: string | null;
  eventAt?: Date | null;
  payload: Record<string, unknown>;
}

export async function claimInstagramInboundEvent(
  client: PoolClient,
  input: CreateInstagramInboundEventInput,
): Promise<{
  event: InstagramInboundEvent | null;
  claimed: boolean;
}> {
  const result = await client.query(
    `
      insert into instagram_inbound_events (
        tenant_id,
        instagram_account_id,
        provider_event_id,
        instagram_user_id,
        event_type,
        message_text,
        event_at,
        payload
      )
      values (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8::jsonb
      )
      on conflict (
        tenant_id,
        provider_event_id
      )
      do nothing
      returning *
    `,
    [
      input.tenantId,
      input.instagramAccountId,
      input.providerEventId,
      input.instagramUserId,
      input.eventType,
      input.messageText ?? null,
      input.eventAt ?? null,
      JSON.stringify(input.payload),
    ],
  );

  if (result.rowCount === 0) {
    return {
      event: null,
      claimed: false,
    };
  }

  return {
    event: mapRow(result.rows[0]),
    claimed: true,
  };
}

export async function markInstagramInboundEventProcessed(
  client: PoolClient,
  eventId: string,
  journeyExecutionId: string,
): Promise<void> {
  await client.query(
    `
      update instagram_inbound_events
         set status = 'processed',
             journey_execution_id = $2,
             processed_at = coalesce(processed_at, now())
       where id = $1
    `,
    [eventId, journeyExecutionId],
  );
}

export async function markInstagramInboundEventIgnored(
  client: PoolClient,
  eventId: string,
): Promise<void> {
  await client.query(
    `
      update instagram_inbound_events
         set status = 'ignored',
             processed_at = coalesce(processed_at, now())
       where id = $1
    `,
    [eventId],
  );
}

export async function markInstagramInboundEventFailed(
  client: PoolClient,
  eventId: string,
): Promise<void> {
  await client.query(
    `
      update instagram_inbound_events
         set status = 'failed'
       where id = $1
    `,
    [eventId],
  );
}

export async function getInstagramInboundEventById(
  pool: Pool,
  eventId: string,
): Promise<InstagramInboundEvent | null> {
  const result = await pool.query(
    `
      select *
        from instagram_inbound_events
       where id = $1
       limit 1
    `,
    [eventId],
  );

  return result.rowCount
    ? mapRow(result.rows[0])
    : null;
}

export async function getInstagramInboundEvent(
  pool: Pool,
  tenantId: string,
  providerEventId: string,
): Promise<InstagramInboundEvent | null> {
  const result = await pool.query(
    `
      select *
        from instagram_inbound_events
       where tenant_id = $1
         and provider_event_id = $2
       limit 1
    `,
    [tenantId, providerEventId],
  );

  return result.rowCount
    ? mapRow(result.rows[0])
    : null;
}
