import type { Pool, PoolClient } from "pg";

import {
  acknowledgeJourneyAction,
  claimNextJourneyAction,
  failJourneyAction,
  retryJourneyAction,
  type JourneyAction,
} from "../../../db/journeyActions.js";
import { getJourneyExecutionContext } from "../../../db/journeyExecutions.js";
import { ActionDispatcher } from "./dispatcher.js";
import {
  DEFAULT_JOURNEY_ACTION_RETRY_POLICY,
  getRetryAt,
  type JourneyActionRetryPolicy,
} from "./retryPolicy.js";
import { JourneyRuntime } from "../runtime.js";

export interface JourneyActionWorkerResult {
  claimed: boolean;
  actionId?: string;
  acknowledged?: boolean;
}

function serializeActionError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    message: String(error),
  };
}

export class JourneyActionWorker {
  private readonly runtime: JourneyRuntime;

  constructor(
    private readonly pool: Pool,
    private readonly dispatcher: ActionDispatcher,
    private readonly retryPolicy: JourneyActionRetryPolicy =
      DEFAULT_JOURNEY_ACTION_RETRY_POLICY,
  ) {
    this.runtime = new JourneyRuntime(pool);
  }

  async processOne(): Promise<JourneyActionWorkerResult> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");

      const action = await claimNextJourneyAction(client);

      if (!action) {
        await client.query("commit");
        return { claimed: false };
      }

      /*
       * The action is claimed by changing its status inside the
       * transaction. Commit before calling an external integration.
       *
       * This prevents a long-running Instagram/API call from holding
       * a PostgreSQL row lock.
       */
      await client.query("commit");

      const execution = await getJourneyExecutionContext(
        this.pool,
        action.executionId,
      );

      if (!execution) {
        await this.releaseClaim(action.id);

        throw new Error(
          `journey execution not found: ${action.executionId}`,
        );
      }

      try {
        await this.dispatcher.dispatch(action, execution);
      } catch (error) {
        await this.handleFailure(action, error);
        throw error;
      }

      await this.runtime.completeAction(
        action.id,
      );

      return {
        claimed: true,
        actionId: action.id,
        acknowledged: true,
      };
    } catch (error) {
      try {
        await client.query("rollback");
      } catch {
        // Transaction may already have been committed.
      }

      throw error;
    } finally {
      client.release();
    }
  }

  private async releaseClaim(actionId: string): Promise<void> {
    await this.pool.query(
      `
        update journey_actions
           set status = 'pending',
               claimed_at = null
         where id = $1
           and status = 'processing'
      `,
      [actionId],
    );
  }

  private async handleFailure(
    action: JourneyAction,
    error: unknown,
  ): Promise<void> {
    const errorPayload = serializeActionError(error);
    const nextAttemptNumber = action.attemptCount + 1;

    const retryAt = getRetryAt(
      this.retryPolicy,
      nextAttemptNumber,
    );

    const client = await this.pool.connect();

    try {
      await client.query("begin");

      if (retryAt) {
        await retryJourneyAction(
          client,
          action.id,
          retryAt,
          errorPayload,
        );
      } else {
        await failJourneyAction(
          client,
          action.id,
          errorPayload,
        );
      }

      await client.query("commit");
    } catch (failureError) {
      try {
        await client.query("rollback");
      } catch {
        // Transaction may already have been committed.
      }

      throw failureError;
    } finally {
      client.release();
    }
  }

}
