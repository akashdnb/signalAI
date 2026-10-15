import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { loadSession } from "../api";
import { Button } from "../components/ui";

/**
 * Identity Refactor U6: no longer the login entry point. The only way here
 * now is the server's Instagram OAuth callback (routes/auth.ts) redirecting
 * back with `?error=...` when the connect attempt failed — connecting itself
 * is initiated from inside the dashboard.
 */
const ERROR_CONTENT: Record<string, { heading: string; description: string }> = {
  missing_params: {
    heading: "We couldn't finish connecting Instagram",
    description: "The callback is missing required information. Return to Integrations and start the connection flow again.",
  },
  invalid_state: {
    heading: "This connection link has expired",
    description: "The security state attached to the connection is invalid or expired. Start a new connection from Integrations.",
  },
  session_mismatch: {
    heading: "The connection belongs to another session",
    description: "We couldn't verify this was the same browser that started the connection. Sign in to the intended workspace and start again.",
  },
  already_used: {
    heading: "This connection link was already used",
    description: "Each connection link works once. Start a new one from Integrations.",
  },
  connection_failed: {
    heading: "Instagram couldn't be connected",
    description: "Review the requested permissions and try again. Your existing account and workspace have not been changed.",
  },
  account_already_connected: {
    heading: "That account is already connected elsewhere",
    description: "This Instagram account is already connected to a different signalAI workspace. Disconnect it there first, or connect a different account.",
  },
  account_mismatch: {
    heading: "A different Instagram account was approved",
    description: "You approved a different Instagram account than the one you're reconnecting. In Instagram, switch to the intended account (or log out of the other one), then reconnect.",
  },
};

const DEFAULT_CONTENT = {
  heading: "This page is only used mid-connection",
  description: "You can only reach this page after starting an Instagram connection from Integrations. Return there to begin a new connection.",
};

const NEXT_STEPS = [
  "Check you're signed in to the correct workspace",
  "Start a fresh connection from Integrations",
  "Confirm the requested Instagram permissions",
];

export function ConnectPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const error = searchParams.get("error");
  const { heading, description } = (error && ERROR_CONTENT[error]) || DEFAULT_CONTENT;
  const session = loadSession();
  const integrationsPath = session ? `/dashboard/${session.tenantId}/integrations` : "/login";

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6 py-16">
      <div className="w-full max-w-xl rounded-2xl border border-line bg-card p-8">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-warn-line bg-warn text-lg font-bold text-warn-ink"
          aria-hidden="true"
        >
          !
        </div>
        <div className="mt-6 text-xs font-semibold uppercase tracking-wide text-subtle">Connection recovery</div>
        <h1 className="m-0 mt-1 text-2xl font-bold text-ink">{heading}</h1>
        <p className="mt-2 text-sm leading-6 text-subtle" role="alert">
          {description}
        </p>

        {error && (
          <div className="mt-6 rounded-xl border border-line bg-canvas p-4">
            <div className="text-sm font-semibold text-ink">What to do next</div>
            <ul className="mt-2 list-none space-y-1.5 p-0 text-sm text-subtle">
              {NEXT_STEPS.map((step) => (
                <li key={step} className="flex items-start gap-2">
                  <span aria-hidden="true">→</span>
                  {step}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={() => navigate(integrationsPath)}>
            Return to Integrations
          </Button>
          <Button variant="secondary" onClick={() => navigate("/login")}>
            Start over
          </Button>
          {error && (
            <Button variant="ghost" onClick={() => setShowTechnicalDetails((v) => !v)}>
              {showTechnicalDetails ? "Hide" : "Show"} technical details
            </Button>
          )}
        </div>

        {showTechnicalDetails && error && (
          <div className="mt-4 rounded-lg border border-line bg-canvas p-3 text-xs leading-5 text-subtle">
            <div className="font-semibold text-ink">Technical details</div>
            Status code: <code>{error}</code>
          </div>
        )}
      </div>
    </div>
  );
}
