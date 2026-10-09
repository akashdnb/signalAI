# Instagram webhook subscription on connect

**Problem reported:** first connected Instagram account's DMs show up in the inbox fine; a second account, freshly connected with permissions granted, never produces any inbound messages.

**Root cause:** granting OAuth permissions is necessary but not sufficient — per Meta's Instagram Platform webhooks docs, each individual professional account must separately call `POST /me/subscribed_apps` with its own token before Meta will deliver any `comments`/`messages` notifications for that account. The OAuth callback (`server/src/routes/auth.ts`) exchanged the code, fetched the profile, and saved the token (`upsertToken`) — but never made that call. The connection looked completely healthy (valid token, correct account id, `status: 'healthy'`) while silently receiving nothing. The first account almost certainly got subscribed once, out of band, during earlier manual/Graph-Explorer testing; every account connected through the product UI since then was affected.

**Fix:**
- `server/src/lib/instagramOAuth.ts` — new `subscribeToWebhooks(accessToken)`: `POST https://graph.instagram.com/me/subscribed_apps?subscribed_fields=comments,messages`.
- `server/src/routes/auth.ts` — calls it right after `upsertToken` in the OAuth callback (must run after, since `upsertToken` resets `status` to `'healthy'` on conflict). On failure: logs, reports to Sentry, and calls `markTokenError` instead of failing the whole connect — the token itself is still valid and worth keeping, and the Integrations page already renders `status: 'error'` / `lastError` as "Needs attention".
- `server/src/services/webhookIngestService.ts` — the `continue` for an unresolvable `instagramAccountId` was completely silent (no log, no metric), making a subscribed-but-misrouted or never-subscribed account indistinguishable from "no events at all" in the logs. Added a `console.warn`.

**Tests:**
- `server/src/lib/__tests__/instagramOAuth.test.ts` — `subscribeToWebhooks` posts the right URL/fields/token; throws with the response body on a non-OK response.
- `server/src/routes/__tests__/auth.test.ts` — callback calls `subscribeToWebhooks` with the newly exchanged long-lived token; a subscription failure still completes the connect (redirects to dashboard) but leaves the account `status: 'error'` with a reconnect-pointing `last_error`.

All affected suites pass; `tsc --noEmit` clean. One pre-existing, unrelated flake in `src/__tests__/app.test.ts` (`Data Deletion Callback` pg-boss worker timing) reproduces identically on `main` before this change — not touched here.

**Not done / caller's call:**
- No backfill script for Instagram accounts connected before this fix (and therefore never subscribed) — the fastest fix for those is a manual `curl -X POST .../me/subscribed_apps` with each account's token, or disconnect-and-reconnect through the product now that connect subscribes automatically. Say the word if a backfill script covering every `meta_tokens` row is wanted.
- Multi-account-per-tenant is out of scope — `getSoleConnectedAccount`'s `order by created_at limit 1` is a deliberate, already-documented Phase 1 limitation, unrelated to this bug.
