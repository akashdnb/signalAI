# Changelog

Chronological log of shipped changes, newest first. Each entry names the driving problem, what changed, and any follow-up it leaves open — `docs/reviews.md` is where those get reviewed and closed out, this file is just the record of what shipped and why.

---

## 2026-09-21 — Post-targeting UX, campaign trigger source, permission corrections

**Enrich the post-targeting picker; let a post be added by URL** (migration `1758240000027`)
- `GET /tenants/:id/observed-media` no longer shows a bare numeric media id — it now lazily enriches each entry with cached Graph API metadata (caption, thumbnail, permalink) via a new `media_metadata` table, fetching whatever's missing one media at a time and caching it (`server/src/lib/instagramMedia.ts`, `server/src/db/mediaMetadata.ts`).
- New `POST /tenants/:id/known-media` resolves a pasted post/Reel URL against the connected account's own media (matched by shortcode — there's no direct shortcode→media-id lookup) so a post can be targeted before any comment on it exists.
- Requires `instagram_business_basic`, already requested in the OAuth scope.
- Found and fixed along the way: `usernameResolutionQueue.test.ts` never cleared leftover `pgboss.job` rows between runs, letting jobs a sibling test file enqueues-but-never-consumes accumulate across every full-suite run until they pushed a real job past its timeout.

**Campaign trigger source: comment, message, or both** (migration `1758240000026`)
- Campaigns could previously only ever be triggered by a keyword in a comment. Added `campaigns.trigger_source` (`comment` / `message` / `both`, default `comment` — no behavior change for existing campaigns). `webhookIngestService.ts` now matches DM text too, scoped to campaigns whose `trigger_source` allows it.
- Distinct from `reply_channel` (where the reply is delivered) — a DM-triggered event still can't produce a public comment reply (no comment to attach to), which already degraded safely from the earlier reply-channel work with no new code needed.

**Corrected the comment-reply permission name**
- Code comments and UI copy referenced a guessed `instagram_manage_comments` scope; the actual (and already-requested, since an earlier commit) scope is `instagram_business_manage_comments`. Fixed in `instagramSend.ts` and `CampaignEditor.tsx`.

## 2026-09-20 — Post targeting, reply channels, email OTP login, lead observability

**Per-post targeting + reply-channel config for campaigns** (migration `1758240000024`)
- Comments were matched against every enabled campaign tenant-wide, with no notion of which post they were on, and every reply always went out as a DM regardless of the existing "comment" vs "dm" prompt tier.
- Added `campaigns.target_media_ids` (empty = every post, the prior behavior) and `campaigns.reply_channel` (`dm` / `comment` / `both`, default `dm`). Added `sendInstagramCommentReply` (`POST /{comment-id}/replies`) alongside the existing DM send. `leadEventReplyHandler.ts` gates each delivery channel independently — DM needs the 24h messaging window and the 750/hour cap; a public reply needs only the comment id and isn't capped.
- The post picker itself shipped bare-media-id-only in this round; enriched and given an add-by-URL option the next day (see above).

**Replaced magic-link login with email OTP**
- The magic-link flow required a top-level browser navigation away from the app (open the email, click the link, land back via a redirect carrying the session in a URL fragment) — this read as broken whenever the link opened in a different browser than the one signing in.
- New `email_otp_codes` table (HMAC-hashed 6-digit codes, 10-minute TTL, a 5-attempt lockout per code — a 6-digit space needs its own brute-force cap beyond the existing per-email/per-IP issuance rate limit). `POST /auth/email/verify` now returns the session directly in its JSON response instead of redirecting. `magic_link_tokens` was left in place, unread, per this repo's own expand/contract convention (`docs/reviews.md` R15-02) — dropping it in the same deploy that stops reading it would break the prior deploy's code during Render's staged rollout overlap. **Follow-up still open: drop `magic_link_tokens` in a later migration once the OTP deploy is confirmed live.**
- Follow-up fix the same day: `RESEND_API_KEY` being set doesn't mean a code actually got emailed — Resend's shared sandbox sender 403s ("you can only send testing emails to your own email address") for every recipient but the Resend account owner, until a custom domain is verified. The code is now logged as a fallback on a failed send too, not only when Resend is unconfigured. **Follow-up still open: verify a custom sending domain in Resend once one is available (Render's own `*.onrender.com` subdomain can't be verified — no DNS control over it).**

**Distinguish comment vs. DM leads; resolve usernames for DM-only leads**
- The Leads table had no way to tell whether a lead's contact was a public comment or a DM, and every DM-only lead (including one whose first contact is a shared Reel, which also arrives as a message event) showed as "(unknown)" — Meta's Messaging webhook only ever supplies the sender's IGSID, never a username, unlike Comments.
- Added a "Via" column sourced from each lead's most recent event type. Added a background queue (`usernameResolutionQueue.ts`) that resolves a real username via Meta's profile lookup for any event that arrives without one, writing it into the existing `lead_pii` row (covered by the existing deletion scrub for free, no new PII location) rather than the ingest path itself, which stays fast/local by design.

---

*Entries before this point were not retroactively logged here — see `git log` and `docs/reviews.md` for the project's history prior to 2026-09-20.*
