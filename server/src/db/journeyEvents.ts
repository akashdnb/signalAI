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

function readInstagramAccountId(payload: Record<string, unknown>): string | null {
  return typeof payload.instagramAccountId === "string"
    ? payload.instagramAccountId
    : null;
}

/**
 * Attempts to claim an inbound event.
 *
 * Account isolation is enforced here as a defense-in-depth boundary so every
 * runtime caller must prove that the event belongs to the execution's
 * Instagram account. Account-less legacy executions are only resumable when
 * the tenant has exactly one healthy connected account.
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
  const executionResult = await client.query<{
    instagram_account_id: string | null;
    campaign_id: string;
  }>(
    `select instagram_account_id, campaign_id
       from journey_executions
      where id = $1 and tenant_id = $2
      for update`,
    [input.executionId, input.tenantId],
  );

  const execution = executionResult.rows[0];
  if (!execution) {
    throw new Error(`journey execution not found: ${input.executionId}`);
  }

  const eventAccountId = readInstagramAccountId(input.payload);

  if (execution.instagram_account_id) {
    if (!eventAccountId) {
      throw new Error(
        `Instagram account context is required for journey execution ${input.executionId}`,
      );
    }

    if (eventAccountId !== execution.instagram_account_id) {
      throw new Error(
        `Journey execution account mismatch: execution=${input.executionId} executionAccount=${execution.instagram_account_id} eventAccount=${eventAccountId}`,
      );
    }

    const binding = await client.query(
      `select 1
         from campaign_instagram_accounts cia
         join campaigns c on c.id = cia.campaign_id
         join meta_tokens mt on mt.id = cia.meta_token_id
        where cia.campaign_id = $1
          and c.tenant_id = $2
          and mt.tenant_id = $2
          and mt.instagram_account_id = $3
          and mt.status = 'healthy'
          and cia.enabled = true
        limit 1`,
      [execution.campaign_id, input.tenantId, eventAccountId],
    );

    if (!binding.rows[0]) {
      throw new Error(
        `Instagram account ${eventAccountId} is not active for journey ${execution.campaign_id}`,
      );
    }
  } else {
    const accountResult = await client.query<{ instagram_account_id: string }>(
      `select instagram_account_id
         from meta_tokens
        where tenant_id = $1
          and status = 'healthy'
        order by created_at
        limit 2`,
      [input.tenantId],
    );

    if (accountResult.rows.length !== 1) {
      throw new Error(
        `Journey execution ${input.executionId} requires a pinned Instagram account in a multi-account tenant`,
      );
    }

    const soleAccountId = accountResult.rows[0]!.instagram_account_id;
    if (eventAccountId && eventAccountId !== soleAccountId) {
      throw new Error(
        `Journey execution account mismatch: execution=${input.executionId} executionAccount=legacy-single-account eventAccount=${eventAccountId}`,
      );
    }
  }

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
