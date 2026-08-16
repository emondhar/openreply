/**
 * Transactional email.
 *
 * Auth already sends magic links through Resend via the next-auth provider
 * (lib/auth.ts), so the credentials exist. This is the same API reached
 * directly, for mail the auth layer doesn't cover.
 *
 * Everything here fails soft. These are notifications about campaigns, not part
 * of any user's request — a Resend outage must never turn into a failed save or
 * a crashed worker job.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface SendEmailInput {
  to: string[];
  subject: string;
  html: string;
  text?: string;
}

/** True when the deployment has email configured at all. */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/** Send one email. Resolves false on any failure; never throws. */
export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const recipients = [...new Set(input.to.filter(Boolean))];

  if (!apiKey || !from) {
    console.warn("[Email] RESEND_API_KEY / EMAIL_FROM not set — skipping send");
    return false;
  }
  if (recipients.length === 0) return false;

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: recipients,
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
      }),
    });

    if (!res.ok) {
      console.error(`[Email] Resend ${res.status}: ${await res.text().catch(() => "")}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[Email] Send failed:", error);
    return false;
  }
}

/** Minimal escaping for values interpolated into an email body. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
