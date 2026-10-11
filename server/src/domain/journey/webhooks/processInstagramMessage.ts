import type { Pool } from "pg";

import {
  claimInstagramInboundEvent,
  getInstagramInboundEventById,
  markInstagramInboundEventFailed,
  markInstagramInboundEventIgnored,
  markInstagramInboundEventProcessed,
} from "../../../db/instagramInboundEvents.js";

import {
  getActiveExecutionsForSubject,
} from "../../../db/journeyExecutions.js";

import {
  getConnectedInstagramAccount,
} from "../../../db/connectedAccounts.js";

import {
  getSoleConnectedAccount,
} from "../../../db/tokens.js";

import { JourneyRuntime } from "../runtime.js";

import {
  readInstagramInteraction,
  type InstagramInboundMessage,
} from "../../../integrations/instagram/webhooks/parser.js";

export interface ProcessInstagramMessageDependencies {
  pool: Pool;
  runtime: JourneyRuntime;
}

export interface ProcessInstagramInboundResult {
  providerEventId: string;
  duplicate: boolean;
  status: "processed" | "ignored";
  executionId: string | null;
}

export async function processPersistedInstagramInboundEvent(
  dependencies: ProcessInstagramMessageDependencies,
  eventId: string,
): Promise<ProcessInstagramInboundResult> {
  const { pool, runtime } = dependencies;

  const event = await getInstagramInboundEventById(pool, eventId);

  if (!event) {
    throw new Error(`Instagram inbound event not found: ${eventId}`);
  }

  if (event.status === "processed" || event.status === "ignored") {
    return {
      providerEventId: event.providerEventId,
      duplicate: true,
      status: event.status === "processed" ? "processed" : "ignored",
      executionId: event.journeyExecutionId,
    };
  }

  try {
    // The inbound-event table stores the internal meta_tokens row id. Resolve
    // it to the provider Instagram account id before touching execution state.
    const connectedAccount = await getConnectedInstagramAccount(
      pool,
      event.tenantId,
      event.instagramAccountId,
    );

    if (!connectedAccount) {
      throw new Error(
        `Connected Instagram account not found: ${event.instagramAccountId}`,
      );
    }

    const executionAccountId = connectedAccount.instagramAccountId;

    let executions = await getActiveExecutionsForSubject(
      pool,
      event.tenantId,
      event.instagramUserId,
      executionAccountId,
    );

    /*
     * Backward compatibility for account-less executions created before
     * runtime account pinning. Only allow this fallback while the tenant has
     * exactly one connected account; a multi-account tenant must use an
     * account-pinned execution.
     */
    if (executions.length === 0) {
      const soleAccount = await getSoleConnectedAccount(
        pool,
        event.tenantId,
      );

      if (soleAccount?.instagramAccountId === executionAccountId) {
        executions = await getActiveExecutionsForSubject(
          pool,
          event.tenantId,
          event.instagramUserId,
          null,
        );
      }
    }

    if (executions.length === 0) {
      const ignoredClient = await pool.connect();

      try {
        await ignoredClient.query("begin");
        await markInstagramInboundEventIgnored(ignoredClient, event.id);
        await ignoredClient.query("commit");
      } catch (error) {
        await ignoredClient.query("rollback");
        throw error;
      } finally {
        ignoredClient.release();
      }

      return {
        providerEventId: event.providerEventId,
        duplicate: false,
        status: "ignored",
        executionId: null,
      };
    }

    if (executions.length > 1) {
      throw new Error(
        `Multiple active journey executions for tenant=${event.tenantId} account=${executionAccountId} subject=${event.instagramUserId}`,
      );
    }

    const execution = executions[0];

    if (
      execution.instagramAccountId !== null &&
      execution.instagramAccountId !== executionAccountId
    ) {
      throw new Error(
        `Journey execution account mismatch: execution=${execution.id} eventAccount=${executionAccountId}`,
      );
    }

    const resumed = await runtime.resumeFromEvent({
      tenantId: event.tenantId,
      executionId: execution.id,
      eventId: event.providerEventId,
      eventType: event.eventType,
      instagramAccountId: execution.instagramAccountId ?? executionAccountId,
      payload: {
        provider: "instagram",
        instagramAccountId: executionAccountId,
        messageText: event.messageText,
        instagramUserId: event.instagramUserId,
        receivedAt: event.eventAt,
        ...(readInstagramInteraction(event.payload)
          ? { interaction: readInstagramInteraction(event.payload) }
          : {}),
      },
    });

    const processedClient = await pool.connect();

    try {
      await processedClient.query("begin");
      await markInstagramInboundEventProcessed(
        processedClient,
        event.id,
        resumed.execution.id,
      );
      await processedClient.query("commit");
    } catch (error) {
      await processedClient.query("rollback");
      throw error;
    } finally {
      processedClient.release();
    }

    return {
      providerEventId: event.providerEventId,
      duplicate: false,
      status: "processed",
      executionId: resumed.execution.id,
    };
  } catch (error) {
    const failedClient = await pool.connect();

    try {
      await failedClient.query("begin");
      await markInstagramInboundEventFailed(failedClient, event.id);
      await failedClient.query("commit");
    } catch {
      await failedClient.query("rollback");
    } finally {
      failedClient.release();
    }

    throw error;
  }
}

/**
 * Backward-compatible synchronous entry point used by existing direct
 * processing tests/integrations. New production webhook traffic uses the
 * durable claim -> enqueue -> worker -> processPersisted path.
 */
export async function processInstagramMessage(
  dependencies: ProcessInstagramMessageDependencies,
  input: {
    tenantId: string;
    instagramAccountId: string;
    event: InstagramInboundMessage;
  },
): Promise<ProcessInstagramInboundResult> {
  const { pool } = dependencies;
  const client = await pool.connect();

  try {
    await client.query("begin");

    const claim = await claimInstagramInboundEvent(client, {
      tenantId: input.tenantId,
      instagramAccountId: input.instagramAccountId,
      providerEventId: input.event.providerEventId,
      instagramUserId: input.event.instagramUserId,
      eventType: input.event.eventType,
      messageText: input.event.messageText,
      eventAt: input.event.eventAt,
      payload: input.event.raw,
    });

    await client.query("commit");

    if (!claim.claimed || !claim.event) {
      return {
        providerEventId: input.event.providerEventId,
        duplicate: true,
        status: "ignored",
        executionId: null,
      };
    }

    return processPersistedInstagramInboundEvent(
      dependencies,
      claim.event.id,
    );
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Preserve original error.
    }

    throw error;
  } finally {
    client.release();
  }
}
