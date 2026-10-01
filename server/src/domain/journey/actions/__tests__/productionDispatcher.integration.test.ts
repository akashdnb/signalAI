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

import type {
  JourneyAction,
} from "../../../../db/journeyActions.js";

import {
  createProductionJourneyActionDispatcher,
} from "../createProductionDispatcher.js";

const pool = getPool();

const TOKEN_KEYRING =
  new Map<string, Buffer>([
    [
      "test-v1",
      Buffer.alloc(32, 6),
    ],
  ]);

describe(
  "production journey action dispatcher",
  () => {
    const tenantIds: string[] = [];

    afterEach(async () => {
      for (
        const tenantId of
          tenantIds.splice(0)
      ) {
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
    });

    afterAll(async () => {
      await closePool();
    });

    it(
      "resolves the tenant Instagram credential and sends a SEND_MESSAGE action",
      async () => {
        const tenant =
          await createTenant(
            pool,
            `production-dispatcher-${randomUUID()}`,
          );

        tenantIds.push(
          tenant.id,
        );

        const instagramAccountId =
          `instagram-${randomUUID()}`;

        await upsertToken(
          pool,
          TOKEN_KEYRING,
          {
            tenantId:
              tenant.id,
            instagramAccountId,
            accessToken:
              "secret-production-token",
          },
        );

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

        const action:
          JourneyAction = {
            id:
              "action-production-1",
            executionId:
              "execution-production-1",
            nodeExecutionId:
              null,
            actionType:
              "SEND_MESSAGE",
            payload: {
              data: {
                text:
                  "Hello from the journey",
              },
            },
            status:
              "processing",
            attemptCount:
              0,
            nextAttemptAt:
              null,
            lastError:
              null,
            createdAt:
              "2026-10-01T00:00:00.000Z",
            acknowledgedAt:
              null,
            claimedAt:
              "2026-10-01T00:00:00.000Z",
          };

        await dispatcher.dispatch(
          action,
          {
            executionId:
              action.executionId,
            tenantId:
              tenant.id,
            campaignId:
              "campaign-production-1",
            subjectKey:
              "customer-instagram-123",
          },
        );

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
            "Bearer secret-production-token",
          "Content-Type":
            "application/json",
          "Idempotency-Key":
            "action-production-1",
        });

        expect(
          captured[0]!.options.body,
        ).toEqual({
          recipient: {
            id:
              "customer-instagram-123",
          },
          message: {
            text:
              "Hello from the journey",
          },
        });
      },
    );

    it(
      "fails clearly when the tenant has no connected Instagram account",
      async () => {
        const tenant =
          await createTenant(
            pool,
            `production-dispatcher-missing-${randomUUID()}`,
          );

        tenantIds.push(
          tenant.id,
        );

        const http:
          InstagramHttpClient = {
            async post() {
              throw new Error(
                "HTTP client should not be called",
              );
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

        const action:
          JourneyAction = {
            id:
              "action-production-missing-1",
            executionId:
              "execution-production-missing-1",
            nodeExecutionId:
              null,
            actionType:
              "SEND_MESSAGE",
            payload: {
              data: {
                text:
                  "Hello",
              },
            },
            status:
              "processing",
            attemptCount:
              0,
            nextAttemptAt:
              null,
            lastError:
              null,
            createdAt:
              "2026-10-01T00:00:00.000Z",
            acknowledgedAt:
              null,
            claimedAt:
              "2026-10-01T00:00:00.000Z",
          };

        await expect(
          dispatcher.dispatch(
            action,
            {
              executionId:
                action.executionId,
              tenantId:
                tenant.id,
              campaignId:
                "campaign-production-missing-1",
              subjectKey:
                "customer-instagram-123",
            },
          ),
        ).rejects.toThrow(
          `No connected Instagram account for tenant ${tenant.id}`,
        );
      },
    );
  },
);
