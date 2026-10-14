import { describe, expect, it } from "vitest";
import {
  validateWorkspaceName,
  validateWorkspaceDescription,
  WORKSPACE_NAME_MAX,
  WORKSPACE_DESCRIPTION_MAX,
} from "../workspaceValidation.js";

describe("validateWorkspaceName", () => {
  it("trims and accepts a normal name", () => {
    expect(validateWorkspaceName("  Studio North  ")).toEqual({ ok: true, value: "Studio North" });
  });

  it("rejects an empty or missing name", () => {
    expect(validateWorkspaceName("   ").ok).toBe(false);
    expect(validateWorkspaceName(undefined).ok).toBe(false);
    expect(validateWorkspaceName(42).ok).toBe(false);
  });

  it("rejects a name longer than the cap", () => {
    expect(validateWorkspaceName("a".repeat(WORKSPACE_NAME_MAX + 1)).ok).toBe(false);
    expect(validateWorkspaceName("a".repeat(WORKSPACE_NAME_MAX)).ok).toBe(true);
  });

  it("rejects a name containing an email address (PII guard)", () => {
    expect(validateWorkspaceName("client owner@acme.com").ok).toBe(false);
  });
});

describe("validateWorkspaceDescription", () => {
  it("normalizes null, undefined, and blank to null", () => {
    expect(validateWorkspaceDescription(undefined)).toEqual({ ok: true, value: null });
    expect(validateWorkspaceDescription(null)).toEqual({ ok: true, value: null });
    expect(validateWorkspaceDescription("   ")).toEqual({ ok: true, value: null });
  });

  it("trims and accepts normal text", () => {
    expect(validateWorkspaceDescription("  Agency client account  ")).toEqual({
      ok: true,
      value: "Agency client account",
    });
  });

  it("rejects a non-string, an over-long description, and an email address", () => {
    expect(validateWorkspaceDescription(42).ok).toBe(false);
    expect(validateWorkspaceDescription("a".repeat(WORKSPACE_DESCRIPTION_MAX + 1)).ok).toBe(false);
    expect(validateWorkspaceDescription("reach me at owner@acme.com").ok).toBe(false);
  });
});
