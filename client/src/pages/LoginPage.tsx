import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, requestOtp, saveSession, verifyOtp } from "../api";
import { InboxIcon } from "../components/icons";
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

function GoogleIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 18 18" aria-hidden="true" className="shrink-0">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.87 2.7-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.94v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.17.29-1.7V4.97H.94A9 9 0 0 0 0 9c0 1.45.35 2.83.94 4.03z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .94 4.97L3.95 7.3C4.66 5.17 6.65 3.58 9 3.58z" />
    </svg>
  );
}

function MetaIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 18 18" aria-hidden="true" className="shrink-0">
      <rect width={18} height={18} rx={4} fill="#0866FF" />
      <path
        fill="#fff"
        d="M5.1 12.4c0-2.7 1.2-5.2 2.85-5.2 1 0 1.65.85 2.28 2.15.6-1.35 1.24-2.15 2.18-2.15 1.63 0 2.79 2.36 2.79 5.05 0 1.02-.2 1.65-.62 1.65-.5 0-.7-.5-1.36-2.06-.5-1.18-1.02-2.32-1.4-2.32-.34 0-.62.5-1.05 1.55.55 1.1.94 1.98.94 2.5 0 .48-.24.83-.7.83-.6 0-.98-.6-1.6-2.1-.6 1.5-.98 2.1-1.58 2.1-.46 0-.7-.36-.7-.86 0-.5.36-1.3.9-2.4-.42-1.03-.7-1.6-1.04-1.6-.4 0-.9 1.16-1.4 2.4-.6 1.48-.86 2.02-1.36 2.02-.42 0-.67-.5-.67-1.56z"
      />
    </svg>
  );
}

type SsoProvider = "google" | "meta";

/**
 * Google/Meta OAuth aren't wired up server-side yet. Kept fully enabled
 * (no `disabled` attribute/dimming) so they read as real options rather
 * than dead UI — clicking one reveals an inline "not yet" note instead of
 * graying the button out upfront.
 */
function SsoButton({
  provider,
  icon,
  label,
  unavailable,
  onClick,
}: {
  provider: SsoProvider;
  icon: React.ReactNode;
  label: string;
  unavailable: boolean;
  onClick: () => void;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center justify-center gap-3 rounded-[10px] border border-line bg-card px-4 py-[0.6rem] text-[0.95rem] font-semibold text-ink transition-colors hover:bg-chip"
      >
        {icon}
        {label}
      </button>
      {unavailable && (
        <p className="mt-1.5 text-center text-xs text-subtle" data-provider={provider}>
          Temporarily unavailable — please use email
        </p>
      )}
    </div>
  );
}

/**
 * Illustrative only — a flat vector house (not a photo asset, and not a
 * plain color swatch either) with two floating chat bubbles sketching the
 * comment-to-DM flow. "@thepropertyco" is the same kind of placeholder the
 * marketing mocks use, not a claim about an actual customer.
 */
function CommentToDmIllustration() {
  return (
    <div className="relative hidden aspect-[4/3] w-full max-w-md overflow-hidden rounded-2xl shadow-lg lg:block">
      <svg viewBox="0 0 400 300" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--accent-cyan)" />
            <stop offset="1" stopColor="var(--accent)" />
          </linearGradient>
        </defs>
        <rect width="400" height="300" fill="url(#sky)" />
        <rect y="215" width="400" height="85" fill="#000" opacity="0.08" />
        {/* tree */}
        <rect x="55" y="190" width="8" height="35" fill="#0F172A" opacity="0.35" />
        <circle cx="59" cy="180" r="22" fill="#0F172A" opacity="0.35" />
        {/* house */}
        <rect x="150" y="160" width="150" height="65" fill="#0F172A" opacity="0.85" />
        <polygon points="140,160 225,110 310,160" fill="#0F172A" opacity="0.9" />
        <rect x="212" y="120" width="14" height="20" fill="#0F172A" opacity="0.9" />
        <rect x="168" y="180" width="22" height="22" fill="#F8FAFC" opacity="0.9" />
        <rect x="260" y="180" width="22" height="22" fill="#F8FAFC" opacity="0.9" />
        <rect x="212" y="188" width="26" height="37" fill="#F8FAFC" opacity="0.9" />
      </svg>
      <div className="absolute left-4 top-5 flex max-w-[75%] items-center gap-2 rounded-xl bg-card px-3 py-2 shadow-lg">
        <span className="h-7 w-7 shrink-0 rounded-full bg-chip" />
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-ink">@thepropertyco</div>
          <div className="truncate text-xs text-subtle">This looks amazing! Price?</div>
        </div>
      </div>
      <div className="absolute bottom-5 right-4 max-w-[70%] rounded-xl bg-card px-3 py-2 text-xs font-medium text-ink shadow-lg">
        We'll send you details in DM! <span aria-hidden>👋</span>
      </div>
    </div>
  );
}

