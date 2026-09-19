import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { saveSession } from "../api";

/**
 * Lands here via a top-level browser redirect from the server's
 * GET /auth/email/verify (see server's routes/authEmail.ts) — tenantId is
 * a query param, the session token is a URL FRAGMENT (`#token=...`),
 * never a query param, so it's never sent in a Referer header or logged
 * anywhere on the way here (R11-01). Read once, saved to localStorage,
 * then immediately stripped from the visible URL via
 * navigate(..., {replace: true}) (history.replaceState under the hood)
 * so it never sits in browser history either.
 */
export function LoginVerifyPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const tenantId = searchParams.get("tenantId");
    const token = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token");

    if (!tenantId || !token) {
      navigate("/login?error=verification_failed", { replace: true });
      return;
    }

    saveSession({ tenantId, token });
    navigate(`/dashboard/${tenantId}`, { replace: true });
  }, [searchParams, navigate]);

  return (
    <div className="page page-narrow">
      <p>Signing you in…</p>
    </div>
  );
}
