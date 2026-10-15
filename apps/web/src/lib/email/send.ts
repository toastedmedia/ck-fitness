import "server-only";
import { ALWAYS_SENT, renderEmail, type EmailData, type EmailKey } from "@ck/core";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { signUnsubscribe } from "@/lib/email/token";

const FROM =
  process.env.EMAIL_FROM ?? "Chardikala Fitness <no-reply@chardikalafitness.com>";
const REPLY_TO = process.env.EMAIL_REPLY_TO ?? "support@chardikalafitness.com";
const siteUrl = () =>
  (process.env.NEXT_PUBLIC_SITE_URL ?? "https://app.chardikalafitness.com").replace(
    /\/$/,
    "",
  );

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/** Sends one email through Resend. Never throws: a failed email must not break the action that caused it. */
export async function sendRaw(m: {
  to: string;
  subject: string;
  html: string;
  text: string;
  unsubscribeUrl?: string;
}): Promise<boolean> {
  if (!emailConfigured()) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [m.to],
        reply_to: REPLY_TO,
        subject: m.subject,
        html: m.html,
        text: m.text,
        ...(m.unsubscribeUrl
          ? {
              headers: {
                "List-Unsubscribe": `<${m.unsubscribeUrl}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              },
            }
          : {}),
      }),
    });
    if (!res.ok)
      console.error("email failed", res.status, (await res.text()).slice(0, 200));
    return res.ok;
  } catch (e) {
    console.error("email failed", (e as Error).message);
    return false;
  }
}

/**
 * Sends one of our emails to a member, honouring her choices: billing and support emails are always sent;
 * the rest respect her Email switch and the matching reminder switch in Profile.
 */
export async function sendMemberEmail(
  userId: string,
  key: EmailKey,
  data: EmailData = {},
) {
  if (!emailConfigured()) return false;
  try {
    const db = createAdminSupabase();
    const [{ data: p }, { data: prefs }] = await Promise.all([
      db.from("profiles").select("email,first_name").eq("user_id", userId).maybeSingle(),
      db
        .from("notification_preferences")
        .select("email,workout,weekly_checkin")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
    if (!p?.email) return false;
    const always = ALWAYS_SENT.includes(key);
    if (!always) {
      if (prefs?.email === false) return false;
      if (key === "checkin_reminder" && prefs?.weekly_checkin === false) return false;
      if (key === "we_miss_you" && prefs?.workout === false) return false;
    }
    const unsubscribeUrl = always
      ? undefined
      : `${siteUrl()}/api/email/unsubscribe?t=${encodeURIComponent(signUnsubscribe(userId))}`;
    const e = renderEmail(
      key,
      { name: p.first_name ?? undefined, ...data },
      { siteUrl: siteUrl(), unsubscribeUrl },
    );
    return await sendRaw({
      to: p.email,
      subject: e.subject,
      html: e.html,
      text: e.text,
      unsubscribeUrl,
    });
  } catch (e) {
    console.error("sendMemberEmail failed", key, (e as Error).message);
    return false;
  }
}
