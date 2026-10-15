import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { workspaceApi } from "../api/workspace";
import { Button, LoadingState } from "../components/ui";

type Status = "loading" | "success" | "missing_token" | "unauthenticated" | "invalid";

const NEXT_STEPS = ["Check the invitation email address", "Sign in with the correct workspace account", "Ask the owner to resend an expired or revoked invitation"];

/**
 * The server deliberately returns one generic reason for every rejected
 * token (expired, already accepted, revoked, or sent to a different email —
 * see workspaceManagement.ts's `acceptTenantInvitation` query) rather than
 * distinguishing them, to avoid leaking which case applies to an attacker
 * holding someone else's invitation link. The preview's four separate demo
 * states (expired/used/revoked/wrong-email) aren't ported 1:1 for that
 * reason — showing a specific cause here would be guessing, not real data.
 */
export function InvitationAcceptPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token");
  const [status, setStatus] = useState<Status>("loading");
  const [tenantId, setTenantId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("missing_token");
      return;
    }

    workspaceApi
      .acceptInvitation(token)
      .then(({ tenantId: id }) => {
        setTenantId(id);
        setStatus("success");
        window.setTimeout(() => navigate(`/dashboard/${id}`, { replace: true }), 400);
      })
      .catch((error) => {
        const apiStatus = (error as Error & { status?: number }).status;
        setStatus(apiStatus === 401 ? "unauthenticated" : "invalid");
      });
  }, [token, navigate]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-6 py-16">
        <div className="w-full max-w-xl rounded-2xl border border-line bg-card">
          <LoadingState label="Accepting invitation…" />
        </div>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-6 py-16">
        <div className="w-full max-w-xl rounded-2xl border border-line bg-card p-8">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-ok bg-ok text-ok-ink" aria-hidden="true">
            ✓
          </div>
          <div className="mt-6 text-xs font-semibold uppercase tracking-wide text-subtle">Workspace access</div>
          <h1 className="m-0 mt-1 text-2xl font-bold text-ink">Invitation accepted</h1>
          <p className="mt-2 text-sm leading-6 text-subtle" role="status">
            You're now a member of the workspace. Taking you there now…
          </p>
          <div className="mt-6">
            <Button variant="primary" onClick={() => tenantId && navigate(`/dashboard/${tenantId}`, { replace: true })}>
              Continue now
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const content =
    status === "missing_token"
      ? {
          heading: "This invitation link is incomplete",
          description: "Open the full invitation link from the email, or ask the workspace owner to resend it.",
        }
      : status === "unauthenticated"
        ? {
            heading: "Sign in to accept this invitation",
            description: "Sign in with the email address this invitation was sent to, then open the invitation link again.",
          }
        : {
            heading: "This invitation isn't valid",
            description: "It may have expired, already been used, been revoked, or been sent to a different email address than the one you're signed in with.",
          };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6 py-16">
      <div className="w-full max-w-xl rounded-2xl border border-line bg-card p-8">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-warn-line bg-warn text-lg font-bold text-warn-ink"
          aria-hidden="true"
        >
          !
        </div>
        <div className="mt-6 text-xs font-semibold uppercase tracking-wide text-subtle">Workspace access</div>
        <h1 className="m-0 mt-1 text-2xl font-bold text-ink">{content.heading}</h1>
        <p className="mt-2 text-sm leading-6 text-subtle" role="alert">
          {content.description}
        </p>

        {status === "invalid" && (
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
          <Button variant="primary" onClick={() => navigate("/login")}>
            Sign in
          </Button>
          {status === "invalid" && token && (
            <Button variant="secondary" onClick={() => window.location.reload()}>
              Try invitation again
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
