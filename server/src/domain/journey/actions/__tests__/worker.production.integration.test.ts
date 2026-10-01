import { randomUUID } from "node:crypto";

import {
  afterAll,
  afterEach,
  describe,
  expect,
  it,
} from "vitest";

import type {
  InstagramHttpClient,
} from "../../../../integrations/instagram/client.js";

import {
  upsertToken,
} from "../../../../db/tokens.js";

import {
  closePool,
  getPool,
} from "../../../../db/pool.js";

import {
  createTenant,
} from "../../../../db/tenants.js";

import {
  createPublishedJourneyWithClient,
} from "../../../../db/journeyVersions.js";

import {
  createJourneyAction,
} from "../../../../db/journeyActions.js";

import type {
  BuilderGraph,
} from "../../../../db/journeyGraph.js";

import {
  JourneyRuntime,
} from "../../runtime.js";

import {
  JourneyActionWorker,
} from "../worker.js";

import {
  createProductionJourneyActionDispatcher,
} from "../createProductionDispatcher.js";

const pool = getPool();

const TOKEN_KEYRING =
  new Map<string, Buffer>([
    [
      "5c-test-v1",
      Buffer.alloc(32, 8),
    ],
  ]);

function makeGraph(): BuilderGraph {
  return {
    version: 1,
    nodes: [
      {
        id: "trigger",
        type: "trigger",
        position: {
          x: 0,
          y: 0,
        },
        data: {},
        parentGroupId: null,
        collapsed: false,
      },
      {
        id: "message-1",
        type: "message",
        position: {
          x: 200,
          y: 0,
        },
        data: {
          text: "Hello from production worker",
        },
        parentGroupId: null,
        collapsed: false,
      },
    ],
    edges: [
      {
        id: "edge-1",
        sourceNodeId: "trigger",
        targetNodeId: "message-1",
        label: null,
        condition: null,
      },
    ],
  };
}

async function getAction(actionId: string) {
  const result = await pool.query(
    `
      select
        id,
        execution_id,
        action_type,
        payload,
        status,
        attempt_count,
        next_attempt_at,
        last_error,
        acknowledged_at,
        claimed_at
      from journey_actions
      where id = $1
    `,
    [actionId],
  );

  return result.rows[0] ?? null;
}

async function cleanupTenant(
  tenantId: string,
): Promise<void> {
  await pool.query(
    `
      delete from journey_actions
       where execution_id in (
         select id
           from journey_executions
          where tenant_id = $1
       )
    `,
    [tenantId],
  );

  await pool.query(
    `
      delete from journey_node_executions
       where execution_id in (
         select id
           from journey_executions
          where tenant_id = $1
       )
    `,
    [tenantId],
  );

  await pool.query(
    `
      delete from journey_events
       where tenant_id = $1
    `,
    [tenantId],
  );

  await pool.query(
    `
      delete from journey_executions
       where tenant_id = $1
    `,
    [tenantId],
  );

  await pool.query(
    `
      delete from campaign_journey_versions
       where tenant_id = $1
    `,
    [tenantId],
  );

  await pool.query(
    `
      delete from campaigns
       where tenant_id = $1
    `,
    [tenantId],
  );

  await pool.query(
    `
      delete from meta_tokens
       where tenant_id = $1
    `,
    [tenantId],
  );

  await pool.query(
    `
      delete from tenants
       where id = $1
    `,
    [tenantId],
  );
}

