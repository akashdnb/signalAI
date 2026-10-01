import { beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";

import {
  decryptCredential,
  encryptCredential,
} from "./encryption.js";

describe("credential encryption", () => {
  beforeEach(() => {
    process.env.CREDENTIAL_ENCRYPTION_KEY =
      randomBytes(32).toString("base64");
  });

  it("encrypts and decrypts a credential", () => {
    const value = "instagram-access-token-secret";

    const encrypted = encryptCredential(value);

    expect(encrypted).not.toBe(value);
    expect(decryptCredential(encrypted)).toBe(value);
  });

  it("produces different ciphertext for the same credential", () => {
    const value = "same-token";

    const first = encryptCredential(value);
    const second = encryptCredential(value);

    expect(first).not.toBe(second);

    expect(decryptCredential(first)).toBe(value);
    expect(decryptCredential(second)).toBe(value);
  });

  it("rejects malformed encrypted values", () => {
    expect(() =>
      decryptCredential("invalid"),
    ).toThrow("Invalid encrypted credential format");
  });
});
