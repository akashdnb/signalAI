import type { Pool } from "pg";

/**
 * R10-03 fix: Stripe redelivers on any non-2xx response and can deliver
 * the same event more than once regardless — without a record of what has
 * already been processed, a redelivered or out-of-order event is
 * indistinguishable from a fresh one (the mechanism that makes R10-02's
 * stale-cancellation bug reachable). Same idempotency shape as
 * lead_events' unique index on meta_event_id.
 *
 * Split into a check (before processing) and a record (after processing
 * succeeds), rather than one atomic reserve-then-process step: recording
 * "seen" before the handler actually completes would let a transient
 * failure permanently burn the dedup slot, since Stripe's retry
 * (triggered by our own non-2xx) would then be wrongly treated as an
 * already-processed duplicate. `on conflict do nothing` on the record
 * step keeps this race-safe if the same event is ever redelivered
 * concurrently — the losing insert is a harmless no-op, not an error.
 */
export async function isWebhookEventAlreadyProcessed(pool: Pool, eventId: string): Promise<boolean> {
  const result = await pool.query(`select 1 from stripe_webhook_events where event_id = $1`, [eventId]);
  return (result.rowCount ?? 0) > 0;
}

export async function recordWebhookEventProcessed(pool: Pool, eventId: string, eventType: string): Promise<void> {
  await pool.query(
    `insert into stripe_webhook_events (event_id, event_type) values ($1, $2) on conflict (event_id) do nothing`,
    [eventId, eventType],
  );
}
