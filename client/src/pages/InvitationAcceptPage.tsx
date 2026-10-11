import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { workspaceApi } from "../api/workspace";

export function InvitationAcceptPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token");
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Accepting invitation…");

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("This invitation link is missing its token.");
      return;
    }

    workspaceApi.acceptInvitation(token)
      .then(({ tenantId }) => {
        setState("success");
        setMessage("You are now a member of the workspace. Redirecting…");
        window.setTimeout(() => navigate(`/dashboard/${tenantId}`, { replace: true }), 400);
      })
      .catch((error) => {
        const status = (error as Error & { status?: number }).status;
        if (status === 401) {
          setState("error");
          setMessage("Please sign in with the email address this invitation was sent to, then open the invitation again.");
          return;
        }
        setState("error");
        setMessage(error instanceof Error ? error.message : "This invitation could not be accepted.");
      });
  }, [token, navigate]);

  return (
    <main className="page" style={{ maxWidth: 560, margin: "5rem auto" }}>
      <section className="card">
        <h1>{state === "success" ? "Invitation accepted" : "Workspace invitation"}</h1>
        <p className={state === "error" ? "banner banner-error" : "muted"} role="status">{message}</p>
        {state === "error" && <Link className="btn-primary btn-small" to="/login">Go to sign in</Link>}
      </section>
    </main>
  );
}
