import { createHmac, randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  createInstagramWebhookRouter,
} from "../instagramWebhook.js";

import {
  JourneyRuntime,
} from "../../domain/journey/runtime.js";

import {
  createPublishedJourneyWithClient,
} from "../../db/journeyVersions.js";

import {
  getPool,
  closePool,
} from "../../db/pool.js";

import {
  createTenant,
} from "../../db/tenants.js";

import {
  upsertToken,
} from "../../db/tokens.js";

import {
  getBoss,
} from "../../queue/boss.js";

import {
  ensureInstagramInboundQueue,
} from "../../queue/instagramInboundQueue.js";

import {
  startInstagramInboundWorker,
} from "../../queue/instagramInboundWorker.js";

import type {
  BuilderGraph,
} from "../../db/journeyGraph.js";

const pool = getPool();

const runtime =
  new JourneyRuntime(pool);

const APP_SECRET =
  "integration-app-secret";

const VERIFY_TOKEN =
  "integration-verify-token";

const TOKEN_KEYRING =
  new Map<string, Buffer>([
    [
      "integration-test",
      Buffer.alloc(32, 4),
    ],
  ]);

function sign(
  body: string,
): string {
  return `sha256=${createHmac(
    "sha256",
    APP_SECRET,
  )
    .update(body)
    .digest("hex")}`;
}

function makeGraph(
  version: number,
): BuilderGraph {
  return {
    version,
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
          text: "Hello",
        },
        parentGroupId: null,
        collapsed: false,
      },
      {
        id: "handoff-1",
        type: "human_handoff",
        position: {
          x: 400,
          y: 0,
        },
        data: {},
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
      {
        id: "edge-2",
        sourceNodeId: "message-1",
        targetNodeId: "handoff-1",
        label: null,
        condition: null,
      },
    ],
  };
}

