import type { Pool } from "pg";
import { findOrCreateUserByEmail, getUserSessionVersion, type User } from "../../db/users.js";
import { createTenantForUser, type Tenant } from "../../db/tenants.js";
import { createSessionToken } from "../../lib/session.js";

/**
 * Test-only fixture matching the post-Identity-Refactor model: a real user,
 * owning a real tenant via `tenant_members`, with a session token minted
 * the same way `routes/authEmail.ts` does after a real email-OTP verify.
 * One random-emailed user per call, so cross-tenant tests naturally get
 * two independent identities without asking for it explicitly.
 */
export async function createLoggedInTenant(
  pool: Pool,
  sessionSecret: string,
  tenantName = "creator",
): Promise<{ tenant: Tenant; user: User; authHeader: { Authorization: string } }> {
  const user = await findOrCreateUserByEmail(pool, `${tenantName}-${Math.random().toString(36).slice(2)}@example.com`);
  const tenant = await createTenantForUser(pool, tenantName, user.id);
  const sessionVersion = (await getUserSessionVersion(pool, user.id))!;
  const token = createSessionToken(sessionSecret, user.id, sessionVersion);
  return { tenant, user, authHeader: { Authorization: `Bearer ${token}` } };
}

/** A session token for an existing user — for tests that need to mint a stale/second token for the same identity (e.g. revocation). */
export async function sessionHeaderFor(pool: Pool, sessionSecret: string, userId: string): Promise<{ Authorization: string }> {
  const sessionVersion = (await getUserSessionVersion(pool, userId))!;
  return { Authorization: `Bearer ${createSessionToken(sessionSecret, userId, sessionVersion)}` };
}
