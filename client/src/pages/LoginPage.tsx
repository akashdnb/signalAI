import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, requestOtp, saveSession, verifyOtp } from "../api";

const VERIFY_ERROR_MESSAGES: Record<string, string> = {
  invalid_or_expired_code: "That code is incorrect or has expired. Please check your inbox for the latest code.",
  too_many_attempts: "Too many incorrect attempts for that code. Please request a new one.",
};

/** Login is the app's entry point — Instagram connects from inside the dashboard afterward, not the other way around. A 6-digit email code, entered on this same page: no redirect, no leaving the tab. */
export function LoginPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await requestOtp(email.trim());
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const session = await verifyOtp(email.trim(), code.trim());
      saveSession(session);
      navigate(`/dashboard/${session.tenantId}`, { replace: true });
    } catch (err) {
      const message = err instanceof ApiError ? (VERIFY_ERROR_MESSAGES[err.message] ?? err.message) : "Something went wrong. Please try again.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setSubmitting(true);
    setError(null);
    try {
      await requestOtp(email.trim());
      setCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "code") {
    return (
      <div className="page page-narrow">
        <h1>Enter your code</h1>
        <p className="muted">
          We sent a 6-digit code to <strong>{email.trim()}</strong>. It expires in 10 minutes.
        </p>

        {error && <div className="banner banner-error">{error}</div>}

        <form onSubmit={handleVerifyCode} className="card">
          <label htmlFor="code">Sign-in code</label>
          <input
            id="code"
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            required
          />
          <button type="submit" className="btn-primary" disabled={code.trim().length !== 6 || submitting}>
            {submitting ? "Verifying…" : "Sign in"}
          </button>
        </form>

        <p className="muted small">
          Didn't get it?{" "}
          <button type="button" className="link-button" onClick={handleResend} disabled={submitting}>
            Send a new code
          </button>{" "}
          or{" "}
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
            }}
          >
            use a different email
          </button>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="page page-narrow">
      <h1>Sign in to signalAI</h1>
      <p className="muted">
        signalAI turns Instagram comments and DMs into leads automatically. Enter your email to get a 6-digit
        sign-in code — no password to remember.
      </p>

      {error && <div className="banner banner-error">{error}</div>}

      <form onSubmit={handleRequestCode} className="card">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
        />
        <button type="submit" className="btn-primary" disabled={!email.trim() || submitting}>
          {submitting ? "Sending…" : "Send sign-in code"}
        </button>
      </form>
    </div>
  );
}
