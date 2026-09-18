import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assertKeyringConfigured,
  currentKeyVersion,
  decryptToken,
  encryptToken,
  loadKeyring,
} from "../tokenVault.js";

describe("tokenVault", () => {
  it("round-trips a token with the same key", () => {
    const key = randomBytes(32);
    const { ciphertext } = encryptToken("IGQ...secret-access-token", key, "v1");
    expect(decryptToken(ciphertext, key)).toBe("IGQ...secret-access-token");
  });

  it("fails closed on a tampered ciphertext rather than returning garbage", () => {
    const key = randomBytes(32);
    const { ciphertext } = encryptToken("secret", key, "v1");
    ciphertext[ciphertext.length - 1] ^= 0xff; // flip a byte in the encrypted payload
    expect(() => decryptToken(ciphertext, key)).toThrow();
  });

  it("fails closed when decrypting with the wrong key", () => {
    const key = randomBytes(32);
    const wrongKey = randomBytes(32);
    const { ciphertext } = encryptToken("secret", key, "v1");
    expect(() => decryptToken(ciphertext, wrongKey)).toThrow();
  });

  it("loadKeyring parses a multi-version keyring and picks the newest as current", () => {
    const k1 = randomBytes(32).toString("base64");
    const k2 = randomBytes(32).toString("base64");
    const keyring = loadKeyring(`v1:${k1},v2:${k2}`);

    expect(keyring.size).toBe(2);
    expect(currentKeyVersion(keyring)).toBe("v2");
  });

  it("currentKeyVersion throws on an empty keyring rather than silently using no key", () => {
    expect(() => currentKeyVersion(loadKeyring(undefined))).toThrow();
  });

  it("fails closed on a ciphertext too short to contain an IV and auth tag", () => {
    const key = randomBytes(32);
    expect(() => decryptToken(Buffer.from("short"), key)).toThrow(/too short/);
  });

  // R1-10 regression: a malformed entry used to be silently skipped,
  // surfacing only as a confusing failure at the first token write.
  it("loadKeyring throws on a malformed entry instead of silently skipping it", () => {
    expect(() => loadKeyring("not-a-valid-entry")).toThrow(/Malformed/);
  });

  it("loadKeyring throws when a key does not decode to exactly 32 bytes", () => {
    const shortKey = randomBytes(16).toString("base64");
    expect(() => loadKeyring(`v1:${shortKey}`)).toThrow(/32/);
  });

  it("assertKeyringConfigured throws on an empty keyring, fit for a boot-time check", () => {
    expect(() => assertKeyringConfigured(loadKeyring(undefined))).toThrow();
  });

  it("assertKeyringConfigured passes for a properly configured keyring", () => {
    const key = randomBytes(32).toString("base64");
    expect(() => assertKeyringConfigured(loadKeyring(`v1:${key}`))).not.toThrow();
  });
});
