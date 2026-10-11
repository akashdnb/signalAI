import { config } from "../config.js";

const RESEND_API_URL = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 8000;

export async function sendTenantInvitationEmail(
  email: string,
  tenantName: string,
  inviterEmail: string,
  inviteUrl: string,
): Promise<void> {
  if (!config.resendApiKey) {
    // eslint-disable-next-line no-console
    console.warn(`[workspace-invite] RESEND_API_KEY not configured — invitation for ${email}: ${inviteUrl}`);
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
      subject: `${inviterEmail} invited you to ${tenantName} on signalAI`,
      html: `<p>${inviterEmail} invited you to join <strong>${tenantName}</strong> on signalAI.</p><p><a href="${inviteUrl}">Accept invitation</a></p><p>This invitation expires in 7 days and can only be used once.</p>`,
    }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Invitation email failed: ${res.status} ${body.slice(0, 200)}`);
  }
}
