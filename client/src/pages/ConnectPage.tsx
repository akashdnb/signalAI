import { Link, useSearchParams } from "react-router-dom";

/**
 * Identity Refactor U6: no longer the login entry point. The only way here
 * now is the server's Instagram OAuth callback (routes/auth.ts) redirecting
 * back with `?error=...` when the connect attempt failed — connecting itself
 * is initiated from inside the dashboard.
 */
const ERROR_MESSAGES: Record<string, string> = {
  missing_params: "Instagram didn't send back what we needed. Please try connecting again.",
  invalid_state: "That connection link expired or was tampered with. Please try connecting again.",
  session_mismatch: "We couldn't verify this was the same browser that started the connection. Please try again.",
  already_used: "This connection link was already used. Please start a new one from your dashboard.",
  connection_failed: "We couldn't complete the connection with Instagram. Please try again in a moment.",
  account_already_connected: "That Instagram account is already connected to a different signalAI workspace.",
};

export function ConnectPage() {
  const [searchParams] = useSearchParams();
  const error = searchParams.get("error");

  return (
    <div className="page page-narrow">
      <h1>Connecting Instagram</h1>
      <div className="banner banner-error">
        {error ? (ERROR_MESSAGES[error] ?? "Something went wrong. Please try again.") : "Something went wrong. Please try again."}
      </div>
      <p className="muted">
        <Link to="/">Back to your dashboard</Link>
      </p>
    </div>
  );
}
