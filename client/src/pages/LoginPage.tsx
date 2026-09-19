import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { requestMagicLink } from "../api";

// R14-03: `verification_failed` (spend succeeded, something after it threw)
// gets its own copy rather than reusing invalid_or_expired's wording — the
// link genuinely is dead either way, but "expired" would read as false to
// someone who clicked it seconds ago, making the message itself look broken.
const VERIFY_ERROR_MESSAGES: Record<string, string> = {
  missing_token: "That sign-in link looks incomplete. Please request a new one below.",
  invalid_or_expired: "That sign-in link has expired or was already used. Please request a new one below.",
  verification_failed:
    "That link can't be used again — something went wrong finishing sign-in after you opened it. Please request a new one below.",
};

/** Identity Refactor U6: login is now the app's entry point — Instagram connects from inside the dashboard afterward, not the other way around. */
export function LoginPage() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const verifyError = searchParams.get("error");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await requestMagicLink(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="page page-narrow">
        <h1>Check your inbox</h1>
        <p className="muted">
          If an account exists for <strong>{email.trim()}</strong>, we've sent a sign-in link. It expires in 15
          minutes and works once.
        </p>
      </div>
    );
  }

  return (
    <div className="page page-narrow">
      <h1>Sign in to signalAI</h1>
      <p className="muted">
        signalAI turns Instagram comments and DMs into leads automatically. Enter your email to get a sign-in
        link — no password to remember.
      </p>

      {error && <div className="banner banner-error">{error}</div>}
      {!error && verifyError && (
        <div className="banner banner-error">
          {VERIFY_ERROR_MESSAGES[verifyError] ?? "Something went wrong. Please request a new sign-in link below."}
        </div>
      )}

      <form onSubmit={handleSubmit} className="card">
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
          {submitting ? "Sending…" : "Send sign-in link"}
        </button>
      </form>
    </div>
  );
}
