import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.js";
import { getPool, closePool } from "../../db/pool.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { createLoggedInTenant } from "../../__tests__/helpers/auth.js";
import type { EmbeddingProvider } from "../../llm/embeddingProvider.js";
import { queryRelevantChunks } from "../../db/knowledgeBase.js";

const SESSION_SECRET = "test-session-secret";

const mockUploadObject = vi.fn();
const mockGetObject = vi.fn();
const mockDeleteObject = vi.fn();
const mockIsObjectStorageConfigured = vi.fn(() => true);
vi.mock("../../lib/objectStorage.js", () => ({
  uploadObject: (...args: unknown[]) => mockUploadObject(...args),
  getObject: (...args: unknown[]) => mockGetObject(...args),
  deleteObject: (...args: unknown[]) => mockDeleteObject(...args),
  isObjectStorageConfigured: () => mockIsObjectStorageConfigured(),
}));

function fakeEmbeddingProvider(): EmbeddingProvider {
  const vector = Array(768).fill(0.1);
  return { name: "fake", embed: vi.fn(async (texts: string[]) => ({ vectors: texts.map(() => vector) })) };
}

describe("knowledge base routes (Phase 2C)", () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = SESSION_SECRET;
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL must point at a migrated test database to run this suite.");
    }
  });

  beforeEach(async () => {
    await resetDb(getPool());
    mockUploadObject.mockReset().mockResolvedValue(undefined);
    mockGetObject.mockReset().mockResolvedValue(Buffer.from("private source"));
    mockDeleteObject.mockReset().mockResolvedValue(undefined);
    mockIsObjectStorageConfigured.mockReset().mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await closePool();
  });

  it("returns 503 on upload when the knowledge base isn't configured (no embedding provider)", async () => {
    const { tenant, authHeader } = await createLoggedInTenant(getPool(), SESSION_SECRET, "creator-a");
    const app = createApp();
    const res = await request(app)
      .post(`/tenants/${tenant.id}/knowledge-base`)
      .set(authHeader)
      .attach("file", Buffer.from("hello"), { filename: "faq.txt", contentType: "text/plain" });
    expect(res.status).toBe(503);
  });

  it("rejects a request with no file attached", async () => {
    const { tenant, authHeader } = await createLoggedInTenant(getPool(), SESSION_SECRET, "creator-a");
    const app = createApp({ embeddingProvider: fakeEmbeddingProvider() });
    const res = await request(app).post(`/tenants/${tenant.id}/knowledge-base`).set(authHeader);
    expect(res.status).toBe(400);
  });

  it("rejects an unsupported file type before ingestion starts", async () => {
    const { tenant, authHeader } = await createLoggedInTenant(getPool(), SESSION_SECRET, "creator-a");
    const app = createApp({ embeddingProvider: fakeEmbeddingProvider() });
    const res = await request(app)
      .post(`/tenants/${tenant.id}/knowledge-base`)
      .set(authHeader)
      .attach("file", Buffer.from("data"), { filename: "sheet.xlsx", contentType: "application/vnd.ms-excel" });
    expect(res.status).toBe(400);
    expect(mockUploadObject).not.toHaveBeenCalled();
  });

  it("uploads and lists a source without exposing its internal storage key", async () => {
    const { tenant, authHeader } = await createLoggedInTenant(getPool(), SESSION_SECRET, "creator-a");
    const app = createApp({ embeddingProvider: fakeEmbeddingProvider() });
    const uploadRes = await request(app)
      .post(`/tenants/${tenant.id}/knowledge-base`)
      .set(authHeader)
      .attach("file", Buffer.from("Our refund window is 30 days."), { filename: "faq.txt", contentType: "text/plain" });
    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.document.status).toBe("ready");
    expect(uploadRes.body.document.filename).toBe("faq.txt");

    const listRes = await request(app)
      .get(`/tenants/${tenant.id}/knowledge-base?page=1&pageSize=20`)
      .set(authHeader);
    expect(listRes.status).toBe(200);
    expect(listRes.body.items).toHaveLength(1);
    expect(listRes.body.items[0]).not.toHaveProperty("storageKey");
    expect(listRes.body.items[0]).not.toHaveProperty("storage_key");
  });

  it("previews extracted content from a ready document", async () => {
    const { tenant, authHeader } = await createLoggedInTenant(getPool(), SESSION_SECRET, "creator-preview");
    const app = createApp({ embeddingProvider: fakeEmbeddingProvider() });
    const uploadRes = await request(app)
      .post(`/tenants/${tenant.id}/knowledge-base`)
      .set(authHeader)
      .attach("file", Buffer.from("Refunds are available within 30 days."), { filename: "refunds.txt", contentType: "text/plain" });
    const preview = await request(app)
      .get(`/tenants/${tenant.id}/knowledge-base/${uploadRes.body.document.id}/preview`)
      .set(authHeader);
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({
      documentId: uploadRes.body.document.id,
      filename: "refunds.txt",
      content: "Refunds are available within 30 days.",
      chunkCount: 1,
      truncated: false,
    });
  });

  it("retrieves tenant-scoped vector matches and rejects invalid queries", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-retrieve");
    const app = createApp({ embeddingProvider: fakeEmbeddingProvider() });
    const upload = await request(app)
      .post(`/tenants/${tenant.id}/knowledge-base`)
      .set(authHeader)
      .attach("file", Buffer.from("Refund policy is 30 days."), { filename: "refunds.txt", contentType: "text/plain" });
    const response = await request(app)
      .post(`/tenants/${tenant.id}/knowledge-base/retrieval`)
      .set(authHeader)
      .send({ query: "What is the refund policy?" });
    expect(upload.status).toBe(201);
    expect(response.status).toBe(200);
    expect(response.body.count).toBeGreaterThan(0);
    expect(response.body.results[0]).toMatchObject({ documentId: upload.body.document.id });
    expect(response.body.results[0].similarity).toEqual(expect.any(Number));

    const invalid = await request(app)
      .post(`/tenants/${tenant.id}/knowledge-base/retrieval`)
      .set(authHeader)
      .send({ query: "   ", limit: 0 });
    expect(invalid.status).toBe(400);
    const unconfigured = await request(createApp())
      .post(`/tenants/${tenant.id}/knowledge-base/retrieval`)
      .set(authHeader)
      .send({ query: "refund" });
    expect(unconfigured.status).toBe(503);
  });

  it("never returns another tenant's chunks from retrieval", async () => {
    const pool = getPool();
    const { tenant: tenantA, authHeader: authA } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const { tenant: tenantB, authHeader: authB } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-b");
    const app = createApp({ embeddingProvider: fakeEmbeddingProvider() });
    const uploadA = await request(app).post(`/tenants/${tenantA.id}/knowledge-base`).set(authA)
      .attach("file", Buffer.from("tenant A policy"), { filename: "a.txt", contentType: "text/plain" });
    const uploadB = await request(app).post(`/tenants/${tenantB.id}/knowledge-base`).set(authB)
      .attach("file", Buffer.from("tenant B secret policy"), { filename: "b.txt", contentType: "text/plain" });
    expect(uploadA.status).toBe(201);
    expect(uploadB.status).toBe(201);

    const responseA = await request(app).post(`/tenants/${tenantA.id}/knowledge-base/retrieval`).set(authA).send({ query: "policy" });
    expect(responseA.status).toBe(200);
    expect(responseA.body.results.every((result: { documentId: string }) => result.documentId === uploadA.body.document.id)).toBe(true);
    expect(JSON.stringify(responseA.body)).not.toContain("tenant B secret policy");
  });

  it("does not expose another tenant's documents, previews, or source files", async () => {
    const { tenant: tenantA, authHeader: authA } = await createLoggedInTenant(getPool(), SESSION_SECRET, "creator-a");
    const { tenant: tenantB, authHeader: authB } = await createLoggedInTenant(getPool(), SESSION_SECRET, "creator-b");
    const app = createApp({ embeddingProvider: fakeEmbeddingProvider() });
    const uploadRes = await request(app).post(`/tenants/${tenantA.id}/knowledge-base`).set(authA)
      .attach("file", Buffer.from("tenant A private content"), { filename: "private.txt", contentType: "text/plain" });
    const documentId = uploadRes.body.document.id;
    const details = await request(app).get(`/tenants/${tenantB.id}/knowledge-base/${documentId}`).set(authB);
    const preview = await request(app).get(`/tenants/${tenantB.id}/knowledge-base/${documentId}/preview`).set(authB);
    const source = await request(app).get(`/tenants/${tenantB.id}/knowledge-base/${documentId}/source`).set(authB);
    expect(details.status).toBe(404);
    expect(preview.status).toBe(404);
    expect(source.status).toBe(404);
    expect(mockGetObject).not.toHaveBeenCalled();
  });

  it("returns 404 for missing documents and 409 for a failed document preview", async () => {
    const { tenant, authHeader } = await createLoggedInTenant(getPool(), SESSION_SECRET, "creator-state");
    const app = createApp({ embeddingProvider: fakeEmbeddingProvider() });
    const missing = await request(app)
      .get(`/tenants/${tenant.id}/knowledge-base/00000000-0000-0000-0000-000000000000/preview`)
      .set(authHeader);
    expect(missing.status).toBe(404);
    const upload = await request(app).post(`/tenants/${tenant.id}/knowledge-base`).set(authHeader)
      .attach("file", Buffer.from("   "), { filename: "empty.txt", contentType: "text/plain" });
    expect(upload.status).toBe(201);
    expect(upload.body.document.status).toBe("failed");
    const preview = await request(app)
      .get(`/tenants/${tenant.id}/knowledge-base/${upload.body.document.id}/preview`)
      .set(authHeader);
    expect(preview.status).toBe(409);
  });

  it("deletes a document and best-effort removes its storage object", async () => {
    const { tenant, authHeader } = await createLoggedInTenant(getPool(), SESSION_SECRET, "creator-delete");
    const app = createApp({ embeddingProvider: fakeEmbeddingProvider() });
    const uploadRes = await request(app).post(`/tenants/${tenant.id}/knowledge-base`).set(authHeader)
      .attach("file", Buffer.from("some content"), { filename: "faq.txt", contentType: "text/plain" });
    const documentId = uploadRes.body.document.id;
    const deleteRes = await request(app).delete(`/tenants/${tenant.id}/knowledge-base/${documentId}`).set(authHeader);
    expect(deleteRes.status).toBe(204);
    expect(mockDeleteObject).toHaveBeenCalledOnce();
    const listRes = await request(app).get(`/tenants/${tenant.id}/knowledge-base`).set(authHeader);
    expect(listRes.body.documents).toHaveLength(0);
  });

  it("does not delete another tenant's indexed chunks when a foreign document id is supplied", async () => {
    const pool = getPool();
    const { tenant: tenantA, authHeader: authA } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-delete-a");
    const { tenant: tenantB, authHeader: authB } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-delete-b");
    const app = createApp({ embeddingProvider: fakeEmbeddingProvider() });
    const upload = await request(app).post(`/tenants/${tenantA.id}/knowledge-base`).set(authA)
      .attach("file", Buffer.from("preserve tenant A chunks"), { filename: "preserve.txt", contentType: "text/plain" });
    const before = await queryRelevantChunks(pool, tenantA.id, Array(768).fill(0.1));
    expect(before.some((chunk) => chunk.documentId === upload.body.document.id)).toBe(true);

    const response = await request(app)
      .delete(`/tenants/${tenantB.id}/knowledge-base/${upload.body.document.id}`)
      .set(authB);
    expect(response.status).toBe(404);
    const after = await queryRelevantChunks(pool, tenantA.id, Array(768).fill(0.1));
    expect(after.some((chunk) => chunk.documentId === upload.body.document.id)).toBe(true);
    expect(mockDeleteObject).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request", async () => {
    const { tenant } = await createLoggedInTenant(getPool(), SESSION_SECRET, "creator-a");
    const app = createApp({ embeddingProvider: fakeEmbeddingProvider() });
    const res = await request(app).get(`/tenants/${tenant.id}/knowledge-base`);
    expect(res.status).toBe(401);
  });
});
