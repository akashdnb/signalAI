import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../pool.js";
import { createTenant } from "../tenants.js";
import { findOrCreateLeadByInstagramUserId } from "../leads.js";
import { insertEventIdempotent } from "../events.js";
import { upsertMediaMetadata, listKnownMediaForTenant } from "../mediaMetadata.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import type { RawMediaMetadata } from "../../lib/instagramMedia.js";

function metadata(overrides: Partial<RawMediaMetadata> = {}): RawMediaMetadata {
  return {
    mediaId: "media-1",
    caption: "Look at this!",
    mediaType: "IMAGE",
    thumbnailUrl: "https://example.com/thumb.jpg",
    permalink: "https://www.instagram.com/p/abc123/",
    postedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

async function seedComment(pool: ReturnType<typeof getPool>, tenantId: string, mediaId: string, occurredAt: Date) {
  const lead = await findOrCreateLeadByInstagramUserId(pool, tenantId, `ig-${mediaId}-${Math.random()}`);
  await insertEventIdempotent(pool, {
    tenantId,
    leadId: lead.id,
    metaEventId: `evt-${Math.random()}`,
    eventType: "comment",
    occurredAt,
    sequence: 1,
    attributes: { mediaId },
  });
}

describe("mediaMetadata", () => {
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

  it("upsertMediaMetadata inserts then updates the same (tenant, media) row", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");

    await upsertMediaMetadata(pool, tenant.id, metadata({ caption: "first" }));
    await upsertMediaMetadata(pool, tenant.id, metadata({ caption: "second" }));

    const rows = await pool.query("select caption from media_metadata where tenant_id = $1", [tenant.id]);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].caption).toBe("second");
  });

  it("lists a post observed only via comments, with no metadata yet", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    await seedComment(pool, tenant.id, "media-observed", new Date());

    const known = await listKnownMediaForTenant(pool, tenant.id);
    expect(known).toEqual([
      expect.objectContaining({ mediaId: "media-observed", commentCount: 1, caption: null, permalink: null }),
    ]);
  });

  it("lists a post added by URL (metadata only, zero comments) alongside an observed one", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    await seedComment(pool, tenant.id, "media-observed", new Date());
    await upsertMediaMetadata(pool, tenant.id, metadata({ mediaId: "media-added-by-url" }));

    const known = await listKnownMediaForTenant(pool, tenant.id);
    const byId = Object.fromEntries(known.map((m) => [m.mediaId, m]));

    expect(byId["media-observed"]).toMatchObject({ commentCount: 1 });
    expect(byId["media-added-by-url"]).toMatchObject({
      commentCount: 0,
      lastSeenAt: null,
      caption: "Look at this!",
      permalink: "https://www.instagram.com/p/abc123/",
    });
  });

  it("merges cached metadata onto a post that's both observed and enriched", async () => {
    const pool = getPool();
    const tenant = await createTenant(pool, "creator-a");
    await seedComment(pool, tenant.id, "media-1", new Date());
    await upsertMediaMetadata(pool, tenant.id, metadata({ mediaId: "media-1" }));

    const known = await listKnownMediaForTenant(pool, tenant.id);
    expect(known).toEqual([
      expect.objectContaining({ mediaId: "media-1", commentCount: 1, caption: "Look at this!" }),
    ]);
  });

  it("never surfaces another tenant's known media", async () => {
    const pool = getPool();
    const tenantA = await createTenant(pool, "creator-a");
    const tenantB = await createTenant(pool, "creator-b");
    await upsertMediaMetadata(pool, tenantA.id, metadata({ mediaId: "media-a" }));

    expect(await listKnownMediaForTenant(pool, tenantB.id)).toEqual([]);
  });
});
