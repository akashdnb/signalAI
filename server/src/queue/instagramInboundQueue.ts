import type { PgBoss, Db } from "pg-boss";
import type { PoolClient } from "pg";

export const INSTAGRAM_INBOUND_QUEUE =
  "instagram-inbound";

export interface InstagramInboundJob {
  inboundEventId: string;
  tenantId: string;
  instagramUserId: string;
  providerEventId: string;
}

/**
 * One key per tenant + Instagram user.
 *
 * This preserves inbound event ordering for one conversation while
 * allowing unrelated Instagram conversations to process concurrently.
 */
export async function ensureInstagramInboundQueue(
  boss: PgBoss,
): Promise<void> {
  await boss.createQueue(
    INSTAGRAM_INBOUND_QUEUE,
    {
      policy: "key_strict_fifo",
      retryLimit: 5,
      retryBackoff: true,
    },
  );
}

/**
 * pg-boss supports a custom Db adapter. Using the request's checked-out
 * PostgreSQL client makes the queue INSERT participate in the caller's
 * transaction.
 */
function asPgBossDb(
  client: PoolClient,
): Db {
  return {
    async executeSql(
      text: string,
      values?: unknown[],
    ) {
      const result =
        await client.query(
          text,
          values,
        );

      return {
        rows: result.rows,
      };
    },
  };
}

/**
 * The event row and pg-boss job are committed atomically.
 *
 * If boss.send() fails, the caller must roll back the surrounding
 * transaction so Meta can safely retry the webhook.
 */
export async function enqueueInstagramInboundEvent(
  boss: PgBoss,
  client: PoolClient,
  job: InstagramInboundJob,
): Promise<void> {
  await boss.send(
    INSTAGRAM_INBOUND_QUEUE,
    job,
    {
      singletonKey:
        `${job.tenantId}:${job.instagramUserId}`,
      db: asPgBossDb(client),
    },
  );
}
