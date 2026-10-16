import { Router } from "express";
import { getPool } from "../db/pool.js";
import { getUserById, updateUserProfile } from "../db/users.js";
import { verifyBearerSession } from "../lib/tenantAuth.js";

export const profileRouter = Router();

function toPublicProfile(user: NonNullable<Awaited<ReturnType<typeof getUserById>>>) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    profilePictureUrl: user.profilePictureUrl,
    createdAt: user.createdAt,
  };
}

profileRouter.get("/me/profile", async (req, res) => {
  const session = await verifyBearerSession(req);
  if (!session) return res.status(401).json({ error: "missing or invalid session" });
  const user = await getUserById(getPool(), session.userId);
  if (!user) return res.status(401).json({ error: "user not found" });
  return res.status(200).json({ profile: toPublicProfile(user) });
});

profileRouter.patch("/me/profile", async (req, res) => {
  const session = await verifyBearerSession(req);
  if (!session) return res.status(401).json({ error: "missing or invalid session" });
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({ error: "profile fields are required" });
  }

  const allowedFields = ["firstName", "lastName", "profilePictureUrl"];
  const provided = allowedFields.filter((field) => Object.prototype.hasOwnProperty.call(body, field));
  if (provided.length === 0) return res.status(400).json({ error: "provide a profile field to update" });
  const unknown = Object.keys(body).filter((field) => !allowedFields.includes(field));
  if (unknown.length) return res.status(400).json({ error: `unsupported profile field: ${unknown[0]}` });

  const updates: { firstName?: string | null; lastName?: string | null; profilePictureUrl?: string | null } = {};
  for (const field of provided) {
    const value = body[field];
    if (field === "firstName" || field === "lastName") {
      if (value !== null && (typeof value !== "string" || value.trim().length > 80)) {
        return res.status(400).json({ error: `${field} must be null or a string up to 80 characters` });
      }
      updates[field] = typeof value === "string" && value.trim() ? value.trim() : null;
    } else {
      if (value !== null) {
        if (typeof value !== "string" || value.length > 2048) {
          return res.status(400).json({ error: "profilePictureUrl must be null or a URL up to 2048 characters" });
        }
        try {
          const parsed = new URL(value);
          if (parsed.protocol !== "https:" || !parsed.hostname) throw new Error("invalid URL");
        } catch {
          return res.status(400).json({ error: "profilePictureUrl must be a valid HTTPS URL or null" });
        }
      }
      updates.profilePictureUrl = value;
    }
  }

  await updateUserProfile(getPool(), session.userId, updates);
  const updated = await getUserById(getPool(), session.userId);
  if (!updated) return res.status(401).json({ error: "user not found" });
  return res.status(200).json({ profile: toPublicProfile(updated) });
});
