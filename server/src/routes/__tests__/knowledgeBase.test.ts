import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.js";
import { getPool, closePool } from "../../db/pool.js";
import { resetDb } from "../../__tests__/helpers/db.js";
import { createLoggedInTenant } from "../../__tests__/helpers/auth.js";
import type { EmbeddingProvider } from "../../llm/embeddingProvider.js";

const SESSION_SECRET = "test-session-secret";

const mockUploadObject = vi.fn();
const mockDeleteObject = vi.fn();
const mockIsObjectStorageConfigured = vi.fn(() => true);
vi.mock("../../lib/objectStorage.js", () => ({
  uploadObject: (...args: unknown[]) => mockUploadObject(...args),
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
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp(); // no embeddingProvider

    const res = await request(app)
      .post(`/tenants/${tenant.id}/knowledge-base`)
      .set(authHeader)
      .attach("file", Buffer.from("hello"), { filename: "faq.txt", contentType: "text/plain" });

    expect(res.status).toBe(503);
  });

  it("rejects a request with no file attached", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp({ embeddingProvider: fakeEmbeddingProvider() });

    const res = await request(app).post(`/tenants/${tenant.id}/knowledge-base`).set(authHeader);
    expect(res.status).toBe(400);
  });

  it("rejects an unsupported file type before ingestion starts", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp({ embeddingProvider: fakeEmbeddingProvider() });

    const res = await request(app)
      .post(`/tenants/${tenant.id}/knowledge-base`)
      .set(authHeader)
      .attach("file", Buffer.from("data"), { filename: "sheet.xlsx", contentType: "application/vnd.ms-excel" });

    expect(res.status).toBe(400);
    expect(mockUploadObject).not.toHaveBeenCalled();
  });

  it("uploads a text file, ingests it, and lists it back", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp({ embeddingProvider: fakeEmbeddingProvider() });

    const uploadRes = await request(app)
      .post(`/tenants/${tenant.id}/knowledge-base`)
      .set(authHeader)
      .attach("file", Buffer.from("Our refund window is 30 days."), { filename: "faq.txt", contentType: "text/plain" });

    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.document.status).toBe("ready");
    expect(uploadRes.body.document.filename).toBe("faq.txt");

    const listRes = await request(app).get(`/tenants/${tenant.id}/knowledge-base`).set(authHeader);
    expect(listRes.status).toBe(200);
    expect(listRes.body.documents).toHaveLength(1);
    expect(listRes.body.documents[0].filename).toBe("faq.txt");
  });

  it("deletes a document and best-effort removes its storage object", async () => {
    const pool = getPool();
    const { tenant, authHeader } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp({ embeddingProvider: fakeEmbeddingProvider() });

    const uploadRes = await request(app)
      .post(`/tenants/${tenant.id}/knowledge-base`)
      .set(authHeader)
      .attach("file", Buffer.from("some content"), { filename: "faq.txt", contentType: "text/plain" });
    const documentId = uploadRes.body.document.id;

    const deleteRes = await request(app).delete(`/tenants/${tenant.id}/knowledge-base/${documentId}`).set(authHeader);
    expect(deleteRes.status).toBe(204);
    expect(mockDeleteObject).toHaveBeenCalledOnce();

    const listRes = await request(app).get(`/tenants/${tenant.id}/knowledge-base`).set(authHeader);
    expect(listRes.body.documents).toHaveLength(0);
  });

  it("returns 404 deleting a document that belongs to another tenant", async () => {
    const pool = getPool();
    const { tenant: tenantA, authHeader: authA } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const { tenant: tenantB, authHeader: authB } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-b");
    const app = createApp({ embeddingProvider: fakeEmbeddingProvider() });

    const uploadRes = await request(app)
      .post(`/tenants/${tenantA.id}/knowledge-base`)
      .set(authA)
      .attach("file", Buffer.from("some content"), { filename: "faq.txt", contentType: "text/plain" });
    const documentId = uploadRes.body.document.id;

    const res = await request(app).delete(`/tenants/${tenantB.id}/knowledge-base/${documentId}`).set(authB);
    expect(res.status).toBe(404);
  });

  it("rejects an unauthenticated request", async () => {
    const pool = getPool();
    const { tenant } = await createLoggedInTenant(pool, SESSION_SECRET, "creator-a");
    const app = createApp({ embeddingProvider: fakeEmbeddingProvider() });

    const res = await request(app).get(`/tenants/${tenant.id}/knowledge-base`);
    expect(res.status).toBe(401);
  });
});
