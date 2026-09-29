/**
 * Meta's real per-account send rate limit, shared by every path that can
 * send a DM through a tenant's connected Instagram account — the automated
 * reply pipeline (leadEventReplyHandler.ts) and a human's own reply
 * (routes/leads.ts's /reply endpoint). One source of truth so the two
 * paths can't drift out of sync with each other.
 */
export const HOURLY_SEND_LIMIT = 750;
