import { randomUUID } from "node:crypto";

import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { getPool, closePool } from "../../../db/pool.js";
import { createTenant } from "../../../db/tenants.js";
import {
  InstagramAccountRepository,
} from "../instagramAccounts.js";
import {
  createInstagramMessageSender,
  InstagramAccountNotFoundError,
} from "../createInstagramMessageSender.js";

const pool = getPool();

describe("createInstagramMessageSender", () => {
  const tenantIds: string[] = [];

  beforeEach(() => {
    process.env.CREDENTIAL_ENCRYPTION_KEY =
      Buffer.alloc(32, 9).toString("base64");
  });

  afterEach(async () => {
    for (const tenantId of tenantIds.splice(0)) {
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

  it("creates a MessageSender using the tenant's encrypted credential", async () => {
    const tenant = await createTenant(
      pool,
      `instagram-factory-test-${randomUUID()}`,
    );

    tenantIds.push(tenant.id);

    const repository = new InstagramAccountRepository(pool);

    await repository.save({
      id: randomUUID(),
      tenantId: tenant.id,
      instagramUserId: "ig-user-1",
      accessToken: "tenant-secret",
    });

    const sender = await createInstagramMessageSender(
      {
        pool,
        http: {
          async post() {
            return {
              status: 200,
              async json() {
                return {};
              },
            };
          },
        },
        graphApiBaseUrl: "https://graph.facebook.com/v24.0",
      },
      tenant.id,
      "ig-user-1",
    );

    await expect(
      sender.send({
        idempotencyKey: "action-1",
        tenantId: tenant.id,
        subjectKey: "ig-user-1",
        executionId: "execution-1",
        actionId: "action-1",
        payload: {
          text: "Hello",
        },
      }),
    ).resolves.toBeUndefined();
  });

  it("fails when the tenant has no Instagram account", async () => {
    const tenant = await createTenant(
      pool,
      `instagram-factory-test-${randomUUID()}`,
    );

    tenantIds.push(tenant.id);

    await expect(
      createInstagramMessageSender(
        {
          pool,
          http: {
            async post() {
              throw new Error("should not be called");
            },
          },
          graphApiBaseUrl:
            "https://graph.facebook.com/v24.0",
        },
        tenant.id,
        "missing-instagram-user",
      ),
    ).rejects.toBeInstanceOf(
      InstagramAccountNotFoundError,
    );
  });
});
