import { config } from "../config.js";

const RESEND_API_URL = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 8000;

/**
 * Identity Refactor U2. Deliberately excluded from `assertRequiredConfig`
 * (config.ts) — unlike every other setting checked there, this one has a
 * real, intentional escape hatch: logging the code to stdout instead of
 * emailing it. That's the "manual session-issue escape hatch for pilots"
 * the plan's own Risk table calls for, not an oversight, and it's what
 * keeps local dev/test working with zero Resend setup. It's deliberately
 * allowed in production too, for now: Render's logs are only visible to
 * the account owner, and pilot-stage sign-ins are that same person. This
 * stops being an acceptable substitute the moment a real user who isn't
 * also the log reader needs to sign in — configure RESEND_API_KEY before
 * that, not after.
 *
 * The fallback log also fires when Resend is CONFIGURED but the send still
 * fails (observed live: Resend's shared sandbox sender 403s with
 * "You can only send testing emails to your own email address" for every
 * recipient but the account owner, until a custom domain is verified) —
 * `RESEND_API_KEY` being set does not mean the code actually went anywhere,
 * and the caller (authEmail.ts) already treats a thrown error here as
 * "log and fail closed to the generic response", which used to mean the
 * code was gone for good instead of merely not emailed.
 */
export async function sendOtpEmail(email: string, code: string): Promise<void> {
  if (!config.resendApiKey) {
    // eslint-disable-next-line no-console
    console.warn(`[email-otp] RESEND_API_KEY not configured — sign-in code for ${email}: ${code}`);
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
      subject: "Your signalAI sign-in code",
      html: `<p>Your sign-in code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:4px;">${code}</p><p>It expires in 10 minutes and can only be used once.</p>`,
    }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text();
    // eslint-disable-next-line no-console
    console.warn(`[email-otp] Resend send failed for ${email} — sign-in code was: ${code}`);
    throw new Error(`Resend send failed: ${res.status} ${body.slice(0, 200)}`);
  }
}
