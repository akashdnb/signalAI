# Notification & alerting

SignalAI's notification feature uses PostgreSQL as the durable event/delivery ledger and the existing pg-boss service for asynchronous provider work. It does not depend on NotifyMCP.

## Current supported surface

- Event catalog: new lead; automation execution failed/recovered; Instagram connection needs attention/disconnected; important system operational alert.
- Channels: in-app and email using the configured Resend account.
- Telegram is intentionally not offered as a user preference yet. The existing Telegram integration targets one server-wide operations chat; SignalAI does not yet have a verified per-user Telegram destination/pairing flow. Treating that global chat as a per-user setting would cross account boundaries.
- In-app is enabled by default. Email is opt-in per event, signed-in user, and workspace. A user's preferences in one workspace do not affect another workspace.

## Event publication contract

Application code calls `publishNotificationEvent(pool, boss, input)` with the tenant/workspace id resolved from trusted server context, a controlled event type, and a stable idempotency key. The service validates an optional recipient against `tenant_members`, or fans out to the current members of that tenant. Clients cannot choose recipients or insert event records through the HTTP API.

The tuple `(tenant_id, event_type, idempotency_key)` is unique. A duplicate publisher call returns the original event and does not create additional notification or delivery rows. The new-lead queue is the first integrated producer. Other event types share this API so future automation and Instagram lifecycle publishers do not need provider-specific logic.

## Delivery states and retries

- In-app rows and their delivery status are written in the same transaction as the event fan-out.
- Email uses Resend and is processed asynchronously. Only an HTTP success is marked delivered; missing configuration, invalid sender/credentials, malformed recipient, and other permanent provider rejections are not reported as success.
- Transient network/timeout, rate-limit, and 5xx failures retry with a bounded 30s, 60s, 120s, 240s schedule; the fifth failed attempt is terminal. Provider error bodies and secrets are never persisted.
- Delivery rows keep channel, provider, attempts, next attempt, final state, safe error code and successful provider message id. Logs carry event/workspace/channel/attempt/result metadata, without message content or credentials.
- Delivery creation is idempotent per event/recipient/channel. The worker atomically claims a pending delivery before calling the provider, preventing concurrent workers from double-sending the same row. As with any third-party email API, an ambiguous timeout after the provider accepted a message can still result in a retry; the database prevents duplicate application events but cannot guarantee exactly-once external delivery without a provider-supported idempotency contract.

## HTTP API

- `GET /tenants/:tenantId/notifications/preferences`
- `PUT /tenants/:tenantId/notifications/preferences`
- `GET /tenants/:tenantId/notifications?limit=10`
- `PATCH /tenants/:tenantId/notifications/:notificationId/read`
- `POST /tenants/:tenantId/notifications/read-all`

Preferences and in-app history are scoped to the authenticated user and a tenant membership verified by the existing role middleware. Unsupported channels/event types are rejected. History does not accept a target user id. Reads and mark-as-read queries constrain the notification id, tenant id, and current user together.

## Operational setup

Email is reported unavailable until `RESEND_API_KEY` is configured. `RESEND_FROM_ADDRESS` should use a verified sender domain for production recipients. No secret values are returned to the client or written to notification history. The existing per-installation Telegram credentials are intentionally not reused for user delivery.

## Extending the catalog

Add an event only when it corresponds to a real product or operational state. Update the allowlist and database check constraint in a migration together. Publish the event at the point where the business state transition is durably confirmed; use a stable business key for idempotency. Do not emit notifications from request code that has not yet committed the underlying state.
