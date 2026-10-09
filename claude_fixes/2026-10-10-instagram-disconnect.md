# Instagram disconnect

**Problem:** Once an Instagram account was connected there was no way to disconnect it — the Integrations page only ever rendered a Connect button, and no API existed to drop a tenant's stored token.

**Change:**
- `server/src/db/tokens.ts` — `deleteTokensForTenant(pool, tenantId)` deletes the tenant's `meta_tokens` rows. The token row *is* the connection: inbound webhooks resolve their tenant through it (`db/accounts.ts`) and the send path reads it via `getSoleConnectedAccount`, so removing it stops both directions. `instagram_inbound_events` cascades off `meta_tokens(id)`; leads and their history are untouched.
- `server/src/routes/dashboard.ts` — `DELETE /tenants/:tenantId/account`, already behind `requireTenantSession`. Idempotent: always 200 `{connected:false}`, since the caller's intent is satisfied whether or not a row existed.
- `client/src/api.ts` — `api.disconnectInstagram(tenantId)`.
- `client/src/pages/IntegrationsPage.tsx` — the Instagram card shows Disconnect when connected, with an inline confirm (no `window.confirm`; the app has no modal/confirm primitive) explaining that replies stop immediately and leads are kept. On success the card falls back to the Connect state.

**Notes / not done:**
- This is a channel disconnect, not a data deletion — `lib/deletionService.ts` remains the GDPR/Meta scrub path.
- No server-side revoke of the Meta grant: Instagram Login exposes no revoke endpoint, so the creator removes the app from their Instagram settings if they want the authorization itself gone.
- Trial history (`instagram_trial_history`) is deliberately left in place — clearing it on disconnect would reopen the trial-abuse loophole that registration exists to close.

**Tests:** two added in `server/src/routes/__tests__/dashboard.test.ts` (disconnect + idempotency; cross-tenant session gets 403 and the connection survives). Full file passes (32); `tsc --noEmit` clean on server and client.
