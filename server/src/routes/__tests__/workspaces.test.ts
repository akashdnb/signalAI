import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { getPool, closePool } from "../../db/pool.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { createLoggedInTenant, sessionHeaderFor } from "../../__tests__/helpers/auth.js";
import { listWorkspacesForUser } from "../../db/tenantMembers.js";
import { findOrCreateUserByEmail } from "../../db/users.js";

const SESSION_SECRET = "test-session-secret";

describe("workspace switcher + edit routes (agency workspaces)", () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = SESSION_SECRET;
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

  describe("GET /me/workspaces", () => {
    it("requires a session", async () => {
      const res = await request(createApp()).get("/me/workspaces");
      expect(res.status).toBe(401);
    });

    it("returns every workspace the user belongs to, with name, description, and role", async () => {
      const pool = getPool();
      const { user, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "My workspace");
      const app = createApp();

      // Create a second workspace for the same user via the API.
      await request(app)
        .post("/workspaces")
        .set(authHeader)
        .send({ name: "Studio North", description: "Agency client account" });

      const res = await request(app).get("/me/workspaces").set(authHeader);
      expect(res.status).toBe(200);
      expect(res.body.workspaces).toHaveLength(2);
      const names = res.body.workspaces.map((w: { name: string }) => w.name);
      expect(names).toEqual(["My workspace", "Studio North"]); // ordered by created_at
      expect(res.body.workspaces[1]).toMatchObject({
        name: "Studio North",
        description: "Agency client account",
        role: "owner",
      });
      // Sanity: matches the DB helper.
      expect(await listWorkspacesForUser(pool, user.id)).toHaveLength(2);
    });

    it("does not leak a workspace the user is not a member of", async () => {
      const pool = getPool();
      const { authHeader: aliceAuth } = await createLoggedInTenant(pool, SESSION_SECRET, "Alice ws");
      await createLoggedInTenant(pool, SESSION_SECRET, "Bob ws");

      const res = await request(createApp()).get("/me/workspaces").set(aliceAuth);
      expect(res.body.workspaces).toHaveLength(1);
      expect(res.body.workspaces[0].name).toBe("Alice ws");
    });
  });

  describe("POST /workspaces", () => {
    it("creates a workspace owned by the caller and returns it", async () => {
      const pool = getPool();
      const { authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "My workspace");

      const res = await request(createApp())
        .post("/workspaces")
        .set(authHeader)
        .send({ name: "Client Demo" });

      expect(res.status).toBe(201);
      expect(res.body.workspace).toMatchObject({ name: "Client Demo", description: null, role: "owner" });
      expect(res.body.workspace.tenantId).toBeTruthy();
    });

    it("rejects an invalid name", async () => {
      const pool = getPool();
      const { authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "My workspace");

      const res = await request(createApp()).post("/workspaces").set(authHeader).send({ name: "   " });
      expect(res.status).toBe(400);
    });

    it("requires a session", async () => {
      const res = await request(createApp()).post("/workspaces").send({ name: "No auth" });
      expect(res.status).toBe(401);
    });
  });

  describe("PATCH /tenants/:tenantId", () => {
    it("lets an owner rename and describe the workspace", async () => {
      const pool = getPool();
      const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "Old name");

      const res = await request(createApp())
        .patch(`/tenants/${tenant.id}`)
        .set(authHeader)
        .send({ name: "New name", description: "Now described" });

      expect(res.status).toBe(200);
      expect(res.body.workspace).toMatchObject({
        tenantId: tenant.id,
        name: "New name",
        description: "Now described",
      });
    });

    it("clears the description when passed null", async () => {
      const pool = getPool();
      const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "Has desc");
      const app = createApp();

      await request(app).patch(`/tenants/${tenant.id}`).set(authHeader).send({ description: "temporary" });
      const res = await request(app).patch(`/tenants/${tenant.id}`).set(authHeader).send({ description: null });

      expect(res.status).toBe(200);
      expect(res.body.workspace.description).toBeNull();
    });

    it("rejects an empty patch and invalid values", async () => {
      const pool = getPool();
      const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "Ws");
      const app = createApp();

      expect((await request(app).patch(`/tenants/${tenant.id}`).set(authHeader).send({})).status).toBe(400);
      expect(
        (await request(app).patch(`/tenants/${tenant.id}`).set(authHeader).send({ name: "" })).status,
      ).toBe(400);
    });

    it("forbids a plain member (not owner/admin) from editing a workspace", async () => {
      const pool = getPool();
      const { tenant } = await createLoggedInTenant(pool, SESSION_SECRET, "Owned ws");
      const member = await findOrCreateUserByEmail(pool, "member@example.com");
      await pool.query(`insert into tenant_members (tenant_id, user_id, role) values ($1, $2, 'member')`, [
        tenant.id,
        member.id,
      ]);
      const memberAuth = await sessionHeaderFor(pool, SESSION_SECRET, member.id);

      const res = await request(createApp())
        .patch(`/tenants/${tenant.id}`)
        .set(memberAuth)
        .send({ name: "Member rename attempt" });
      expect(res.status).toBe(403);
    });

    it("forbids a non-member from editing a workspace", async () => {
      const pool = getPool();
      const { tenant } = await createLoggedInTenant(pool, SESSION_SECRET, "Owner ws");
      const { authHeader: strangerAuth } = await createLoggedInTenant(pool, SESSION_SECRET, "Stranger ws");

      const res = await request(createApp())
        .patch(`/tenants/${tenant.id}`)
        .set(strangerAuth)
        .send({ name: "Hijacked" });
      expect(res.status).toBe(403);
    });
  });
});
