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
  if (ciphertext.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    // R1-16: without this, a truncated/corrupt blob fails inside node's
    // crypto internals with an opaque error instead of a clear one.
    throw new Error(
      `Ciphertext too short to be valid (got ${ciphertext.length} bytes, need at least ${IV_LENGTH + AUTH_TAG_LENGTH})`,
    );
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
 *
 * R1-10 fix: a malformed entry or a key that doesn't decode to 32 bytes
 * throws here, at load time, rather than being silently skipped and only
 * surfacing as a confusing failure at the first token write in production.
 */
export function loadKeyring(env: string | undefined): Map<string, Buffer> {
  const keyring = new Map<string, Buffer>();
  if (!env) return keyring;

  for (const rawEntry of env.split(",")) {
    const entry = rawEntry.trim();
    if (!entry) continue;

    const [version, base64Key] = entry.split(":");
    if (!version?.trim() || !base64Key?.trim()) {
      throw new Error(`Malformed TOKEN_ENCRYPTION_KEYS entry (expected "version:base64key"): "${entry}"`);
    }

    const key = Buffer.from(base64Key.trim(), "base64");
    if (key.length !== 32) {
      throw new Error(
        `TOKEN_ENCRYPTION_KEYS entry "${version.trim()}" decodes to ${key.length} bytes, need exactly 32 (AES-256)`,
      );
    }
    keyring.set(version.trim(), key);
  }
  return keyring;
}

/** R1-10: an empty keyring is a boot-time configuration error, not something that should wait until the first token write to surface. */
export function assertKeyringConfigured(keyring: Map<string, Buffer>): void {
  if (keyring.size === 0) {
    throw new Error("No token encryption keys configured (TOKEN_ENCRYPTION_KEYS)");
  }
}

export function currentKeyVersion(keyring: Map<string, Buffer>): string {
  const versions = [...keyring.keys()];
  const last = versions[versions.length - 1];
  if (!last) {
    throw new Error("No token encryption keys configured (TOKEN_ENCRYPTION_KEYS)");
  }
  return last;
}