describe(
  "production journey worker end-to-end",
  () => {
    const tenantIds: string[] = [];

    afterEach(async () => {
      for (
        const tenantId of
          tenantIds.splice(0)
      ) {
        await cleanupTenant(
          tenantId,
        );
      }
    });

    afterAll(async () => {
      await closePool();
    });

    it(
      "creates a durable action from the runtime and sends it through the production worker",
      async () => {
        const tenant =
          await createTenant(
            pool,
            `5c-e2e-${randomUUID()}`,
          );

        tenantIds.push(
          tenant.id,
        );

        const campaignId =
          randomUUID();

        const instagramAccountId =
          `instagram-${randomUUID()}`;

        const subjectKey =
          `customer-${randomUUID()}`;

        await pool.query(
          `
            insert into campaigns (
              id,
              tenant_id,
              name,
              keywords,
              builder_version
            )
            values ($1, $2, $3, $4, 1)
          `,
          [
            campaignId,
            tenant.id,
            `5c-campaign-${campaignId}`,
            [],
          ],
        );

        await upsertToken(
          pool,
          TOKEN_KEYRING,
          {
            tenantId:
              tenant.id,
            instagramAccountId,
            accessToken:
              "5c-secret-token",
          },
        );

        const client =
          await pool.connect();

        let published;

        try {
          await client.query(
            "begin",
          );

          published =
            await createPublishedJourneyWithClient(
              client,
              tenant.id,
              campaignId,
              makeGraph(),
            );

          await client.query(
            "commit",
          );
        } catch (error) {
          await client.query(
            "rollback",
          );
          throw error;
        } finally {
          client.release();
        }

        const runtime =
          new JourneyRuntime(
            pool,
          );

        const started =
          await runtime.start({
            tenantId:
              tenant.id,
            campaignId,
            subjectKey,
          });

        /*
         * start() should have traversed trigger -> message and therefore
         * created exactly one durable SEND_MESSAGE action.
         */
        expect(
          started.action,
        ).not.toBeNull();

        expect(
          started.action!.type,
        ).toBe(
          "SEND_MESSAGE",
        );

        const actionId =
          (
            await pool.query(
              `
                select id
                  from journey_actions
                 where execution_id = $1
                   and action_type = 'SEND_MESSAGE'
                 order by created_at desc
                 limit 1
              `,
              [started.execution.id],
            )
          ).rows[0]?.id;

        expect(
          actionId,
        ).toBeTruthy();

        const captured: Array<{
          url: string;
          options: {
            headers?: Record<
              string,
              string
            >;
            body?: unknown;
          };
        }> = [];

        const http:
          InstagramHttpClient = {
            async post(
              url,
              options,
            ) {
              captured.push({
                url,
                options,
              });

              return {
                status: 200,
                async json() {
                  return {};
                },
              };
            },
          };

        const dispatcher =
          createProductionJourneyActionDispatcher(
            {
              pool,
              http,
              graphApiBaseUrl:
                "https://graph.test/v24.0",
              tokenKeyring:
                TOKEN_KEYRING,
            },
          );

        const worker =
          new JourneyActionWorker(
            pool,
            dispatcher,
          );

        const processed =
          await worker.processOne();

        expect(
          processed.claimed,
        ).toBe(true);

        expect(
          processed.actionId,
        ).toBe(actionId);

        expect(
          processed.acknowledged,
        ).toBe(true);

        expect(
          captured,
        ).toHaveLength(1);

        expect(
          captured[0]!.url,
        ).toBe(
          "https://graph.test/v24.0/me/messages",
        );

        expect(
          captured[0]!.options.headers,
        ).toMatchObject({
          Authorization:
            "Bearer 5c-secret-token",
          "Content-Type":
            "application/json",
          "Idempotency-Key":
            actionId,
        });

        expect(
          captured[0]!.options.body,
        ).toEqual({
          recipient: {
            id: subjectKey,
          },
          message: {
            text:
              "Hello from production worker",
          },
        });

        const action =
          await getAction(
            actionId,
          );

        expect(
          action,
        ).not.toBeNull();

        expect(
          action!.status,
        ).toBe(
          "acknowledged",
        );

        expect(
          action!.attempt_count,
        ).toBe(0);

        expect(
          action!.acknowledged_at,
        ).not.toBeNull();

        expect(
          action!.claimed_at,
        ).toBeNull();

        /*
         * The action came from the actual published journey runtime,
         * was consumed by the actual JourneyActionWorker, and reached
         * the actual production Instagram provider stack.
         */
        expect(
          action!.execution_id,
        ).toBe(
          started.execution.id,
        );

        expect(
          published.id,
        ).toBe(
          started.execution
            .publishedJourneyVersionId,
        );
      },
    );

    it(
      "moves a production send failure back to pending with retry metadata",
      async () => {
        const tenant =
          await createTenant(
            pool,
            `5c-retry-${randomUUID()}`,
          );

        tenantIds.push(
          tenant.id,
        );

        const campaignId =
          randomUUID();

        const instagramAccountId =
          `instagram-${randomUUID()}`;

        const subjectKey =
          `customer-${randomUUID()}`;

        await pool.query(
          `
            insert into campaigns (
              id,
              tenant_id,
              name,
              keywords,
              builder_version
            )
            values ($1, $2, $3, $4, 1)
          `,
          [
            campaignId,
            tenant.id,
            `5c-retry-campaign-${campaignId}`,
            [],
          ],
        );

        await upsertToken(
          pool,
          TOKEN_KEYRING,
          {
            tenantId:
              tenant.id,
            instagramAccountId,
            accessToken:
              "5c-retry-token",
          },
        );

        const client =
          await pool.connect();

        try {
          await client.query(
            "begin",
          );

          await createPublishedJourneyWithClient(
            client,
            tenant.id,
            campaignId,
            makeGraph(),
          );

          await client.query(
            "commit",
          );
        } catch (error) {
          await client.query(
            "rollback",
          );
          throw error;
        } finally {
          client.release();
        }

        const runtime =
          new JourneyRuntime(
            pool,
          );

        const started =
          await runtime.start({
            tenantId:
              tenant.id,
            campaignId,
            subjectKey,
          });

        const actionId =
          (
            await pool.query(
              `
                select id
                  from journey_actions
                 where execution_id = $1
                   and action_type = 'SEND_MESSAGE'
                 order by created_at desc
                 limit 1
              `,
              [started.execution.id],
            )
          ).rows[0]?.id;

        expect(
          actionId,
        ).toBeTruthy();

        const http:
          InstagramHttpClient = {
            async post() {
              return {
                status: 503,
                async json() {
                  return {
                    error:
                      "temporary provider outage",
                  };
                },
              };
            },
          };

        const dispatcher =
          createProductionJourneyActionDispatcher(
            {
              pool,
              http,
              graphApiBaseUrl:
                "https://graph.test/v24.0",
              tokenKeyring:
                TOKEN_KEYRING,
            },
          );

        /*
         * Zero-delay retry policy lets this test verify the worker's actual
         * failure transition without sleeping.
         */
        const worker =
          new JourneyActionWorker(
            pool,
            dispatcher,
            {
              maxAttempts: 3,
              delaysSeconds: [0, 0, 0],
            },
          );

        await expect(
          worker.processOne(),
        ).rejects.toThrow(
          "Instagram API returned HTTP 503",
        );

        const action =
          await getAction(
            actionId,
          );

        expect(
          action!.status,
        ).toBe(
          "pending",
        );

        expect(
          action!.attempt_count,
        ).toBe(1);

        expect(
          action!.next_attempt_at,
        ).not.toBeNull();

        expect(
          action!.last_error,
        ).toMatchObject({
          name:
            "InstagramApiError",
          message:
            "Instagram API returned HTTP 503",
        });

        expect(
          action!.claimed_at,
        ).toBeNull();
      },
    );
  },
);
