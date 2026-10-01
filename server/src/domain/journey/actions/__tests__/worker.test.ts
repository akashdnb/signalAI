import { randomUUID } from "node:crypto";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Pool } from "pg";

const completeAction = vi.hoisted(() => vi.fn());

vi.mock("../../runtime.js", () => ({
  JourneyRuntime: class {
    completeAction = completeAction;
  },
}));;

import type { JourneyAction } from "../../../../db/journeyActions.js";
import { ActionDispatcher } from "../dispatcher.js";
import { JourneyActionWorker } from "../worker.js";
import type { JourneyActionHandler } from "../types.js";

function makeActionRow() {
  const id = randomUUID();
  const executionId = randomUUID();
  const nodeExecutionId = randomUUID();
  const tenantId = randomUUID();

  return {
    id,
    execution_id: executionId,
    node_execution_id: nodeExecutionId,
    action_type: "SEND_MESSAGE" as const,
    payload: {
      tenantId,
      subjectKey: "subject-1",
      text: "hello",
    },
    status: "processing" as const,
    attempt_count: 0,
    next_attempt_at: null,
    last_error: null,
    created_at: new Date().toISOString(),
    acknowledged_at: null,
    claimed_at: new Date().toISOString(),
  };
}

function makeExecutionContext(action: ReturnType<typeof makeActionRow>) {
  return {
    id: action.execution_id,
    tenant_id: action.payload.tenantId,
    campaign_id: randomUUID(),
    subject_key: action.payload.subjectKey,
  };
}

function makeClient() {
  const queries: string[] = [];
  const actionRow = makeActionRow();

  return {
    queries,
    query: vi.fn(
      async (sql: string): Promise<{ rows: unknown[] }> => {
        queries.push(sql);

        if (sql.includes("with candidate")) {
          return {
            rows: [actionRow],
          };
        }

        if (sql.includes("update journey_actions")) {
          return {
            rows: [
              {
                ...actionRow,
                status: "acknowledged",
                acknowledged_at: new Date().toISOString(),
              },
            ],
          };
        }

        return { rows: [] };
      },
    ),
    release: vi.fn(),
  };
}

describe("JourneyActionWorker", () => {
  beforeEach(() => {
    completeAction.mockReset();
  });

  it("claims and executes a pending action", async () => {
    const action = makeActionRow();
    const client = makeClient();

    client.query.mockImplementation(async (sql: string) => {
      client.queries.push(sql);

      if (sql.includes("with candidate")) {
        return {
          rows: [action],
        };
      }

      if (sql.includes("update journey_actions")) {
        return {
          rows: [
            {
              ...action,
              status: "acknowledged",
              acknowledged_at: new Date().toISOString(),
            },
          ],
        };
      }

      return { rows: [] };
    });

    const pool = {
      connect: vi.fn(async () => client),
      query: vi.fn(async (sql: string) => {
        if (sql.includes("from journey_executions")) {
          return {
            rows: [makeExecutionContext(action)],
          };
        }

        return { rows: [] };
      }),
    } as unknown as Pool;

    const handler: JourneyActionHandler = {
      type: "SEND_MESSAGE",
      execute: vi.fn(async () => undefined),
    };

    const dispatcher = new ActionDispatcher([handler]);

    completeAction.mockResolvedValueOnce({
      execution: makeExecutionContext(action),
      action: null,
    });

    const worker = new JourneyActionWorker(pool, dispatcher);

    const result = await worker.processOne();

    expect(result.claimed).toBe(true);
    expect(result.acknowledged).toBe(true);
    expect(handler.execute).toHaveBeenCalledTimes(1);
    expect(completeAction).toHaveBeenCalledTimes(1);
    expect(completeAction).toHaveBeenCalledWith(action.id);

    const executionInput = vi.mocked(handler.execute).mock.calls[0]![0];

    expect(executionInput.idempotencyKey).toBe(
      executionInput.action.id,
    );

    expect(executionInput.execution.executionId).toBe(
      executionInput.action.executionId,
    );

    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("does nothing when no action is available", async () => {
    const client = makeClient();

    client.query.mockImplementation(async (sql: string) => {
      client.queries.push(sql);

      if (sql.includes("with candidate")) {
        return { rows: [] };
      }

      return { rows: [] };
    });

    const pool = {
      connect: vi.fn(async () => client),
      query: vi.fn(async () => ({ rows: [] })),
    } as unknown as Pool;

    const handler: JourneyActionHandler = {
      type: "SEND_MESSAGE",
      execute: vi.fn(async () => undefined),
    };

    const worker = new JourneyActionWorker(
      pool,
      new ActionDispatcher([handler]),
    );

    const result = await worker.processOne();

    expect(result.claimed).toBe(false);
    expect(handler.execute).not.toHaveBeenCalled();
  });

  it("releases the action back to pending when execution fails", async () => {
    const action = makeActionRow();
    const client = makeClient();

    client.query.mockImplementation(async (sql: string) => {
      client.queries.push(sql);

      if (sql.includes("with candidate")) {
        return { rows: [action] };
      }

      if (sql.includes("update journey_actions")) {
        return {
          rows: [
            {
              ...action,
              status: "pending",
              attempt_count: 1,
              next_attempt_at: new Date(
                Date.now() + 30_000,
              ).toISOString(),
              last_error: {
                name: "Error",
                message: "provider failed",
              },
              claimed_at: null,
            },
          ],
        };
      }

      return { rows: [] };
    });

    const pool = {
      connect: vi.fn(async () => client),
      query: vi.fn(async (sql: string) => {
        if (sql.includes("from journey_executions")) {
          return {
            rows: [makeExecutionContext(action)],
          };
        }

        return { rows: [] };
      }),
    } as unknown as Pool;

    const handler: JourneyActionHandler = {
      type: "SEND_MESSAGE",
      execute: vi.fn(async () => {
        throw new Error("provider failed");
      }),
    };

    const worker = new JourneyActionWorker(
      pool,
      new ActionDispatcher([handler]),
    );

    await expect(worker.processOne()).rejects.toThrow("provider failed");

    expect(handler.execute).toHaveBeenCalledTimes(1);

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("attempt_count = attempt_count + 1"),
      expect.any(Array),
    );

  });
});
