import { describe, expect, it } from "vitest";
import { roleHasPermission, type TenantRole, type WorkspacePermission } from "../tenantAuth.js";

describe("workspace role permissions", () => {
  const permissions: WorkspacePermission[] = [
    "workspace:view",
    "workspace:edit",
    "members:view",
    "members:manage",
    "instagram:view",
    "instagram:connect",
    "journey:view",
    "journey:edit",
    "billing:view",
    "billing:manage",
  ];

  it("gives owners all workspace permissions", () => {
    for (const permission of permissions) expect(roleHasPermission("owner", permission)).toBe(true);
  });

  it("limits admin billing to viewing, while allowing workspace/team/account operations", () => {
    expect(roleHasPermission("admin", "workspace:edit")).toBe(true);
    expect(roleHasPermission("admin", "members:manage")).toBe(true);
    expect(roleHasPermission("admin", "instagram:connect")).toBe(true);
    expect(roleHasPermission("admin", "billing:view")).toBe(true);
    expect(roleHasPermission("admin", "billing:manage")).toBe(false);
  });

  it("keeps members out of workspace, team, account-connection and billing administration", () => {
    const role: TenantRole = "member";
    expect(roleHasPermission(role, "workspace:view")).toBe(true);
    expect(roleHasPermission(role, "members:view")).toBe(true);
    expect(roleHasPermission(role, "journey:edit")).toBe(true);
    expect(roleHasPermission(role, "workspace:edit")).toBe(false);
    expect(roleHasPermission(role, "members:manage")).toBe(false);
    expect(roleHasPermission(role, "instagram:connect")).toBe(false);
    expect(roleHasPermission(role, "billing:manage")).toBe(false);
  });
});
