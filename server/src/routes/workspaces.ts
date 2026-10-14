import { Router } from "express";
import { getPool } from "../db/pool.js";
import { verifyBearerSession } from "../lib/tenantAuth.js";
import { listWorkspacesForUser } from "../db/tenantMembers.js";
import { createTenantForUser } from "../db/tenants.js";
import { validateWorkspaceName, validateWorkspaceDescription } from "../lib/workspaceValidation.js";

/**
 * Agency Workspaces: the user-scoped (not tenant-scoped) endpoints behind the
 * workspace switcher. These deliberately do NOT use requireTenantSession /
 * requireTenantRole — they operate across every workspace a person belongs to,
 * so they authenticate the person with verifyBearerSession and never take a
 * :tenantId. Per-workspace admin actions (edit, members, invites) stay in
 * workspaceManagement.ts, role-gated against a specific tenant.
 */
export const workspacesRouter = Router();

workspacesRouter.get("/me/workspaces", async (req, res) => {
  const session = await verifyBearerSession(req);
  if (!session) return res.status(401).json({ error: "missing or invalid session" });

  const workspaces = await listWorkspacesForUser(getPool(), session.userId);
  return res.json({ workspaces });
});

workspacesRouter.post("/workspaces", async (req, res) => {
  const session = await verifyBearerSession(req);
  if (!session) return res.status(401).json({ error: "missing or invalid session" });

  const name = validateWorkspaceName(req.body?.name);
  if (!name.ok) return res.status(400).json({ error: name.error });

  const description = validateWorkspaceDescription(req.body?.description);
  if (!description.ok) return res.status(400).json({ error: description.error });

  // The creator is the owner of their new workspace — createTenantForUser
  // writes the tenant and the owner tenant_members row in one transaction.
  const tenant = await createTenantForUser(getPool(), name.value, session.userId, description.value);
  return res.status(201).json({
    workspace: {
      tenantId: tenant.id,
      name: tenant.name,
      description: tenant.description,
      role: "owner" as const,
    },
  });
});
