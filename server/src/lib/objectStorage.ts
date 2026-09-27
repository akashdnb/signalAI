import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { config } from "../config.js";

/**
 * Phase 2C Knowledge Base: stores the tenant's originally-uploaded source
 * file (not the extracted/chunked text, which lives in Postgres) on
 * Neon's S3-compatible object storage. `S3Client` reads its endpoint,
 * region, and credentials from the AWS SDK's own standard env vars
 * (AWS_ENDPOINT_URL_S3, AWS_REGION, AWS_ACCESS_KEY_ID,
 * AWS_SECRET_ACCESS_KEY) automatically — nothing here needs to read or
 * pass those explicitly. Only the bucket name isn't one of those, so it's
 * the one setting routed through config.ts.
 */
let client: S3Client | undefined;
function getClient(): S3Client {
  if (!client) client = new S3Client({});
  return client;
}

export function isObjectStorageConfigured(): boolean {
  return !!config.kbS3Bucket;
}

export function buildKnowledgeBaseObjectKey(tenantId: string, documentId: string): string {
  return `tenants/${tenantId}/kb/${documentId}`;
}

export async function uploadObject(key: string, body: Buffer, contentType: string): Promise<void> {
  if (!isObjectStorageConfigured()) {
    throw new Error("object storage is not configured on this server (KB_S3_BUCKET unset)");
  }
  await getClient().send(
    new PutObjectCommand({ Bucket: config.kbS3Bucket, Key: key, Body: body, ContentType: contentType }),
  );
}

export async function getObject(key: string): Promise<Buffer> {
  if (!isObjectStorageConfigured()) {
    throw new Error("object storage is not configured on this server (KB_S3_BUCKET unset)");
  }
  const result = await getClient().send(new GetObjectCommand({ Bucket: config.kbS3Bucket, Key: key }));
  const bytes = await result.Body!.transformToByteArray();
  return Buffer.from(bytes);
}

export async function deleteObject(key: string): Promise<void> {
  if (!isObjectStorageConfigured()) {
    throw new Error("object storage is not configured on this server (KB_S3_BUCKET unset)");
  }
  await getClient().send(new DeleteObjectCommand({ Bucket: config.kbS3Bucket, Key: key }));
}
