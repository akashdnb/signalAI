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

/**
 * Process an event that is already durably persisted.
 *
 * This is the worker path. It intentionally does NOT attempt to insert
 * the inbound event again — the webhook request already did that.
 */
export async function processPersistedInstagramInboundEvent(
  dependencies: ProcessInstagramMessageDependencies,
  eventId: string,
): Promise<ProcessInstagramInboundResult> {
  const {
    pool,
    runtime,
  } = dependencies;

  const event =
    await getInstagramInboundEventById(
      pool,
      eventId,
    );

  if (!event) {
    throw new Error(
      `Instagram inbound event not found: ${eventId}`,
    );
  }

  /*
   * pg-boss may retry a job after a worker/process interruption.
   * Terminal inbound states are idempotent no-ops.
   */
  if (
    event.status === "processed" ||
    event.status === "ignored"
  ) {
    return {
      providerEventId:
        event.providerEventId,
      duplicate: true,
      status:
        event.status === "processed"
          ? "processed"
          : "ignored",
      executionId:
        event.journeyExecutionId,
    };
  }

  try {
    // The inbound event is already pinned to the receiving Meta token.
    // Never resume an execution belonging to another connected account.
    const executions =
      await getActiveExecutionsForSubject(
        pool,
        event.tenantId,
        event.instagramUserId,
        event.instagramAccountId,
      );

    /*
     * We deliberately don't guess when multiple campaigns are active
     * for the same Instagram subject on this account.
     */
    if (executions.length === 0) {
      const ignoredClient =
        await pool.connect();

      try {
        await ignoredClient.query("begin");

        await markInstagramInboundEventIgnored(
          ignoredClient,
          event.id,
        );

        await ignoredClient.query("commit");
      } catch (error) {
        await ignoredClient.query("rollback");
        throw error;
      } finally {
        ignoredClient.release();
      }

      return {
        providerEventId:
          event.providerEventId,
        duplicate: false,
        status: "ignored",
        executionId: null,
      };
    }

    if (executions.length > 1) {
      throw new Error(
        `Multiple active journey executions for tenant=${event.tenantId} account=${event.instagramAccountId} subject=${event.instagramUserId}`,
      );
    }

    const execution =
      executions[0];

    if (
      execution.instagramAccountId !== event.instagramAccountId
    ) {
      throw new Error(
        `Journey execution account mismatch: execution=${execution.id} eventAccount=${event.instagramAccountId}`,
      );
    }

    const resumed =
      await runtime.resumeFromEvent({
        tenantId:
          event.tenantId,
        executionId:
          execution.id,
        eventId:
          event.providerEventId,
        eventType:
          event.eventType,
        payload: {
          provider: "instagram",
          instagramAccountId: event.instagramAccountId,
          messageText: event.messageText,
          instagramUserId: event.instagramUserId,
          receivedAt: event.eventAt,
          ...(readInstagramInteraction(event.payload)
            ? { interaction: readInstagramInteraction(event.payload) }
            : {}),
        },
      });

    const processedClient =
      await pool.connect();

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
      providerEventId:
        event.providerEventId,
      duplicate: false,
      status: "processed",
      executionId:
        resumed.execution.id,
    };
  } catch (error) {
    const failedClient =
      await pool.connect();

    try {
      await failedClient.query("begin");

      await markInstagramInboundEventFailed(
        failedClient,
        event.id,
      );

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
 * Backward-compatible synchronous entry point used by the existing
 * direct-processing tests/integrations.
 *
 * New production webhook traffic should use:
 *
 *   claim -> enqueue -> worker -> processPersisted...
 */
export async function processInstagramMessage(
  dependencies: ProcessInstagramMessageDependencies,
  input: {
    tenantId: string;
    instagramAccountId: string;
    event: InstagramInboundMessage;
  },
): Promise<ProcessInstagramInboundResult> {
  const {
    pool,
  } = dependencies;

  const client =
    await pool.connect();

  try {
    await client.query("begin");

    const claim =
      await claimInstagramInboundEvent(
        client,
        {
          tenantId:
            input.tenantId,
          instagramAccountId:
            input.instagramAccountId,
          providerEventId:
            input.event.providerEventId,
          instagramUserId:
            input.event.instagramUserId,
          eventType:
            input.event.eventType,
          messageText:
            input.event.messageText,
          eventAt:
            input.event.eventAt,
          payload:
            input.event.raw,
        },
      );

    await client.query("commit");

    if (
      !claim.claimed ||
      !claim.event
    ) {
      return {
        providerEventId:
          input.event.providerEventId,
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
