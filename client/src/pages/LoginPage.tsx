import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, requestOtp, saveSession, verifyOtp } from "../api";
import { Logo } from "../components/Logo";

const VERIFY_ERROR_MESSAGES: Record<string, string> = {
  invalid_or_expired_code: "That code is incorrect or has expired. Please check your inbox for the latest code.",
  too_many_attempts: "Too many incorrect attempts for that code. Please request a new one.",
};

const CHECKLIST = [
  "Auto-reply to comments & DMs",
  "Qualify leads with AI",
  "Track every lead through your pipeline",
  "See what's converting in Analytics",
];

function BrandPanel() {
  return (
    <div className="relative hidden w-[46%] shrink-0 flex-col justify-between overflow-hidden bg-[#0F172A] px-12 py-12 text-white md:flex">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{ background: "radial-gradient(60% 50% at 20% 15%, rgba(124,58,237,0.5), transparent), radial-gradient(50% 40% at 90% 85%, rgba(34,211,238,0.35), transparent)" }}
      />
      <div className="relative">
        <span className="inline-flex items-center gap-2 text-lg font-bold">
          <svg width={28} height={28} viewBox="0 0 512 512" aria-hidden="true" className="shrink-0">
            <defs>
              <linearGradient id="login-logo-gradient" x1="80" y1="430" x2="430" y2="70" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#22D3EE" />
                <stop offset=".45" stopColor="#2563EB" />
                <stop offset="1" stopColor="#7C3AED" />
              </linearGradient>
            </defs>
            <path
              fill="url(#login-logo-gradient)"
              d="M320 62c-70 5-134 38-168 86-30 42-22 79 23 102l83 42c18 9 19 22 2 37-25 22-67 34-113 32l-45 66c88 9 174-18 220-70 40-46 38-90-15-118l-82-43c-19-10-18-23 3-39 24-19 61-29 104-28l42-67z"
            />
            <path fill="#22D3EE" d="M402 57l9 24 24 9-24 9-9 24-9-24-24-9 24-9z" />
          </svg>
          signal<span className="text-[#22D3EE]">AI</span>
        </span>
      </div>

      <div className="relative">
        <h1 className="m-0 text-4xl font-extrabold leading-tight">
          Turn Instagram enquiries into <span className="text-[#22D3EE]">qualified customers</span>
        </h1>
        <p className="mt-4 max-w-sm text-sm text-white/70">
          AI-powered Instagram automation: reply to comments and DMs, qualify leads, and hand over high-intent
          customers to your team.
        </p>
        <ul className="mt-8 list-none space-y-3 p-0">
          {CHECKLIST.map((item) => (
            <li key={item} className="flex items-center gap-3 text-sm text-white/90">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#22D3EE]/20 text-[#22D3EE]">
                ✓
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>

      <p className="relative text-xs text-white/40">© {new Date().getFullYear()} signalAI</p>
    </div>
  );
}

function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-canvas px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 md:hidden">
          <Logo size="md" />
        </div>
        {children}
      </div>
    </div>
  );
}

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
      saveSession({ ...session, email: email.trim() });
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
      <div className="flex min-h-screen">
        <BrandPanel />
        <AuthCard>
          <h1 className="m-0 text-2xl font-bold text-ink">Enter your code</h1>
          <p className="mt-2 text-sm text-subtle">
            We sent a 6-digit code to <strong className="text-ink">{email.trim()}</strong>. It expires in 10 minutes.
          </p>

          {error && <div className="banner banner-error mt-4">{error}</div>}

          <form onSubmit={handleVerifyCode} className="mt-6 space-y-4">
            <div>
              <label htmlFor="code" className="text-sm font-medium text-ink">
                Sign-in code
              </label>
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
                className="text-center text-lg tracking-[0.5em]"
              />
            </div>
            <button
              type="submit"
              className="btn-primary w-full"
              disabled={code.trim().length !== 6 || submitting}
            >
              {submitting ? "Verifying…" : "Sign in"}
            </button>
          </form>

          <p className="mt-6 text-sm text-subtle">
            Didn't get it?{" "}
            <button type="button" className="link-button font-medium text-ink" onClick={handleResend} disabled={submitting}>
              Send a new code
            </button>{" "}
            or{" "}
            <button
              type="button"
              className="link-button font-medium text-ink"
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
        </AuthCard>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <BrandPanel />
      <AuthCard>
        <h1 className="m-0 text-2xl font-bold text-ink">Welcome back</h1>
        <p className="mt-2 text-sm text-subtle">
          Enter your email to get a 6-digit sign-in code — no password to remember.
        </p>

        {error && <div className="banner banner-error mt-4">{error}</div>}

        <form onSubmit={handleRequestCode} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="text-sm font-medium text-ink">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              autoFocus
            />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={!email.trim() || submitting}>
            {submitting ? "Sending…" : "Send sign-in code"}
          </button>
        </form>
      </AuthCard>
    </div>
  );
}
