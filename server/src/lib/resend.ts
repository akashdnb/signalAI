import { config } from "../config.js";

const RESEND_API_URL = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 8000;

/**
 * Identity Refactor U2. Deliberately excluded from `assertRequiredConfig`
 * (config.ts) — unlike every other setting checked there, this one has a
 * real, intentional escape hatch: logging the link to stdout instead of
 * emailing it. That's the "manual session-issue escape hatch for pilots"
 * the plan's own Risk table calls for, not an oversight, and it's what
 * keeps local dev/test working with zero Resend setup. It's deliberately
 * allowed in production too, for now: Render's logs are only visible to
 * the account owner, and pilot-stage sign-ins are that same person. This
 * stops being an acceptable substitute the moment a real user who isn't
 * also the log reader needs to sign in — configure RESEND_API_KEY before
 * that, not after.
 */
export async function sendMagicLinkEmail(email: string, verifyUrl: string): Promise<void> {
  if (!config.resendApiKey) {
    // eslint-disable-next-line no-console
    console.warn(`[magic-link] RESEND_API_KEY not configured — sign-in link for ${email}: ${verifyUrl}`);
    return;
  }

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.resendFromAddress,
      to: email,
      subject: "Sign in to signalAI",
      html: `<p>Click below to sign in. This link expires in 15 minutes and can only be used once.</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
    }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend send failed: ${res.status} ${body.slice(0, 200)}`);
  }
}
