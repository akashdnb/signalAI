import { Link, useSearchParams } from "react-router-dom";

/**
 * Identity Refactor U6: no longer the login entry point. The only way here
 * now is the server's Instagram OAuth callback (routes/auth.ts) redirecting
 * back with `?error=...` when the connect attempt failed — connecting itself
 * is initiated from inside the dashboard.
 */
const ERROR_MESSAGES: Record<string, string> = {
  missing_params: "Instagram didn't send back what we needed. Please return to Integrations and start a new connection.",
  invalid_state: "That connection link expired or was tampered with. Please return to Integrations and start a new connection.",
  session_mismatch: "We couldn't verify this was the same browser that started the connection. Return to Integrations and start again.",
  already_used: "This connection link was already used. Please start a new one from Integrations.",
  connection_failed: "We couldn't complete the connection with Instagram. Return to Integrations and try again. If it keeps failing, check the account's connection status.",
  account_already_connected: "That Instagram account is already connected to a different signalAI workspace.",
  account_mismatch: "You approved a different Instagram account than the one you're reconnecting. In Instagram, switch to the account you're reconnecting (or log out of the other one), then return to Integrations and reconnect.",
};

export function ConnectPage() {
  const [searchParams] = useSearchParams();
  const error = searchParams.get("error");
  const message = error ? (ERROR_MESSAGES[error] ?? "We couldn't complete the Instagram connection. Return to Integrations and start a new connection.") : "This page is only used after starting an Instagram connection from Integrations. Return there to begin a new connection.";

  return (
    <div className="page page-narrow">
      <h1>Instagram connection</h1>
      <div className="banner banner-error" role="alert">
        {message}
      </div>
      <p className="muted">
        <Link to="/">Return to dashboard</Link>
      </p>
    </div>
  );
}
