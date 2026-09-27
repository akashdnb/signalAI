import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closePool } from "../pool.js";
import { createTenantForUser } from "../tenants.js";
import { findOrCreateUserByEmail } from "../users.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import {
  createProcessingDocument,
  deleteDocument,
  getDocument,
  insertChunks,
  listDocumentsForTenant,
  markDocumentFailed,
  markDocumentReady,
  queryRelevantChunks,
} from "../knowledgeBase.js";

async function seedTenant(pool: ReturnType<typeof getPool>, email = "owner@example.com") {
  const owner = await findOrCreateUserByEmail(pool, email);
  return createTenantForUser(pool, "creator-a", owner.id);
}

// 768-dim vectors, but only the first couple of components vary — cosine
// similarity between these is driven entirely by those, so tests can
// reason about "closer to A" vs "closer to B" without hand-writing 768
// numbers per case.
function vec(first: number, second: number): number[] {
  return [first, second, ...Array(766).fill(0)];
}

describe("knowledge base (Phase 2C Conversational AI Engine)", () => {
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

  it("creates a document at version 1, then increments version on a same-filename re-upload", async () => {
    const pool = getPool();
    const tenant = await seedTenant(pool);

    const first = await createProcessingDocument(pool, {
      tenantId: tenant.id,
      filename: "faq.pdf",
      contentType: "application/pdf",
      storageKey: "tenants/x/kb/1",
    });
    expect(first.version).toBe(1);
    expect(first.status).toBe("processing");

    const second = await createProcessingDocument(pool, {
      tenantId: tenant.id,
      filename: "faq.pdf",
      contentType: "application/pdf",
      storageKey: "tenants/x/kb/2",
    });
    expect(second.version).toBe(2);
  });

  it("markDocumentReady supersedes the prior ready version of the same filename, not a different filename", async () => {
    const pool = getPool();
    const tenant = await seedTenant(pool);

    const v1 = await createProcessingDocument(pool, {
      tenantId: tenant.id,
      filename: "faq.pdf",
      contentType: "application/pdf",
      storageKey: "k1",
    });
    await markDocumentReady(pool, { tenantId: tenant.id, documentId: v1.id });

    const otherDoc = await createProcessingDocument(pool, {
      tenantId: tenant.id,
      filename: "pricing.pdf",
      contentType: "application/pdf",
      storageKey: "k-other",
    });
    await markDocumentReady(pool, { tenantId: tenant.id, documentId: otherDoc.id });

    const v2 = await createProcessingDocument(pool, {
      tenantId: tenant.id,
      filename: "faq.pdf",
      contentType: "application/pdf",
      storageKey: "k2",
    });
    await markDocumentReady(pool, { tenantId: tenant.id, documentId: v2.id });

    const documents = await listDocumentsForTenant(pool, tenant.id);
    const byId = Object.fromEntries(documents.map((d) => [d.id, d]));

    expect(byId[v1.id]!.supersededAt).not.toBeNull();
    expect(byId[v2.id]!.supersededAt).toBeNull();
    expect(byId[otherDoc.id]!.supersededAt).toBeNull(); // different filename, untouched
  });

  it("markDocumentFailed records the error and leaves the document out of ready status", async () => {
    const pool = getPool();
    const tenant = await seedTenant(pool);
    const doc = await createProcessingDocument(pool, {
      tenantId: tenant.id,
      filename: "faq.pdf",
      contentType: "application/pdf",
      storageKey: "k1",
    });

    await markDocumentFailed(pool, { tenantId: tenant.id, documentId: doc.id, errorReason: "unparseable PDF" });

    const reloaded = await getDocument(pool, tenant.id, doc.id);
    expect(reloaded!.status).toBe("failed");
    expect(reloaded!.errorReason).toBe("unparseable PDF");
  });

  it("queryRelevantChunks is tenant-isolated — never returns another tenant's chunks", async () => {
    const pool = getPool();
    const tenantA = await seedTenant(pool, "a@example.com");
    const tenantB = await seedTenant(pool, "b@example.com");

    const docA = await createProcessingDocument(pool, {
      tenantId: tenantA.id,
      filename: "faq.pdf",
      contentType: "application/pdf",
      storageKey: "kA",
    });
    await markDocumentReady(pool, { tenantId: tenantA.id, documentId: docA.id });
    await insertChunks(pool, {
      tenantId: tenantA.id,
      documentId: docA.id,
      chunks: [{ chunkIndex: 0, content: "tenant A's secret pricing", embedding: vec(1, 0) }],
    });

    const docB = await createProcessingDocument(pool, {
      tenantId: tenantB.id,
      filename: "faq.pdf",
      contentType: "application/pdf",
      storageKey: "kB",
    });
    await markDocumentReady(pool, { tenantId: tenantB.id, documentId: docB.id });
    await insertChunks(pool, {
      tenantId: tenantB.id,
      documentId: docB.id,
      chunks: [{ chunkIndex: 0, content: "tenant B's secret pricing", embedding: vec(1, 0) }],
    });

    const resultsForA = await queryRelevantChunks(pool, tenantA.id, vec(1, 0), 10);
    expect(resultsForA).toHaveLength(1);
    expect(resultsForA[0]!.content).toBe("tenant A's secret pricing");
  });

  it("queryRelevantChunks excludes chunks from a superseded document version", async () => {
    const pool = getPool();
    const tenant = await seedTenant(pool);

    const v1 = await createProcessingDocument(pool, {
      tenantId: tenant.id,
      filename: "faq.pdf",
      contentType: "application/pdf",
      storageKey: "k1",
    });
    await markDocumentReady(pool, { tenantId: tenant.id, documentId: v1.id });
    await insertChunks(pool, {
      tenantId: tenant.id,
      documentId: v1.id,
      chunks: [{ chunkIndex: 0, content: "old content", embedding: vec(1, 0) }],
    });

    const v2 = await createProcessingDocument(pool, {
      tenantId: tenant.id,
      filename: "faq.pdf",
      contentType: "application/pdf",
      storageKey: "k2",
    });
    await markDocumentReady(pool, { tenantId: tenant.id, documentId: v2.id }); // supersedes v1
    await insertChunks(pool, {
      tenantId: tenant.id,
      documentId: v2.id,
      chunks: [{ chunkIndex: 0, content: "new content", embedding: vec(1, 0) }],
    });

    const results = await queryRelevantChunks(pool, tenant.id, vec(1, 0), 10);
    expect(results.map((r) => r.content)).toEqual(["new content"]);
  });

  it("queryRelevantChunks orders by similarity to the query vector, closest first", async () => {
    const pool = getPool();
    const tenant = await seedTenant(pool);
    const doc = await createProcessingDocument(pool, {
      tenantId: tenant.id,
      filename: "faq.pdf",
      contentType: "application/pdf",
      storageKey: "k1",
    });
    await markDocumentReady(pool, { tenantId: tenant.id, documentId: doc.id });
    await insertChunks(pool, {
      tenantId: tenant.id,
      documentId: doc.id,
      chunks: [
        { chunkIndex: 0, content: "far match", embedding: vec(0, 1) },
        { chunkIndex: 1, content: "close match", embedding: vec(0.99, 0.01) },
      ],
    });

    const results = await queryRelevantChunks(pool, tenant.id, vec(1, 0), 10);
    expect(results[0]!.content).toBe("close match");
    expect(results[0]!.similarity).toBeGreaterThan(results[1]!.similarity);
  });

  it("deleteDocument removes the document and its chunks, returning null for a document from another tenant", async () => {
    const pool = getPool();
    const tenantA = await seedTenant(pool, "a@example.com");
    const tenantB = await seedTenant(pool, "b@example.com");
    const doc = await createProcessingDocument(pool, {
      tenantId: tenantA.id,
      filename: "faq.pdf",
      contentType: "application/pdf",
      storageKey: "k1",
    });
    await markDocumentReady(pool, { tenantId: tenantA.id, documentId: doc.id });
    await insertChunks(pool, {
      tenantId: tenantA.id,
      documentId: doc.id,
      chunks: [{ chunkIndex: 0, content: "content", embedding: vec(1, 0) }],
    });

    const wrongTenantResult = await deleteDocument(pool, tenantB.id, doc.id);
    expect(wrongTenantResult).toBeNull();

    const deleted = await deleteDocument(pool, tenantA.id, doc.id);
    expect(deleted!.id).toBe(doc.id);

    expect(await getDocument(pool, tenantA.id, doc.id)).toBeNull();
    const remainingChunks = await queryRelevantChunks(pool, tenantA.id, vec(1, 0), 10);
    expect(remainingChunks).toHaveLength(0);
  });
});
