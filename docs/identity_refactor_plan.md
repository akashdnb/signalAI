# Identity Refactor — email login, Instagram as a connected channel

Companion to [[phase0_phase1_impl_plan]]. Supersedes the "connecting Instagram *is* the signup" decision recorded in `server/src/routes/auth.ts`.

---

## The problem in one line

`tenants` currently conflates three different things — **who you are**, **what owns your data**, and **who pays** — and anchors all three to an Instagram account id.

Concretely, today: sessions are issued in exactly one place (`auth.ts`, the end of the OAuth callback), there is no `users` table and no email stored anywhere, and `meta_tokens` carries a *global* unique index on `instagram_account_id`. So the Instagram account is the account.

What that costs:

- **No login, only connect.** A returning creator must re-run Instagram OAuth to get a session. A revoked token, a suspended account, or a Meta outage locks them out of billing and their own lead data — none of which involve Instagram.
- **No recovery.** No email means no reset, and no way to verify ownership when someone asks for help.
- **Billing anchored to the wrong entity.** A creator who rebrands to a new handle loses their subscription and history, or you do manual surgery on live data.
- **[[signalAI_roadmap]] Phase 6 is structurally blocked.** Agency accounts mean one workspace, many client Instagram accounts. The global unique index makes that impossible, and it is load-bearing for the current reconnect logic, so it cannot simply be dropped.
- **Orphan tenants are a symptom of this, not a separate defect.** `/start` mints a tenant before knowing who is connecting *because there is no prior identity to attach to*, which is also why the callback needs its resolve-by-`profile.id` heuristic. Both disappear under the model below.

## What does NOT change — why this is smaller than it sounds

Because B2 put `tenant_id` on every customer-data table from migration 1, this refactor is **additive**: a new layer *above* tenant, not a restructuring below it.

All ten tables carrying `tenant_id` — `leads`, `lead_events`, `lead_pii`, `lead_captured_facts`, `campaigns`, `campaign_milestones`, `milestone_advancements`, `meta_tokens`, `account_sends`, `ai_call_usage` — keep their shape and their data. The event pipeline, queue, worker, milestone engine, reply engine, spend guard and webhook path are untouched. No row is re-parented.

The change is confined to: who issues a session, what a session identifies, and who owns a tenant.

## Target model

```
users          (id, email UNIQUE, created_at, session_version)   ← login identity
tenants        (id, name, owner_user_id, stripe_*, billing_status) ← workspace + billing
tenant_members (tenant_id, user_id, role)                        ← one row now, Phase 6 ready
meta_tokens    (tenant_id, instagram_account_id UNIQUE globally) ← connected channel
```

Three decisions worth stating explicitly, because each has a tempting alternative:

- **Magic links, not passwords.** No hashing, no reset flow, no credential storage, no breach surface — and Resend is already in the stack for [[signalAI_roadmap]] Phase 2A. Roughly a day versus several for passwords done properly. The cost is email deliverability becoming a login dependency (see Risks).
- **`session_version` moves from `tenants` to `users`.** Sessions identify a person, so revocation belongs to the person. Tenant-scoped revocation can be added later; it is not needed now.
- **Keep the global unique index on `instagram_account_id`.** An Instagram account should belong to exactly one workspace — that is a real protection against two tenants claiming the same account, and it is what makes the "already connected elsewhere" error possible. What gets dropped is the *implicit one-account-per-tenant* assumption in `getSoleConnectedAccount`, which is code, not schema.

---

## Steps

Sizes as in the Phase 0/1 plan: **S** ≤ 1 day · **M** 2–4 days · **L** 1–2 weeks.

### U1 · Schema (S)
- `users` (id, email citext unique, created_at, session_version default 1).
- `tenant_members` (tenant_id, user_id, role, primary key on the pair).
- `tenants.owner_user_id` nullable at first, not-null after U7's backfill.
- Move `session_version` to `users`; leave the column on `tenants` until U8 so nothing breaks mid-flight.
- **Done when:** migrations run clean from empty, and `tenantIsolation.test.ts` still passes unchanged.

### U2 · Magic-link auth (M)
- `POST /auth/email/request` — accepts an email, creates the user if new, stores a single-use hashed token with a short TTL, sends via Resend.
- `GET /auth/email/verify?token=…` — spends the token, issues the session, redirects to BUI with the token in the **fragment** (same channel as the Instagram callback, same reasoning: never in the `Referer` header or server logs — see R11-01).
- Rate-limit per email *and* per IP. Always respond identically whether or not the email exists, so the endpoint is not an account-enumeration oracle.
- **Done when:** a fresh email receives a link, the link logs in once, and a second use of the same link fails.