async function setup() {
  const tenant =
    await createTenant(
      pool,
      `instagram-webhook-route-${randomUUID()}`,
    );

  const campaignId =
    randomUUID();

  const instagramProviderAccountId =
    `instagram-${randomUUID()}`;

  const subjectKey =
    `instagram-user-${randomUUID()}`;

  const providerEventId =
    `mid.${randomUUID()}`;

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
      `instagram-route-test-${campaignId}`,
      [],
    ],
  );

  await upsertToken(
    pool,
    TOKEN_KEYRING,
    {
      tenantId: tenant.id,
      instagramAccountId:
        instagramProviderAccountId,
      accessToken:
        "integration-test-token",
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
      makeGraph(1),
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

  const started =
    await runtime.start({
      tenantId: tenant.id,
      campaignId,
      subjectKey,
    });

  return {
    tenantId: tenant.id,
    campaignId,
    instagramProviderAccountId,
    subjectKey,
    providerEventId,
    executionId:
      started.execution.id,
  };
}

async function cleanup(
  tenantId: string,
): Promise<void> {
  await pool.query(
    `
      delete from instagram_inbound_events
       where tenant_id = $1
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
  "Instagram webhook end-to-end",
  () => {
    beforeAll(async () => {
      const boss = await getBoss();
      await ensureInstagramInboundQueue(boss);
      await startInstagramInboundWorker(
        boss,
        pool,
      );
    });

    afterAll(async () => {
      await closePool();
    });


    it(
      "persists the inbound event before acknowledging the webhook",
      async () => {
        const data = await setup();

        try {
          const send = vi.fn(
            async (
              _queueName: string,
              _job: unknown,
              _options: unknown,
            ) => "job-1",
          );

          const app = express();

          app.use(
            express.json({
              verify: (
                req,
                _res,
                buf,
              ) => {
                (
                  req as express.Request
                ).rawBody = buf;
              },
            }),
          );

          app.use(
            createInstagramWebhookRouter({
              pool,
              verifyToken:
                VERIFY_TOKEN,
              appSecret:
                APP_SECRET,
              boss: {
                send,
              } as any,
            }),
          );

          const payload = {
            object:
              "instagram",
            entry: [
              {
                id:
                  data.instagramProviderAccountId,
                messaging: [
                  {
                    sender: {
                      id:
                        data.subjectKey,
                    },
                    recipient: {
                      id:
                        data.instagramProviderAccountId,
                    },
                    timestamp:
                      Date.now(),
                    message: {
                      mid:
                        data.providerEventId,
                      text:
                        "Hello",
                    },
                  },
                ],
              },
            ],
          };

          const body =
            JSON.stringify(
              payload,
            );

          const response =
            await request(app)
              .post("/instagram")
              .set(
                "content-type",
                "application/json",
              )
              .set(
                "x-hub-signature-256",
                sign(body),
              )
              .send(body);

          expect(
            response.status,
          ).toBe(200);

          expect(
            send,
          ).toHaveBeenCalledTimes(1);

          const [queueName, job, options] =
            send.mock.calls[0]!;

          expect(queueName).toBe(
            "instagram-inbound",
          );

          expect(job).toMatchObject({
            tenantId:
              data.tenantId,
            instagramUserId:
              data.subjectKey,
            providerEventId:
              data.providerEventId,
          });

          expect(
            (job as any).inboundEventId,
          ).toBeTruthy();

          expect(
            (options as any).db,
          ).toBeTruthy();

          const event =
            await pool.query(
              `
                select
                  status,
                  provider_event_id
                from instagram_inbound_events
                where tenant_id = $1
                  and provider_event_id = $2
              `,
              [
                data.tenantId,
                data.providerEventId,
              ],
            );

          expect(
            event.rows,
          ).toEqual([
            {
              status: "received",
              provider_event_id:
                data.providerEventId,
            },
          ]);
        } finally {
          await cleanup(
            data.tenantId,
          );
        }
      },
    );

    it(
      "does not acknowledge the webhook when queue enqueue fails",
      async () => {
        const data = await setup();

        try {
          const send =
            vi.fn(
              async (
                _queueName: string,
                _job: unknown,
                _options: unknown,
              ) => {
                throw new Error(
                  "queue unavailable",
                );
              },
            );

          const app = express();

          app.use(
            express.json({
              verify: (
                req,
                _res,
                buf,
              ) => {
                (
                  req as express.Request
                ).rawBody = buf;
              },
            }),
          );

          app.use(
            createInstagramWebhookRouter({
              pool,
              verifyToken:
                VERIFY_TOKEN,
              appSecret:
                APP_SECRET,
              boss: {
                send,
              } as any,
            }),
          );

          const payload = {
            object:
              "instagram",
            entry: [
              {
                id:
                  data.instagramProviderAccountId,
                messaging: [
                  {
                    sender: {
                      id:
                        data.subjectKey,
                    },
                    recipient: {
                      id:
                        data.instagramProviderAccountId,
                    },
                    timestamp:
                      Date.now(),
                    message: {
                      mid:
                        data.providerEventId,
                      text:
                        "Hello",
                    },
                  },
                ],
              },
            ],
          };

          const body =
            JSON.stringify(
              payload,
            );

          const response =
            await request(app)
              .post("/instagram")
              .set(
                "content-type",
                "application/json",
              )
              .set(
                "x-hub-signature-256",
                sign(body),
              )
              .send(body);

          expect(
            response.status,
          ).toBe(500);

          /*
           * The event insert and queue insert shared one transaction,
           * so the queue failure must roll the event insert back too.
           */
          const event =
            await pool.query(
              `
                select 1
                from instagram_inbound_events
                where tenant_id = $1
                  and provider_event_id = $2
              `,
              [
                data.tenantId,
                data.providerEventId,
              ],
            );

          expect(
            event.rows,
          ).toHaveLength(0);
        } finally {
          await cleanup(
            data.tenantId,
          );
        }
      },
    );

    it(
      "routes an Instagram message into the active journey execution",
      async () => {
        const data =
          await setup();

        try {
          const app =
            express();

          app.use(
            express.json({
              verify: (
                req,
                _res,
                buf,
              ) => {
                (
                  req as express.Request
                ).rawBody = buf;
              },
            }),
          );

          app.use(
            createInstagramWebhookRouter({
              pool,
              runtime,
              verifyToken:
                VERIFY_TOKEN,
              appSecret:
                APP_SECRET,
            }),
          );

          const payload = {
            object:
              "instagram",
            entry: [
              {
                id:
                  data.instagramProviderAccountId,
                messaging: [
                  {
                    sender: {
                      id:
                        data.subjectKey,
                    },
                    recipient: {
                      id:
                        data.instagramProviderAccountId,
                    },
                    timestamp:
                      Date.now(),
                    message: {
                      mid:
                        data.providerEventId,
                      text:
                        "Hello",
                    },
                  },
                ],
              },
            ],
          };

          const body =
            JSON.stringify(
              payload,
            );

          const response =
            await request(app)
              .post("/instagram")
              .set(
                "content-type",
                "application/json",
              )
              .set(
                "x-hub-signature-256",
                sign(body),
              )
              .send(body);

          expect(
            response.status,
          ).toBe(200);

          const deadline =
            Date.now() + 5000;

          let inboundStatus:
            string | null =
            null;

          while (
            Date.now() <
            deadline
          ) {
            const result =
              await pool.query(
                `
                  select
                    status,
                    journey_execution_id
                  from instagram_inbound_events
                  where tenant_id = $1
                    and provider_event_id = $2
                `,
                [
                  data.tenantId,
                  data.providerEventId,
                ],
              );

            if (
              result.rows.length >
              0
            ) {
              inboundStatus =
                result.rows[0].status;

              if (
                inboundStatus ===
                "processed"
              ) {
                expect(
                  result.rows[0]
                    .journey_execution_id,
                ).toBe(
                  data.executionId,
                );

                break;
              }
            }

            await new Promise(
              (resolve) =>
                setTimeout(
                  resolve,
                  25,
                ),
            );
          }

          expect(
            inboundStatus,
          ).toBe("processed");

          const event =
            await pool.query(
              `
                select
                  event_id,
                  event_type
                from journey_events
                where tenant_id = $1
                  and execution_id = $2
                  and event_id = $3
              `,
              [
                data.tenantId,
                data.executionId,
                data.providerEventId,
              ],
            );

          expect(
            event.rows,
          ).toHaveLength(1);

          expect(
            event.rows[0],
          ).toEqual({
            event_id:
              data.providerEventId,
            event_type:
              "message",
          });
        } finally {
          await cleanup(
            data.tenantId,
          );
        }
      },
    );
  },
);
