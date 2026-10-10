---
title: Connect Instagram
slug: connect-instagram
group: Get started
description: Authorize a professional Instagram account and verify that SignalAI receives its events.
order: 3
related: quick-start, triggers-and-keywords, troubleshooting
---

## Requirements

Use an Instagram professional account and sign in with the Meta identity that can authorize it. The account must grant the permissions requested by SignalAI. Meta may show different screens depending on the account and business setup.

## Start the connection from the dashboard

1. Sign in to SignalAI.
2. Open Connect from the dashboard navigation.
3. Start the Instagram connection and complete the Meta authorization.
4. Return to SignalAI and check the connection state.

The connection flow is initiated from inside the dashboard. Do not bookmark a callback URL as a way to start future connections.

## Verify event delivery

1. Open a journey configured for the connected Instagram account.
2. Trigger a fresh test by sending a DM or posting a matching comment on a targeted post.
3. Open Inbox and confirm the activity is visible.
4. If the event does not arrive, check account status, journey status, and trigger settings before changing several things at once.

A connected account alone does not prove that a specific journey will match a message. Check account connection, event delivery, trigger type, keywords, post targeting, and active status separately.

## Common connection errors

- **Missing parameters:** Meta did not return the expected connection parameters. Start the connection again from the dashboard.
- **Invalid state or already used:** the authorization link is expired or has already been used. Begin a fresh connection.
- **Session mismatch:** retry in the same browser session that started the connection.
- **Connection failed:** retry after checking the account authorization and Meta setup.
- **Account already connected:** the account is linked to a different SignalAI workspace. Check account ownership before trying to connect it elsewhere.

## Best practices

- Connect an account using a browser session where the authorizing user can complete the Meta flow.
- Test incoming comments and DMs after connecting instead of relying solely on a Connected label.
- Keep account ownership clear across workspaces; don't repeatedly reconnect an account that belongs to another workspace.
- When reporting a connection issue, include the displayed error code and approximate test time, but redact tokens and private customer details.

## Next step

Once incoming activity appears in Inbox, use Triggers & Keywords to make sure the journey responds only to the intended activity.
