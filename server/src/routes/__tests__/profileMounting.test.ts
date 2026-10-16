import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.js";
import { closePool, getPool } from "../../db/pool.js";
import { createLoggedInTenant } from "../../__tests__/helpers/auth.js";
import { resetDb } from "../../__tests__/helpers/db.js";

const SESSION_SECRET = "profile-mounting-test-secret";

describe("profile API application registration", () => {
  it("registers GET and PATCH /me/profile through createApp", async () => {
    process.env.SESSION_SECRET = SESSION_SECRET;
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL must point at a migrated test database to run this suite.");
    }

    try {
      await resetDb(getPool());
      const { authHeader } = await createLoggedInTenant(getPool(), SESSION_SECRET, "profile-app-mounting");
      const app = createApp();

      const read = await request(app).get("/me/profile").set("Authorization", authHeader);
      expect(read.status).toBe(200);
      expect(read.body.profile).toMatchObject({ email: expect.any(String) });

      const update = await request(app)
        .patch("/me/profile")
        .set("Authorization", authHeader)
        .send({ firstName: "Mounted" });
      expect(update.status).toBe(200);
      expect(update.body.profile.firstName).toBe("Mounted");

      expect((await request(app).get("/me/profile")).status).toBe(401);
    } finally {
      await closePool();
    }
  });
});
