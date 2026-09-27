import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../pool.js";
import { createTenantForUser } from "../tenants.js";
import { findOrCreateUserByEmail } from "../users.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { getGuardrailsConfig, upsertGuardrailsConfig } from "../guardrailsConfig.js";

describe("tenant guardrails config (Phase 2C Client Guardrails)", () => {
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

  it("returns null when no config has been set yet — absence, not disabled guardrails", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "creator-a", owner.id);

    expect(await getGuardrailsConfig(pool, tenant.id)).toBeNull();
  });

  it("upserts and reads back brand voice, forbidden topics, and escalation triggers", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "creator-a", owner.id);

    await upsertGuardrailsConfig(pool, {
      tenantId: tenant.id,
      brandVoice: "Friendly and casual, never corporate-sounding.",
      forbiddenTopics: ["competitor pricing", "refund policy exceptions"],
      escalationTriggers: ["angry", "lawyer", "refund now"],
    });

    const config = await getGuardrailsConfig(pool, tenant.id);
    expect(config).toMatchObject({
      brandVoice: "Friendly and casual, never corporate-sounding.",
      forbiddenTopics: ["competitor pricing", "refund policy exceptions"],
      escalationTriggers: ["angry", "lawyer", "refund now"],
    });
  });

  it("a second upsert replaces the config rather than creating a second row", async () => {
    const pool = getPool();
    const owner = await findOrCreateUserByEmail(pool, "owner@example.com");
    const tenant = await createTenantForUser(pool, "creator-a", owner.id);

    await upsertGuardrailsConfig(pool, {
      tenantId: tenant.id,
      brandVoice: "Formal.",
      forbiddenTopics: ["a"],
      escalationTriggers: ["b"],
    });
    await upsertGuardrailsConfig(pool, {
      tenantId: tenant.id,
      brandVoice: "Casual.",
      forbiddenTopics: ["c"],
      escalationTriggers: ["d"],
    });

    const config = await getGuardrailsConfig(pool, tenant.id);
    expect(config).toMatchObject({ brandVoice: "Casual.", forbiddenTopics: ["c"], escalationTriggers: ["d"] });
  });

  it("is tenant-isolated — one tenant's config is invisible to another", async () => {
    const pool = getPool();
    const ownerA = await findOrCreateUserByEmail(pool, "a@example.com");
    const tenantA = await createTenantForUser(pool, "creator-a", ownerA.id);
    const ownerB = await findOrCreateUserByEmail(pool, "b@example.com");
    const tenantB = await createTenantForUser(pool, "creator-b", ownerB.id);

    await upsertGuardrailsConfig(pool, {
      tenantId: tenantA.id,
      brandVoice: "Tenant A's voice",
      forbiddenTopics: [],
      escalationTriggers: [],
    });

    expect(await getGuardrailsConfig(pool, tenantB.id)).toBeNull();
  });
});