### U3 · Session identifies a user (M)
- `SessionPayload` becomes `{ userId, sessionVersion }`; `tenantId` leaves the token entirely.
- `requireTenantSession` verifies the user session, then checks `tenant_members` for `:tenantId` — a valid session for a tenant you are not a member of stays a 403, exactly as now.
- **Breaking:** every existing session is invalidated. With one real user, that is a re-login, not a migration.
- **Done when:** `dashboard`, `campaigns` and `billing` routes all reject a session whose user is not a member, and accept one that is.

### U4 · `/auth/instagram/start` requires a session (S)
- Drops `tenantName`, drops `createTenant`. The tenant already exists; `state` carries `tenantId` and is validated against the caller's membership.
- **This is what eliminates the orphan tenants** — no tenant is created before we know who is connecting.
- **Done when:** an unauthenticated `/start` returns 401, and an authenticated one creates no new tenant row.

### U5 · Callback attaches a channel (S)
- Remove the resolve-by-`profile.id` heuristic (R5-01) — it exists only because `/start` created tenants blindly. The tenant now comes from the session.
- If `profile.id` is already attached to a *different* tenant, fail with a clear "this Instagram account is already connected to another workspace" rather than silently re-parenting. The unique index backs this at the data layer.
- **Done when:** connecting twice from the same account updates one row and creates no tenant; connecting an account owned elsewhere returns the named error.

### U6 · BUI: login before connect (M)
- Login page (email → "check your inbox"), verify page that consumes the fragment and strips it via `history.replaceState` (R11-01).
- Connect-Instagram becomes an action *inside* the dashboard, not the entry point.
- Handle the 401 path: expired or revoked session clears storage and returns to login rather than erroring.
- **Done when:** a new user can sign up by email, land on an empty dashboard with no Instagram connected, and connect from there.

### U7 · Migrate existing data (S)
- Four tenants as of writing; exactly one real — `0b66b198`, holding the only `meta_tokens` row and the only
  campaign. The other three hold zero rows across all ten `tenant_id` tables (verified, not assumed).
- The count was three an hour earlier: **one junk tenant accrues per connect attempt**, so this grows until U4 lands.
- Create a user for the real owner, attach `0b66b198` via `tenant_members` + `owner_user_id`, delete the three orphans.
- **Verify before deleting:** each orphan has zero rows across all ten `tenant_id` tables. Do not assume — query it.
- **Done when:** one user, one tenant, one membership, one connected account, and the campaign still resolves.

### U8 · Cleanup (S)
- Drop `tenants.session_version`, remove `tenantName` handling, delete the dead resolve-by-profile path.
- Update `auth.ts`'s "connecting Instagram *is* the signup" comment — it will otherwise outlive the design it describes and mislead the next reader.
- **Done when:** no reference to the old model remains in code or comments.

---

## Sequencing

U1 → U2 → U3 are strictly ordered; U3 is the breaking change, so land U1 and U2 first and verify magic-link login works *before* cutting sessions over. U4 and U5 depend on U3. U6 can be built in parallel with U2–U5 against the new endpoints. U7 runs after U4 (once no new orphans are being created), U8 last.

Do the whole sequence **before App Review**: a reviewer seeing "sign up, then connect Instagram" understands the permission request better than an app where the Instagram account is the account. It also removes the awkward explanation of why every connect attempt creates a workspace.

## Risks

| Risk | Signal | Response |
|---|---|---|
| Magic-link email lands in spam | A pilot creator can't log in | Verify the sending domain (SPF/DKIM) before relying on it; keep a manual session-issue escape hatch for pilots |
| Locked out mid-migration | U3 invalidates your own session | Complete U2 and confirm you can log in by email *before* deploying U3 |
| Magic link replayed | — | Single-use, hashed at rest, short TTL, spent-token table — same shape as `spent_oauth_nonces` |
| Login becomes an enumeration oracle | — | Identical response and timing whether or not the email exists |
| Orphan cleanup deletes live data | — | U7's per-table row-count check before any delete |

## Non-goals

Not in this refactor, deliberately: passwords, OAuth social login, multiple users per workspace beyond the schema supporting it, role semantics beyond a single `owner`, and multiple Instagram accounts per tenant in the UI. The schema stops blocking all of these; [[signalAI_roadmap]] Phase 6 builds them.
