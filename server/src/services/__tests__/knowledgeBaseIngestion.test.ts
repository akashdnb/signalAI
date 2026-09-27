import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getPool, closePool } from "../../db/pool.js";
import { createTenantForUser } from "../../db/tenants.js";
import { findOrCreateUserByEmail } from "../../db/users.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { listDocumentsForTenant, queryRelevantChunks } from "../../db/knowledgeBase.js";
import type { EmbeddingProvider } from "../../llm/embeddingProvider.js";

const mockUploadObject = vi.fn();
const mockIsObjectStorageConfigured = vi.fn(() => true);
vi.mock("../../lib/objectStorage.js", () => ({
  uploadObject: (...args: unknown[]) => mockUploadObject(...args),
  isObjectStorageConfigured: () => mockIsObjectStorageConfigured(),
}));

const { ingestKnowledgeBaseDocument, isSupportedContentType } = await import("../knowledgeBaseIngestion.js");

const fixturePath = fileURLToPath(new URL("./fixtures/sample-knowledge-base.pdf", import.meta.url));

function vec(seed: number): number[] {
  return Array.from({ length: 768 }, (_, i) => Math.sin(seed + i));
}

function fakeEmbeddingProvider(): EmbeddingProvider {
  return {
    name: "fake",
    embed: vi.fn(async (texts: string[]) => ({ vectors: texts.map((_, i) => vec(i)) })),
  };
}

async function seedTenant(pool: ReturnType<typeof getPool>, email = "owner@example.com") {
  const owner = await findOrCreateUserByEmail(pool, email);
  return createTenantForUser(pool, "creator-a", owner.id);
}

describe("ingestKnowledgeBaseDocument (Phase 2C Knowledge Base upload pipeline)", () => {
  beforeAll(() => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL must point at a migrated test database to run this suite.");
    }
  });

  beforeEach(async () => {
    await resetDb(getPool());
    mockUploadObject.mockReset().mockResolvedValue(undefined);
    mockIsObjectStorageConfigured.mockReset().mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await closePool();
  });

  it("ingests a plain-text document: chunks, embeds, stores, and marks it ready", async () => {
    const pool = getPool();
    const tenant = await seedTenant(pool);
    const provider = fakeEmbeddingProvider();
    const text = "Our refund window is 30 days after purchase.";

    const doc = await ingestKnowledgeBaseDocument(pool, provider, {
      tenantId: tenant.id,
      filename: "faq.txt",
      contentType: "text/plain",
      buffer: Buffer.from(text, "utf-8"),
    });

    expect(doc.status).toBe("ready");
    expect(mockUploadObject).toHaveBeenCalledWith(doc.storageKey, expect.any(Buffer), "text/plain");

    const chunks = await queryRelevantChunks(pool, tenant.id, vec(0), 10);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.content).toBe(text);
  });

  it("ingests a real PDF: extracts text, chunks, embeds, and marks it ready", async () => {
    const pool = getPool();
    const tenant = await seedTenant(pool);
    const provider = fakeEmbeddingProvider();
    const buffer = readFileSync(fixturePath);

    const doc = await ingestKnowledgeBaseDocument(pool, provider, {
      tenantId: tenant.id,
      filename: "policies.pdf",
      contentType: "application/pdf",
      buffer,
    });

    expect(doc.status).toBe("ready");
    const chunks = await queryRelevantChunks(pool, tenant.id, vec(0), 10);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]!.content).toContain("refund window is 30 days");
  });

  it("rejects an unsupported content type before creating any document row", async () => {
    const pool = getPool();
    const tenant = await seedTenant(pool);
    const provider = fakeEmbeddingProvider();

    await expect(
      ingestKnowledgeBaseDocument(pool, provider, {
        tenantId: tenant.id,
        filename: "sheet.xlsx",
        contentType: "application/vnd.ms-excel",
        buffer: Buffer.from("x"),
      }),
    ).rejects.toThrow(/unsupported content type/);

    expect(await listDocumentsForTenant(pool, tenant.id)).toHaveLength(0);
  });

  it("rejects when object storage isn't configured, before creating any document row", async () => {
    mockIsObjectStorageConfigured.mockReturnValue(false);
    const pool = getPool();
    const tenant = await seedTenant(pool);
    const provider = fakeEmbeddingProvider();

    await expect(
      ingestKnowledgeBaseDocument(pool, provider, {
        tenantId: tenant.id,
        filename: "faq.txt",
        contentType: "text/plain",
        buffer: Buffer.from("hello"),
      }),
    ).rejects.toThrow(/object storage is not configured/);

    expect(await listDocumentsForTenant(pool, tenant.id)).toHaveLength(0);
  });

  it("fails closed on an embedding-provider error: marks the version failed and leaves a prior ready version untouched", async () => {
    const pool = getPool();
    const tenant = await seedTenant(pool);
    const workingProvider = fakeEmbeddingProvider();

    const v1 = await ingestKnowledgeBaseDocument(pool, workingProvider, {
      tenantId: tenant.id,
      filename: "faq.txt",
      contentType: "text/plain",
      buffer: Buffer.from("first version content"),
    });
    expect(v1.status).toBe("ready");

    const failingProvider: EmbeddingProvider = {
      name: "failing",
      embed: vi.fn().mockRejectedValue(new Error("embeddings API is down")),
    };
    const v2 = await ingestKnowledgeBaseDocument(pool, failingProvider, {
      tenantId: tenant.id,
      filename: "faq.txt",
      contentType: "text/plain",
      buffer: Buffer.from("second version content"),
    });

    expect(v2.status).toBe("failed");
    expect(v2.errorReason).toMatch(/embeddings API is down/);

    // The prior ready version must still be the one retrieval serves.
    const chunks = await queryRelevantChunks(pool, tenant.id, vec(0), 10);
    expect(chunks.map((c) => c.content)).toEqual(["first version content"]);
  });

  it("fails closed on an object-storage upload error", async () => {
    mockUploadObject.mockRejectedValue(new Error("S3 bucket unreachable"));
    const pool = getPool();
    const tenant = await seedTenant(pool);
    const provider = fakeEmbeddingProvider();

    const doc = await ingestKnowledgeBaseDocument(pool, provider, {
      tenantId: tenant.id,
      filename: "faq.txt",
      contentType: "text/plain",
      buffer: Buffer.from("some content"),
    });

    expect(doc.status).toBe("failed");
    expect(doc.errorReason).toMatch(/S3 bucket unreachable/);
    expect(await queryRelevantChunks(pool, tenant.id, vec(0), 10)).toHaveLength(0);
  });

  it("isSupportedContentType accepts pdf/plain/markdown and rejects others", () => {
    expect(isSupportedContentType("application/pdf")).toBe(true);
    expect(isSupportedContentType("text/plain")).toBe(true);
    expect(isSupportedContentType("text/markdown")).toBe(true);
    expect(isSupportedContentType("application/msword")).toBe(false);
  });
});
