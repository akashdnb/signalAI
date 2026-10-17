import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { getPool, closePool } from "../../db/pool.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { createLoggedInTenant } from "../../__tests__/helpers/auth.js";
import { getUserById } from "../../db/users.js";

const SESSION_SECRET = "test-session-secret";

describe("profile routes", () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = SESSION_SECRET;
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must point at a migrated test database to run this suite.");
  });

  beforeEach(async () => {
    await resetDb(getPool());
  });

  afterAll(async () => {
    await closePool();
  });

  it("reads the authenticated user's profile without exposing auth internals", async () => {
    const { user, authHeader } = await createLoggedInTenant(getPool(), SESSION_SECRET, "profile-read");
    const response = await request(createApp()).get("/me/profile").set(authHeader);
    expect(response.status).toBe(200);
    expect(response.body.profile).toMatchObject({ id: user.id, email: user.email, firstName: null, lastName: null });
    expect(response.body.profile).not.toHaveProperty("googleSubject");
    expect(response.body.profile).not.toHaveProperty("sessionVersion");
  });

  it("updates only the authenticated user's profile and persists it", async () => {
    const { user, authHeader } = await createLoggedInTenant(getPool(), SESSION_SECRET, "profile-update");
    const response = await request(createApp()).patch("/me/profile").set(authHeader).send({
      firstName: " Akash ", lastName: "Ranjan", profilePictureUrl: "https://cdn.example.com/avatar.png",
    });
    expect(response.status).toBe(200);
    expect(response.body.profile).toMatchObject({ firstName: "Akash", lastName: "Ranjan" });
    const persisted = await getUserById(getPool(), user.id);
    expect(persisted).toMatchObject({ firstName: "Akash", lastName: "Ranjan", profilePictureUrl: "https://cdn.example.com/avatar.png" });
  });

  it("supports clearing profile fields explicitly while leaving omitted fields unchanged", async () => {
    const { user, authHeader } = await createLoggedInTenant(getPool(), SESSION_SECRET, "profile-clear");
    const pool = getPool();
    await pool.query("update users set first_name = 'Existing', last_name = 'Name' where id = $1", [user.id]);
    const response = await request(createApp()).patch("/me/profile").set(authHeader).send({ firstName: null });
    expect(response.status).toBe(200);
    expect(response.body.profile.firstName).toBeNull();
    expect(response.body.profile.lastName).toBe("Name");
  });

  it("rejects unsupported profile fields and invalid values", async () => {
    const { authHeader } = await createLoggedInTenant(getPool(), SESSION_SECRET, "profile-invalid");
    const app = createApp();
    expect((await request(app).patch("/me/profile").set(authHeader).send({ firstName: 123 })).status).toBe(400);
    expect((await request(app).patch("/me/profile").set(authHeader).send({ firstName: "x".repeat(81) })).status).toBe(400);
    expect((await request(app).patch("/me/profile").set(authHeader).send({ profilePictureUrl: "javascript:alert(1)" })).status).toBe(400);
    expect((await request(app).patch("/me/profile").set(authHeader).send({ email: "other@example.com" })).status).toBe(400);
    expect((await request(app).patch("/me/profile").set(authHeader).send({})).status).toBe(400);
  });

  it("rejects unauthenticated profile access and updates", async () => {
    const app = createApp();
    expect((await request(app).get("/me/profile")).status).toBe(401);
    expect((await request(app).patch("/me/profile").send({ firstName: "Nope" })).status).toBe(401);
  });
});
