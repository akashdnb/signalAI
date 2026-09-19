import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { saveSession } from "../api";

/**
 * Lands here via a top-level browser redirect from the server's
 * /auth/instagram/callback (see server's routes/auth.ts) — tenantId is a
 * query param, the session token is a URL FRAGMENT (`#token=...`), never
 * a query param, so it's never sent in a Referer header. Read once, saved
 * to localStorage, then immediately stripped from the visible URL via
 * history.replaceState (via navigate(..., {replace:true})) so it never
 * sits in browser history either.
 */
export function ConnectedPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const tenantId = searchParams.get("tenantId");
    const token = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token");

    if (!tenantId || !token) {
      navigate("/connect?error=connection_failed", { replace: true });
      return;
    }

    saveSession({ tenantId, token });
    navigate(`/dashboard/${tenantId}`, { replace: true });
  }, [searchParams, navigate]);

  return (
    <div className="page page-narrow">
      <p>Finishing up your connection…</p>
    </div>
  );
}
