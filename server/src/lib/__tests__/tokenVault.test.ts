import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
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
});
