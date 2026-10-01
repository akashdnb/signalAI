import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function getEncryptionKey(): Buffer {
  const raw = process.env.CREDENTIAL_ENCRYPTION_KEY;

  if (!raw) {
    throw new Error(
      "CREDENTIAL_ENCRYPTION_KEY is required",
    );
  }

  const key = Buffer.from(raw, "base64");

  if (key.length !== KEY_LENGTH) {
    throw new Error(
      "CREDENTIAL_ENCRYPTION_KEY must be a base64-encoded 32-byte key",
    );
  }

  return key;
}

export function encryptCredential(value: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(
    ALGORITHM,
    key,
    iv,
  );

  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
}

export function decryptCredential(
  encryptedValue: string,
): string {
  const key = getEncryptionKey();

  const parts = encryptedValue.split(".");

  if (parts.length !== 3) {
    throw new Error("Invalid encrypted credential format");
  }

  const [ivBase64, authTagBase64, encryptedBase64] = parts;

  const iv = Buffer.from(ivBase64, "base64");
  const authTag = Buffer.from(authTagBase64, "base64");
  const encrypted = Buffer.from(encryptedBase64, "base64");

  if (
    iv.length !== IV_LENGTH ||
    authTag.length !== AUTH_TAG_LENGTH
  ) {
    throw new Error("Invalid encrypted credential");
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    iv,
  );

  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8");
}
