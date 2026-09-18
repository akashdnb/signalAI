import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export interface EncryptedToken {
  ciphertext: Buffer;
  keyVersion: string;
}

/**
 * Envelope encryption for Meta access tokens (roadmap Phase 1 Security
 * Foundations): the key never lives in the database, only in
 * TOKEN_ENCRYPTION_KEYS. `ciphertext` packs iv || authTag || encrypted, so
 * the DB column is one opaque blob with everything needed to decrypt it
 * given the right key.
 */
export function encryptToken(plaintext: string, key: Buffer, keyVersion: string): EncryptedToken {
  if (key.length !== 32) {
    throw new Error("Token encryption key must be 32 bytes (AES-256)");
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: Buffer.concat([iv, authTag, encrypted]),
    keyVersion,
  };
}

export function decryptToken(ciphertext: Buffer, key: Buffer): string {
  if (key.length !== 32) {
    throw new Error("Token encryption key must be 32 bytes (AES-256)");
  }

  const iv = ciphertext.subarray(0, IV_LENGTH);
  const authTag = ciphertext.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = ciphertext.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

/**
 * Resolves a key by version from TOKEN_ENCRYPTION_KEYS, so keys can rotate:
 * format is "v1:base64key,v2:base64key", newest last. Encryption always uses
 * the last entry; decryption looks up whichever version the row was
 * encrypted with.
 */
export function loadKeyring(env: string | undefined): Map<string, Buffer> {
  const keyring = new Map<string, Buffer>();
  if (!env) return keyring;

  for (const entry of env.split(",")) {
    const [version, base64Key] = entry.split(":");
    if (!version || !base64Key) continue;
    keyring.set(version.trim(), Buffer.from(base64Key.trim(), "base64"));
  }
  return keyring;
}

export function currentKeyVersion(keyring: Map<string, Buffer>): string {
  const versions = [...keyring.keys()];
  const last = versions[versions.length - 1];
  if (!last) {
    throw new Error("No token encryption keys configured (TOKEN_ENCRYPTION_KEYS)");
  }
  return last;
}
