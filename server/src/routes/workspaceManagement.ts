import { Router } from "express";
import { createHash, randomBytes } from "node:crypto";
import { config } from "../config.js";
import { getPool } from "../db/pool.js";
import { requireTenantRole, verifyBearerSession } from "../lib/tenantAuth.js";
import { normalizeEmail, getUserById } from "../db/users.js";
import { getTenant } from "../db/tenants.js";
import {
  createTenantInvitation,
  getPendingInvitationForEmail,
  listTenantInvitations,
  revokeTenantInvitation,
  acceptTenantInvitation,
} from "../db/tenantInvitations.js";
import {
  listConnectedInstagramAccounts,
  deleteConnectedInstagramAccount,
} from "../db/connectedAccounts.js";
import {
  attachCampaignToInstagramAccount,
  detachCampaignFromInstagramAccount,
  listCampaignInstagramAccounts,
} from "../db/campaignAccounts.js";
import { sendTenantInvitationEmail } from "../lib/tenantInvitationsEmail.js";

export const workspaceManagementRouter = Router();

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function isValidEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isInvitationRole(value: unknown): value is "admin" | "member" {
  return value === "admin" || value === "member";
}

workspaceManagementRouter.get(
  "/tenants/:tenantId/members",
  requireTenantRole("owner", "admin", "member"),
  async (req, res) => {
    const result = await getPool().query<{
      user_id: string;
      email: string;
      role: "owner" | "admin" | "member";
      created_at: Date;
    }>(
      `select tm.user_id, u.email, tm.role, tm.created_at
         from tenant_members tm
         join users u on u.id = tm.user_id
        where tm.tenant_id = $1
        order by case tm.role when 'owner' then 0 when 'admin' then 1 else 2 end, tm.created_at asc`,
      [req.params.tenantId],
    );

    return res.json(
      result.rows.map((row) => ({
        userId: row.user_id,
        email: row.email,
        role: row.role,
        createdAt: row.created_at,
      })),
    );
  },
);

workspaceManagementRouter.get(
  "/tenants/:tenantId/invitations",
  requireTenantRole("owner", "admin"),
  async (req, res) => {
    const invitations = await listTenantInvitations(getPool(), req.params.tenantId!);
    return res.json({ invitations });
  },
);

workspaceManagementRouter.post(
  "/tenants/:tenantId/invitations",
  requireTenantRole("owner", "admin"),
  async (req, res) => {
    const emailValue = req.body?.email;
    const roleValue = req.body?.role ?? "member";

    if (!isValidEmail(emailValue)) {
      return res.status(400).json({ error: "a valid email is required" });
    }
    if (!isInvitationRole(roleValue)) {
      return res.status(400).json({ error: "role must be admin or member" });
    }

    const email = normalizeEmail(emailValue);
    const pool = getPool();

    const member = await pool.query(
      `select 1 from tenant_members tm join users u on u.id = tm.user_id
        where tm.tenant_id = $1 and u.email = $2 limit 1`,
      [req.params.tenantId, email],
    );
    if (member.rowCount) {
      return res.status(409).json({ error: "user is already a member of this tenant" });
    }

    const existing = await getPendingInvitationForEmail(pool, req.params.tenantId!, email);
    if (existing) {
      return res.status(409).json({ error: "an invitation is already pending for this email" });
    }

    const inviterId = req.tenantSession!.userId;
    const inviter = await getUserById(pool, inviterId);
    const tenant = await getTenant(pool, req.params.tenantId!);
    if (!inviter || !tenant) {
      return res.status(404).json({ error: "tenant or inviter not found" });
    }

    const token = randomBytes(32).toString("base64url");
    const invitation = await createTenantInvitation(pool, {
      tenantId: req.params.tenantId!,
      email,
      role: roleValue,
      tokenHash: hashInvitationToken(token),
      invitedBy: inviterId,
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    });

    const inviteUrl = `${config.webAppOrigin}/invite?token=${encodeURIComponent(token)}`;

    try {
      await sendTenantInvitationEmail(email, tenant.name, inviter.email, inviteUrl);
    } catch (error) {
      console.error("Failed to send workspace invitation email:", error);
      return res.status(202).json({ invitation, delivery: "failed" });
    }

    return res.status(201).json({ invitation, delivery: "sent" });
  },
);

workspaceManagementRouter.post(
  "/tenants/:tenantId/invitations/:invitationId/revoke",
  requireTenantRole("owner", "admin"),
  async (req, res) => {
    const revoked = await revokeTenantInvitation(
      getPool(),
      req.params.tenantId!,
      req.params.invitationId!,
    );
    if (!revoked) return res.status(404).json({ error: "invitation not found" });
    return res.status(204).send();
  },
);

workspaceManagementRouter.post("/invitations/:token/accept", async (req, res) => {
  const session = await verifyBearerSession(req);
  if (!session) return res.status(401).json({ error: "missing or invalid session" });

  const pool = getPool();
  const user = await getUserById(pool, session.userId);
  if (!user) return res.status(401).json({ error: "user not found" });

  const client = await pool.connect();
  try {
    await client.query("begin");
    const invitation = await acceptTenantInvitation(
      client,
      hashInvitationToken(req.params.token!),
      session.userId,
      normalizeEmail(user.email),
    );

    if (!invitation) {
      await client.query("rollback");
      return res.status(400).json({ error: "invalid, expired, revoked, or mismatched invitation" });
    }

    await client.query("commit");
    return res.status(200).json({ tenantId: invitation.tenantId, role: invitation.role });
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
});

workspaceManagementRouter.get(
  "/tenants/:tenantId/connected-accounts",
  requireTenantRole("owner", "admin", "member"),
  async (req, res) => {
    const accounts = await listConnectedInstagramAccounts(getPool(), req.params.tenantId!);
    return res.json({ accounts });
  },
);

workspaceManagementRouter.delete(
  "/tenants/:tenantId/connected-accounts/:accountId",
  requireTenantRole("owner", "admin"),
  async (req, res) => {
    const deleted = await deleteConnectedInstagramAccount(
      getPool(),
      req.params.tenantId!,
      req.params.accountId!,
    );
    if (!deleted) return res.status(404).json({ error: "connected account not found" });
    return res.status(204).send();
  },
);

workspaceManagementRouter.get(
  "/tenants/:tenantId/campaigns/:campaignId/connected-accounts",
  requireTenantRole("owner", "admin", "member"),
  async (req, res) => {
    const accounts = await listCampaignInstagramAccounts(
      getPool(),
      req.params.tenantId!,
      req.params.campaignId!,
    );
    return res.json({ accounts });
  },
);

workspaceManagementRouter.post(
  "/tenants/:tenantId/campaigns/:campaignId/connected-accounts/:accountId",
  requireTenantRole("owner", "admin"),
  async (req, res) => {
    const binding = await attachCampaignToInstagramAccount(
      getPool(),
      req.params.tenantId!,
      req.params.campaignId!,
      req.params.accountId!,
    );
    return res.status(201).json({ account: binding });
  },
);

workspaceManagementRouter.delete(
  "/tenants/:tenantId/campaigns/:campaignId/connected-accounts/:accountId",
  requireTenantRole("owner", "admin"),
  async (req, res) => {
    const deleted = await detachCampaignFromInstagramAccount(
      getPool(),
      req.params.tenantId!,
      req.params.campaignId!,
      req.params.accountId!,
    );
    if (!deleted) return res.status(404).json({ error: "journey/account binding not found" });
    return res.status(204).send();
  },
);
