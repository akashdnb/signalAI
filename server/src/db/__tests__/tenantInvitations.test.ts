import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closePool, getPool } from "../pool.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import {
  acquireTenantInvitationLock,
  createTenantInvitation,
  getPendingInvitation,
  releaseTenantInvitationLock,
  revokeTenantInvitation,
} from "../tenantInvitations.js";

async function seedInvitation() {
  const pool = getPool();
  const tenant = await pool.query<{ id: string }>(
    `insert into tenants (name) values ('Concurrency Test') returning id`,
  );
  const user = await pool.query<{ id: string }>(
    `insert into users (email) values ('inviter@example.com') returning id`,
  );
  const invitation = await createTenantInvitation(pool, {
    tenantId: tenant.rows[0].id,
    email: "recipient@example.com",
    role: "member",
    tokenHash: `hash-${Date.now()}-${Math.random()}`,
    invitedBy: user.rows[0].id,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  return { tenantId: tenant.rows[0].id, invitationId: invitation.id };
}

describe("tenant invitation concurrency", () => {
  beforeAll(() => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL must point at a migrated test database to run this suite.");
    }
  });

  beforeEach(async () => {
    await resetDb(getPool());
  });

  afterAll(async () => {
    await closePool();
  });

  it("serializes two simultaneous resend attempts on the same invitation", async () => {
    const pool = getPool();
    const { tenantId, invitationId } = await seedInvitation();

    const first = await acquireTenantInvitationLock(pool, tenantId, invitationId);
    let secondAcquired = false;
    const second = acquireTenantInvitationLock(pool, tenantId, invitationId).then((client) => {
      secondAcquired = true;
      return client;
    });

    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(secondAcquired).toBe(false);

    await releaseTenantInvitationLock(first, tenantId, invitationId);
    const secondClient = await second;
    expect(secondAcquired).toBe(true);
    await releaseTenantInvitationLock(secondClient, tenantId, invitationId);
  });

  it("serializes revoke behind an in-flight resend lock", async () => {
    const pool = getPool();
    const { tenantId, invitationId } = await seedInvitation();

    const resendLock = await acquireTenantInvitationLock(pool, tenantId, invitationId);
    let revokeFinished = false;
    const revokePromise = revokeTenantInvitation(pool, tenantId, invitationId).then((result) => {
      revokeFinished = true;
      return result;
    });

    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(revokeFinished).toBe(false);

    await releaseTenantInvitationLock(resendLock, tenantId, invitationId);
    expect(await revokePromise).toBe(true);
    expect(await getPendingInvitation(pool, tenantId, invitationId)).toBeNull();
  });
});
