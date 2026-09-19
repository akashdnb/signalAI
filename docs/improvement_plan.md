# signalAI — Improvement Plan

Items are independent unless noted. Each carries its own steps, sizes (**S** ≤ 1 day · **M** 2–4 days · **L** 1–2 weeks) and done-conditions.

1. [Identity Refactor](#identity-refactor--email-login-instagram-as-a-connected-channel) — email login, Instagram as a connected channel
2. [Keyword Matching](#keyword-matching--exact-word-and-contains) — exact, word and contains
3. [UI Restructuring](#ui-restructuring--shell-primitives-and-states) — shell, primitives and states

---

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
- **Ship the `DROP COLUMN` migration in its own later deploy, not bundled with U1's migration.** (Round 15 finding, R15-02: this branch shipped it bundled anyway, since production was empty and pre-refactor code was about to be fully replaced in the same deploy — but the reasoning generalizes and next time there will be data and users.) Render's deploy has a real overlap window — migrations run, then the new instance boots, then traffic switches, then the old instance drains — during which the *old* code is still serving reads against the *new* schema. An additive migration (new table, new nullable column) is safe through that window; the old code simply doesn't know the new thing exists yet. A `DROP COLUMN` is not: any old-code path still reading that column throws for the entire overlap, not just until the new instance takes over. The rule is expand/contract: ship the migration that adds the replacement, ship the code that stops reading the old column, deploy, confirm it's healthy, *then* ship the `DROP COLUMN` as a separate deploy.

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


---

# Keyword Matching — exact, word, and contains

## Current behaviour

`server/src/lib/keywordMatch.ts` does exactly one thing:

```ts
normalized.includes(keyword.toLowerCase())
```

Case-insensitive **substring** match, always. There is no exact mode and no way to configure one. First matching campaign wins, then first matching keyword within it, in whatever order `listActiveCampaignKeywords` returns — which is not an order anyone chose.

This was a deliberate Phase 1 scope cut ("exact-vs-contains as separate selectable modes is a preference surface no pilot has asked for; add it when one does"). Someone has now asked.

## Why substring-only is the wrong default

Creators pick **short** trigger words, and short words are substrings of common ones:

| Keyword | Also fires on |
|---|---|
| `test` | la**test**, **test**ing, con**test**, pro**test** |
| `ai` | s**ai**d, w**ai**t, ag**ai**n, em**ai**l, **ai**m |
| `link` | **link**edin |
| `pdf` | — (safe: rarely a substring) |

Every false positive is a DM sent to someone who didn't opt in, charged against the account's 750/hour ceiling, and — post 1 Oct 2026 on WhatsApp — billed. It is also the failure a creator notices publicly, because the reply appears under their post.

Note the live test used keyword `test`, which is squarely in this trap.

## Three modes, not two

- **`exact`** — the whole comment, trimmed and case-folded, equals the keyword. Strictest; right for giveaways that instruct "comment LINK".
- **`word`** — the keyword appears as a whole word (boundary-aware). Matches "send me the LINK please" but not "linkedin".
- **`contains`** — today's behaviour. Keep it for deliberately loose triggers.

**Recommendation: `word` becomes the default**, not `contains`. It is what a creator means by "trigger on LINK", it eliminates the entire false-positive class above, and it still matches natural sentences — which `exact` does not.

## Two adjacent gaps worth fixing in the same pass

- **Normalisation.** Real comments arrive as `LINK!!!`, `L I N K`, `link 🔥`, or with zero-width joiners riding along with emoji. Word matching handles trailing punctuation; it does not handle decorative characters or spaced-out letters. "Emoji & Special Character Normalization" was cut from Phase 1 into [[phase0_phase1_impl_plan]] Phase 2A for the same reason as this item, and it is the same code path.
- **Ambiguity is currently undefined.** With several campaigns, or overlapping keywords, which one wins is database order. Define it: **longest matching keyword wins** (most specific beats most general), ties broken by campaign creation order. This costs nothing now and becomes unfixable-without-surprises once creators have many campaigns.

## Steps

### K1 · Schema + matcher (S)
- `campaigns.match_mode` enum (`exact` | `word` | `contains`), default `word`.
- Backfill **existing** campaigns to `contains` — they were created under those semantics, and silently tightening a live campaign's matching is worse than a slightly odd default.
- `findMatchingCampaign` takes the mode per campaign; `word` via a boundary-aware comparison rather than a hand-rolled regex over user input (keywords must be escaped — a creator typing `a.b` or `(` must not produce a broken or catastrophically slow pattern).
- Implement longest-match-wins ordering.
- **Done when:** `test` no longer matches "latest" in `word` mode, still does in `contains`, and a keyword containing regex metacharacters matches literally.

### K2 · Normalisation (S)
- Strip zero-width characters, collapse repeated punctuation, fold emoji out of the comparison text (retaining the original in `lead_pii`, which is the record of what was actually said).
- **Done when:** `LINK!!! 🔥` and `link` both match keyword `link` in `word` mode.

### K3 · API + BUI (S)
- Expose `matchMode` on campaign create/update; a three-way selector in the campaign editor with one line of plain-language explanation each — the mode is meaningless to a creator without an example.
- **Done when:** a creator can switch a campaign to `exact` and see the change take effect on the next comment.

### K4 · Observability (S)
- Record the matched mode and keyword in the event's `attributes` (already carries `matchedKeyword`/`matchedCampaignId`).
- Surface near-misses: a comment that would have matched under a looser mode is the single most useful signal for a creator wondering why their campaign is quiet.
- **Done when:** a campaign's analytics distinguishes "no comments" from "comments that didn't match".

## Decisions to make

- **Default for new campaigns: `word`.** Stated above; the alternative is keeping `contains` for consistency with existing behaviour, which optimises for a consistency nobody experiences.
- **Whether `exact` ignores surrounding whitespace and punctuation** — I would say yes (`" LINK! "` matches `link`), otherwise `exact` is unusable in practice and every creator picks `word` by default, which makes the mode pointless.
- **Multi-keyword semantics stay OR** (any keyword matches). AND across keywords is a different feature and not obviously wanted.


---

# UI Restructuring — shell, primitives and states

## What exists today

~1,000 lines of client: four flat routes, three components, and 328 lines of hand-rolled CSS.

The CSS is better than it sounds — it already has a custom-property token layer (`--bg`, `--text`, `--accent`, `--border`, semantic ok/error pairs) and reusable classes (`.card`, `.btn-primary`, `.stat-grid`, `.table`, `.pill`, `.banner`). That is the right foundation and should be extended, not thrown away.

The structure is the problem.

## The structural issues, which matter more than the styling

1. **No app shell.** No persistent navigation, no header carrying account context. Every page renders standalone. The moment Leads, Campaigns, Milestones, Settings and Billing become real destinations, there is nowhere to put them.
2. **One route renders the entire product.** `/dashboard/:tenantId` shows analytics, leads, campaigns and billing simultaneously. You cannot link to a lead, a campaign, or the billing page. Bookmarking is useless and the back button does nothing meaningful — which will matter the first time a creator wants to send you a link to the thing that looks wrong.
3. **All-or-nothing loading.** `DashboardPage` fires four endpoints through `Promise.all` into a single error state, so one slow or failing endpoint blanks the whole dashboard. There is no loading state and no skeleton — the screen is simply empty until everything resolves.
4. **No empty states.** A newly connected creator has zero leads and zero campaigns and sees empty tables. This is the single most important screen for activation and it currently says nothing about what to do next.
5. **Auth guard lives inside the page component** rather than in routing, so every new screen re-implements it and one omission is an unguarded page.
6. **No dark mode**, though the token layer is already shaped for it — most of that work is done.
7. **Mobile is unaddressed.** Instagram creators check things on phones.

"Modern and cool" mostly falls out of fixing 1–4. Visual polish on top of a flat, stateless, unlinkable app reads as a nicer version of the same frustration.

## Approach

**Keep CSS custom properties. Add headless primitives. Do not adopt a component library.**

- Tailwind would mean rewriting every file for a system this small, and the existing tokens already do that job.
- MUI/Chakra bring bundle weight and a recognisable generic look that actively works against "cool" — and a creator-facing product competing on feel should not look like an admin console.
- **Radix primitives** (unstyled, accessible) for dialog, dropdown, tooltip, tabs, toast. They supply focus management, keyboard handling and ARIA — the parts that are genuinely hard and that hand-rolled components always get wrong — while leaving appearance entirely to our tokens.

## Steps

### V1 · App shell and routing (M)
- Layout component: sidebar (or top nav on mobile) with Overview / Campaigns / Leads / Settings, header showing the connected account and its health.
- Nested routes under `/dashboard/:tenantId`, so every destination is linkable: `/campaigns/:id`, `/leads/:id`.
- Route-level auth guard replacing the in-component check.
- **Done when:** every screen is reachable by URL, the back button behaves, and no page implements its own auth check.

### V2 · Token system and dark mode (S)
- Extend the existing custom properties into full scales: type, spacing, radii, elevation, plus state colours beyond ok/error.
- Dark theme via `prefers-color-scheme` with an explicit override, defining every token in both.
- **Done when:** no hard-coded colour or pixel value remains outside the token block, and the app is legible in both themes.

### V3 · Primitives (M)
- `Button`, `Input`, `Select`, `Dialog`, `Toast`, `Table`, `Card`, `Badge`, `Skeleton` — built on Radix where behaviour is non-trivial.
- Replace ad-hoc class usage across the three existing components.
- **Done when:** `CampaignEditor` (currently the largest file at 264 lines) is composed from primitives rather than bespoke markup, and every interactive element is keyboard-reachable.

### V4 · Loading, error and empty states (M)
- Split the `Promise.all` so each panel loads, fails and retries independently.
- Skeletons while loading; per-panel error with retry; **empty states that teach** — "No campaigns yet. Create one and comment your keyword on a post to see it fire."
- **Done when:** killing one endpoint degrades one panel instead of the page, and a brand-new account sees guidance rather than empty tables.

### V5 · Screens (M)
- **Overview**: account health, the four analytics numbers as real stat tiles, recent activity.
- **Campaigns**: list plus detail, with the [[#Keyword Matching — exact, word, and contains|match mode]] selector from that item.
- **Leads**: list plus a detail view with the lead timeline — the CRM surface [[signalAI_roadmap]] Phase 2A builds on.
- **Settings**: connected account, billing, danger zone (disconnect, delete).
- **Done when:** each is a real destination with its own URL, not a panel on one page.

### V6 · Responsive and motion (S)
- Mobile layout down to ~380px; nav collapses; tables become cards.
- Motion only where it communicates state (panel entry, toast, skeleton shimmer), all of it honouring `prefers-reduced-motion`.
- **Done when:** the dashboard is usable one-handed on a phone.

### V7 · Charts (deferred)
- Not now. The four current analytics values are numbers, and a number is better as a number. Revisit when [[signalAI_roadmap]] Phase 4's funnel and per-milestone drop-off exist, which is data with shape worth drawing.
- When that happens, load the `dataviz` skill before writing any chart code.

## Sequencing — read this before starting

**Do the [[#Identity Refactor — email login, Instagram as a connected channel|Identity Refactor]] first, or at least U6.** It adds a login screen and demotes "connect Instagram" from the app's entry point to an action inside Settings. Building the shell against today's connect-is-the-front-door model means rebuilding the navigation, the auth guard and the empty states immediately afterwards.

If both are wanted in parallel, V2 (tokens) is the one piece with no dependency on either model and can start any time.

## Risks

| Risk | Response |
|---|---|
| Rewrite scope creeps past what works | V1–V4 are structural and bounded; V5 is the only step that touches product surface, and it reuses existing API calls |
| Hand-rolled dialogs/menus break keyboard and screen-reader use | Radix for anything with focus or keyboard behaviour — that is the whole reason it is in the plan |
| Dark mode ships half-done | V2's done-condition is every token defined in both themes, not "dark mode added" |
| Polish before structure | V6 deliberately sits after states and screens; a beautiful blank screen is still a blank screen |
