import type { Pool } from "pg";

import {
  claimInstagramInboundEvent,
  markInstagramInboundEventFailed,
  markInstagramInboundEventIgnored,
  markInstagramInboundEventProcessed,
} from "../../../db/instagramInboundEvents.js";

import {
  getActiveExecutionsForSubject,
} from "../../../db/journeyExecutions.js";

import { JourneyRuntime } from "../runtime.js";

import type {
  InstagramInboundMessage,
} from "../../../integrations/instagram/webhooks/parser.js";

export interface ProcessInstagramMessageDependencies {
  pool: Pool;
  runtime: JourneyRuntime;
}

export async function processInstagramMessage(
  dependencies: ProcessInstagramMessageDependencies,
  input: {
    tenantId: string;
    instagramAccountId: string;
    event: InstagramInboundMessage;
  },
) {
  const {
    pool,
    runtime,
  } = dependencies;

  const client = await pool.connect();

  try {
    await client.query("begin");

    const claim =
      await claimInstagramInboundEvent(
        client,
        {
          tenantId: input.tenantId,
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

    /*
     * Meta may redeliver the same event.
     *
     * The unique constraint means only one delivery becomes the owner
     * of the event.
     */
    if (!claim.claimed || !claim.event) {
      return {
        providerEventId:
          input.event.providerEventId,
        duplicate: true,
        status: "ignored" as const,
        executionId: null,
      };
    }

    try {
      const executions =
        await getActiveExecutionsForSubject(
          pool,
          input.tenantId,
          input.event.instagramUserId,
        );

      /*
       * We deliberately don't guess when multiple campaigns are active
       * for the same Instagram subject.
       *
       * 5A only resumes when there is exactly one active execution.
       */
      if (executions.length === 0) {
        const ignoredClient =
          await pool.connect();

        try {
          await ignoredClient.query("begin");

          await markInstagramInboundEventIgnored(
            ignoredClient,
            claim.event.id,
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
            input.event.providerEventId,
          duplicate: false,
          status: "ignored" as const,
          executionId: null,
        };
      }

      if (executions.length > 1) {
        throw new Error(
          `Multiple active journey executions for tenant=${input.tenantId} subject=${input.event.instagramUserId}`,
        );
      }

      const execution = executions[0];

      const resumed =
        await runtime.resumeFromEvent({
          tenantId: input.tenantId,
          executionId: execution.id,
          eventId: input.event.providerEventId,
          eventType: input.event.eventType,
          payload: {
            provider: "instagram",
            messageText: input.event.messageText,
            instagramUserId:
              input.event.instagramUserId,
            receivedAt:
              input.event.eventAt
                ?.toISOString() ?? null,
          },
        });

      const processedClient =
        await pool.connect();

      try {
        await processedClient.query("begin");

        await markInstagramInboundEventProcessed(
          processedClient,
          claim.event.id,
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
          input.event.providerEventId,
        duplicate: false,
        status: "processed" as const,
        executionId: resumed.execution.id,
      };
    } catch (error) {
      const failedClient =
        await pool.connect();

      try {
        await failedClient.query("begin");

        await markInstagramInboundEventFailed(
          failedClient,
          claim.event.id,
        );

        await failedClient.query("commit");
      } catch {
        await failedClient.query("rollback");
      } finally {
        failedClient.release();
      }

      throw error;
    }
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
