import type { Pool } from "pg";
import type { Queryable } from "./types.js";

export interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  profilePictureUrl: string | null;
  googleSubject: string | null;
  createdAt: Date;
  sessionVersion: number;
}

interface UserRow {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  profile_picture_url: string | null;
  google_subject: string | null;
  created_at: Date;
  session_version: number;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    profilePictureUrl: row.profile_picture_url,
    googleSubject: row.google_subject,
    createdAt: row.created_at,
    sessionVersion: row.session_version,
  };
}

/** Every email address is compared and stored in this form — the only thing that makes a plain unique index (no citext extension) a correct case-insensitive check. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Idempotent: returns the existing user if the email is already registered, otherwise creates one. Never two users for the same normalized email — relies on the unique index, not a prior SELECT, to be race-safe. */
export async function findOrCreateUserByEmail(pool: Queryable, email: string): Promise<User> {
  const normalized = normalizeEmail(email);
  const result = await pool.query<UserRow>(
    `insert into users (email) values ($1)
     on conflict (email) do update set email = excluded.email
     returning *`,
    [normalized],
  );
  return toUser(result.rows[0]!);
}

/**
 * Resolve a Google OIDC identity to the canonical SignalAI user. Google
 * subject IDs are immutable; verified email is only used to connect an
 * existing email-OTP account on the first Google sign-in.
 */
export async function findOrCreateUserByGoogle(
  pool: Queryable,
  profile: { sub: string; email: string; givenName?: string | null; familyName?: string | null; picture?: string | null },
): Promise<User> {
  const normalized = normalizeEmail(profile.email);
  const result = await pool.query<UserRow>(
    `insert into users (email, first_name, last_name, profile_picture_url, google_subject)
     values ($1, $2, $3, $4, $5)
     on conflict (email) do update set
       first_name = coalesce(users.first_name, excluded.first_name),
       last_name = coalesce(users.last_name, excluded.last_name),
       profile_picture_url = coalesce(excluded.profile_picture_url, users.profile_picture_url),
       google_subject = coalesce(users.google_subject, excluded.google_subject)
     returning *`,
    [normalized, profile.givenName?.trim() || null, profile.familyName?.trim() || null, profile.picture || null, profile.sub],
  );
  const user = toUser(result.rows[0]!);
  if (user.googleSubject && user.googleSubject !== profile.sub) {
    throw new Error("google_identity_conflict");
  }
  return user;
}

export async function updateUserProfile(
  pool: Queryable,
  userId: string,
  profile: { firstName?: string | null; lastName?: string | null; profilePictureUrl?: string | null },
): Promise<void> {
  await pool.query(
    `update users set
       first_name = coalesce($2, first_name),
       last_name = coalesce($3, last_name),
       profile_picture_url = coalesce($4, profile_picture_url)
     where id = $1`,
    [userId, profile.firstName?.trim() || null, profile.lastName?.trim() || null, profile.profilePictureUrl || null],
  );
}

export async function getUserById(pool: Pool, userId: string): Promise<User | null> {
  const result = await pool.query<UserRow>(`select * from users where id = $1`, [userId]);
  return result.rows[0] ? toUser(result.rows[0]) : null;
}

export async function getUserByEmail(pool: Pool, email: string): Promise<User | null> {
  const result = await pool.query<UserRow>(`select * from users where email = $1`, [normalizeEmail(email)]);
  return result.rows[0] ? toUser(result.rows[0]) : null;
}

/** Only ever the value session tokens are checked against (lib/tenantAuth.ts) — a lightweight lookup, not the full row, since this runs on every authenticated request. */
export async function getUserSessionVersion(pool: Pool, userId: string): Promise<number | null> {
  const result = await pool.query<{ session_version: number }>(`select session_version from users where id = $1`, [
    userId,
  ]);
  return result.rows[0] ? result.rows[0].session_version : null;
}

/** Revokes every session issued for this user before now — e.g. "log out everywhere". */
export async function bumpUserSessionVersion(pool: Pool, userId: string): Promise<void> {
  await pool.query(`update users set session_version = session_version + 1 where id = $1`, [userId]);
}
