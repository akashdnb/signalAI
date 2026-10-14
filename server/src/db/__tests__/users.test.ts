import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../pool.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import {
  bumpUserSessionVersion,
  findOrCreateUserByEmail,
  getUserByEmail,
  getUserById,
  getUserSessionVersion,
  normalizeEmail,
  findOrCreateUserByGoogle,
} from "../users.js";

describe("users", () => {
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

  it("normalizes email casing and whitespace", () => {
    expect(normalizeEmail("  A@Example.com  ")).toBe("a@example.com");
  });

  it("creates a user on first request, and returns the SAME user on a repeat request regardless of casing", async () => {
    const pool = getPool();
    const first = await findOrCreateUserByEmail(pool, "creator@example.com");
    const second = await findOrCreateUserByEmail(pool, "CREATOR@EXAMPLE.COM");

    expect(second.id).toBe(first.id);

    const count = await pool.query("select count(*)::int as count from users");
    expect(count.rows[0].count).toBe(1);
  });

  it("is race-safe under concurrent first-time creation for the same email", async () => {
    const pool = getPool();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => findOrCreateUserByEmail(pool, "concurrent@example.com")),
    );
    const ids = new Set(results.map((u) => u.id));
    expect(ids.size).toBe(1); // all ten calls resolved to the same user, never two rows

    const count = await pool.query("select count(*)::int as count from users");
    expect(count.rows[0].count).toBe(1);
  });

  it("looks up by id and by email", async () => {
    const pool = getPool();
    const created = await findOrCreateUserByEmail(pool, "creator@example.com");
    expect((await getUserById(pool, created.id))?.id).toBe(created.id);
    expect((await getUserByEmail(pool, "creator@example.com"))?.id).toBe(created.id);
    expect(await getUserById(pool, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("captures Google profile fields and reuses an existing email-OTP identity", async () => {
    const pool = getPool();
    const emailUser = await findOrCreateUserByEmail(pool, "  person@example.com ");
    const googleUser = await findOrCreateUserByGoogle(pool, {
      sub: "google-subject-1",
      email: "PERSON@example.com",
      givenName: "First",
      familyName: "Last",
      picture: "https://example.com/profile.png",
    });

    expect(googleUser.id).toBe(emailUser.id);
    expect(googleUser.email).toBe("person@example.com");
    expect(googleUser.firstName).toBe("First");
    expect(googleUser.lastName).toBe("Last");
    expect(googleUser.profilePictureUrl).toBe("https://example.com/profile.png");
    expect(googleUser.googleSubject).toBe("google-subject-1");
    const count = await pool.query("select count(*)::int as count from users");
    expect(count.rows[0]?.count).toBe(1);
  });

  it("rejects a different Google subject attempting to link to an already linked email", async () => {
    const pool = getPool();
    await findOrCreateUserByGoogle(pool, {
      sub: "google-subject-a",
      email: "linked@example.com",
      givenName: "Person",
      familyName: "One",
      picture: null,
    });

    await expect(findOrCreateUserByGoogle(pool, {
      sub: "google-subject-b",
      email: "LINKED@example.com",
      givenName: "Person",
      familyName: "Two",
      picture: null,
    })).rejects.toThrow("google_identity_conflict");
  });

  it("session_version starts at 1 and bumps independently per user", async () => {
    const pool = getPool();
    const userA = await findOrCreateUserByEmail(pool, "a@example.com");
    const userB = await findOrCreateUserByEmail(pool, "b@example.com");

    expect(await getUserSessionVersion(pool, userA.id)).toBe(1);

    await bumpUserSessionVersion(pool, userA.id);

    expect(await getUserSessionVersion(pool, userA.id)).toBe(2);
    expect(await getUserSessionVersion(pool, userB.id)).toBe(1); // unaffected
  });

  it("getUserSessionVersion returns null for a user that doesn't exist", async () => {
    expect(await getUserSessionVersion(getPool(), "00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});
