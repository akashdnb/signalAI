import type { Pool } from "pg";
import type { Queryable } from "./types.js";

export interface User {
  id: string;
  email: string;
  createdAt: Date;
  sessionVersion: number;
}

interface UserRow {
  id: string;
  email: string;
  created_at: Date;
  session_version: number;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
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