function MarketingColumn() {
  return (
    <div className="max-w-lg">
      <Logo size="md" />
      <h1 className="mt-8 text-4xl font-extrabold leading-tight text-ink">
        Turn Instagram enquiries into <span className="text-accent">qualified customers</span>
      </h1>
      <p className="mt-4 text-sm text-subtle">
        AI-powered Instagram automation: reply to comments and DMs, qualify leads, and hand over high-intent customers
        to your team.
      </p>
      <ul className="mt-8 list-none space-y-3 p-0">
        {CHECKLIST.map((item) => (
          <li key={item} className="flex items-center gap-3 text-sm text-ink">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-chip text-accent">
              ✓
            </span>
            {item}
          </li>
        ))}
      </ul>
      <div className="mt-10">
        <CommentToDmIllustration />
      </div>
    </div>
  );
}

/**
 * One shared, full-bleed background (no separate dark/light halves) with
 * the marketing content sitting directly on it and a compact floating card
 * for the auth step — matching the mock, which is a single page with an
 * elevated card, not a split screen.
 */
function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen" style={{ background: "var(--auth-gradient)" }}>
      {/* justify-center + a fixed gap (not justify-between inside a wide
          max-width) keeps the two columns adjacent at any viewport width —
          the outer margin grows on wide screens instead of the gap between
          them stretching into dead space. */}
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center gap-14 px-6 py-16 lg:flex-row lg:items-center">
        <MarketingColumn />
        <div className="w-full max-w-sm shrink-0">
          <div className="rounded-2xl border border-line bg-card p-8 shadow-[0_20px_60px_-15px_rgba(15,23,42,0.25)]">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Login is the app's entry point — Instagram connects from inside the dashboard afterward, not the other way around. A 6-digit email code, entered on this same page: no redirect, no leaving the tab. */
export function LoginPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"method" | "email" | "code">("method");
  const [unavailableProvider, setUnavailableProvider] = useState<SsoProvider | null>(null);
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

  function handleSsoClick(provider: SsoProvider) {
    setUnavailableProvider(provider);
  }

  if (step === "method") {
    return (
      <LoginLayout>
        <h1 className="m-0 text-center text-2xl font-bold text-ink">Welcome back</h1>
        <p className="mt-1 text-center text-sm text-subtle">Sign in to your account</p>

        <div className="mt-6 space-y-3">
          <SsoButton
            provider="google"
            icon={<GoogleIcon />}
            label="Continue with Google"
            unavailable={unavailableProvider === "google"}
            onClick={() => handleSsoClick("google")}
          />
          <SsoButton
            provider="meta"
            icon={<MetaIcon />}
            label="Continue with Meta"
            unavailable={unavailableProvider === "meta"}
            onClick={() => handleSsoClick("meta")}
          />
          <button
            type="button"
            onClick={() => setStep("email")}
            className="flex w-full items-center justify-center gap-3 rounded-[10px] border border-line bg-card px-4 py-[0.6rem] text-[0.95rem] font-semibold text-ink transition-colors hover:bg-chip"
          >
            <InboxIcon className="h-4 w-4" />
            Continue with Email
          </button>
        </div>

        <p className="mt-6 text-center text-xs text-subtle">
          By continuing, you agree to our <span className="text-accent">Terms &amp; Privacy Policy</span>.
        </p>

        <p className="mt-4 text-center text-sm text-subtle">
          New here?{" "}
          <button type="button" className="link-button font-medium text-accent" onClick={() => setStep("email")}>
            Create an account
          </button>
        </p>
      </LoginLayout>
    );
  }

  if (step === "code") {
    return (
      <LoginLayout>
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
          <button type="submit" className="btn-primary w-full" disabled={code.trim().length !== 6 || submitting}>
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
      </LoginLayout>
    );
  }

  return (
    <LoginLayout>
      <button
        type="button"
        onClick={() => setStep("method")}
        className="link-button mb-4 text-sm font-medium text-subtle hover:text-ink"
      >
        ← Back
      </button>
      <h1 className="m-0 text-2xl font-bold text-ink">Sign in with email</h1>
      <p className="mt-2 text-sm text-subtle">Enter your email to get a 6-digit sign-in code — no password to remember.</p>

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
    </LoginLayout>
  );
}
