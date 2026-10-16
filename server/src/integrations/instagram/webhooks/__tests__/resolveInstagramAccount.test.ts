import { describe, expect, it, vi } from "vitest";
import { resolveInstagramAccount } from "../resolveInstagramAccount.js";

describe("resolveInstagramAccount", () => {
  it("resolves a provider account to its workspace-scoped credential row", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [{ id: "credential-row", tenant_id: "workspace-a", instagram_account_id: "ig-1" }],
      }),
    };

    await expect(resolveInstagramAccount(pool as any, "ig-1")).resolves.toEqual({
      id: "credential-row",
      tenantId: "workspace-a",
      instagramUserId: "ig-1",
    });
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("limit 2"), ["ig-1"]);
  });

  it("returns null for an unknown provider account", async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };

    await expect(resolveInstagramAccount(pool as any, "unknown")).resolves.toBeNull();
  });

  it("fails closed instead of routing to an arbitrary workspace if identity is ambiguous", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [
          { id: "credential-a", tenant_id: "workspace-a", instagram_account_id: "ig-1" },
          { id: "credential-b", tenant_id: "workspace-b", instagram_account_id: "ig-1" },
        ],
      }),
    };

    await expect(resolveInstagramAccount(pool as any, "ig-1")).rejects.toThrow(
      "Instagram account identity is not unique across workspaces",
    );
  });
});
