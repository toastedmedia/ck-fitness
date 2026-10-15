/** Branded account and accountability emails. Pure functions, so every email is testable and previewable. */
export type EmailKey =
  | "welcome"
  | "checkin_reminder"
  | "we_miss_you"
  | "membership_welcome"
  | "payment_problem"
  | "membership_ended"
  | "support_received"
  | "support_replied";

export interface EmailData {
  name?: string;
}
export interface RenderOptions {
  siteUrl: string;
  /** When set, the email shows a one-click "turn these emails off" link (optional emails only). */
  unsubscribeUrl?: string;
}
export interface RenderedEmail {
  subject: string;
  preheader: string;
  html: string;
  text: string;
}

/** Emails that are always sent (billing and support). Everything else follows her notification choices. */
export const ALWAYS_SENT: EmailKey[] = [
  "membership_welcome",
  "payment_problem",
  "membership_ended",
  "support_received",
  "support_replied",
];

export const EMAIL_LABELS: Record<EmailKey, string> = {
  welcome: "Welcome (after onboarding)",
  checkin_reminder: "Weekly check-in reminder",
  we_miss_you: "We miss you (quiet for a few days)",
  membership_welcome: "Membership started",
  payment_problem: "Payment problem",
  membership_ended: "Membership ended",
  support_received: "Support: we received your question",
  support_replied: "Support: we have replied",
};

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

interface Spec {
  subject: (n: string) => string;
  preheader: string;
  heading: (n: string) => string;
  paragraphs: string[];
  cta?: { label: string; path: string };
  closing?: string;
}

const SPECS: Record<EmailKey, Spec> = {
  welcome: {
    subject: (n) => `Welcome to Chardikala Fitness, ${n}`,
    preheader: "Your account is ready. Here is the easiest way to start.",
    heading: (n) => `Welcome, ${n}`,
    paragraphs: [
      "Your account is ready. The easiest way to start is small: open your first training and do one short session.",
      "Each day you can log your water and steps and do a 15-second check-in. Once a week you do a one-minute check-in, and your coach can see how you are doing if you chose to share it. You can change that in Profile at any time.",
    ],
    cta: { label: "Open the app", path: "/home" },
    closing: "Questions? Just reply to this email.",
  },
  checkin_reminder: {
    subject: () => "Your weekly check-in is ready",
    preheader: "One minute to reflect and plan your next week.",
    heading: (n) => `${n}, how was your week?`,
    paragraphs: [
      "Your weekly check-in is ready. It takes about a minute and helps you plan next week.",
    ],
    cta: { label: "Do my weekly check-in", path: "/accountability/checkin" },
  },
  we_miss_you: {
    subject: (n) => `${n}, pick up where you left off`,
    preheader: "One short session is a great restart.",
    heading: (n) => `We saved your spot, ${n}`,
    paragraphs: [
      "It has been a few days. That is completely okay. Life happens, and one short session is a great way to restart.",
      "If something is getting in the way, tell us and we will help you find a plan that fits.",
    ],
    cta: { label: "Start a short session", path: "/home" },
  },
  membership_welcome: {
    subject: () => "Welcome to Chardikala Fitness membership",
    preheader: "Your full training library is unlocked.",
    heading: (n) => `Thank you, ${n}`,
    paragraphs: [
      "Your membership is active and the full training library is unlocked. Your progress is saved, so you can pick up right where you are.",
    ],
    cta: { label: "Open my trainings", path: "/programs" },
  },
  payment_problem: {
    subject: () => "There is a problem with your payment",
    preheader: "Please update your card to keep your access.",
    heading: () => "We could not take your last payment",
    paragraphs: [
      "Your access stays on for 3 days while we try again. To avoid any interruption, please update your card.",
      "If your card was updated or the payment went through, you can ignore this email.",
    ],
    cta: { label: "Update my payment method", path: "/membership" },
  },
  membership_ended: {
    subject: () => "Your membership has ended",
    preheader: "You can rejoin any time. Your progress is saved.",
    heading: () => "Your membership has ended",
    paragraphs: [
      "Your account, your progress and the free trainings are still here. You can rejoin any time and pick up where you left off.",
    ],
    cta: { label: "Rejoin", path: "/membership" },
  },
  support_received: {
    subject: () => "We have received your question",
    preheader: "A real person will get back to you soon.",
    heading: (n) => `Thanks, ${n}`,
    paragraphs: [
      "We have received your message and a real person from Chardikala Fitness will reply as soon as we can. There is nothing else you need to do.",
      "For anything urgent about your health, please contact a health professional.",
    ],
  },
  support_replied: {
    subject: () => "Chardikala Fitness has replied to your question",
    preheader: "Open the app to read the reply.",
    heading: () => "We have replied",
    paragraphs: [
      "Our team has replied to your question. For your privacy we do not put the reply in this email, so please open the app to read it.",
    ],
    cta: { label: "Read the reply", path: "/accountability/help" },
  },
};

const BTN =
  "display:inline-block;background:#c8a84b;color:#1b1b36;text-decoration:none;font-weight:bold;padding:14px 26px;border-radius:999px";

export function renderEmail(
  key: EmailKey,
  data: EmailData,
  opts: RenderOptions,
): RenderedEmail {
  const spec = SPECS[key];
  const name = (data.name ?? "").trim() || "there";
  const site = opts.siteUrl.replace(/\/$/, "");
  const url = spec.cta ? `${site}${spec.cta.path}` : null;
  const paras = spec.paragraphs
    .map((p) => `<p style="margin:0 0 16px">${esc(p)}</p>`)
    .join("");
  const cta = spec.cta
    ? `<p style="margin:0 0 20px"><a href="${esc(url as string)}" style="${BTN}">${esc(spec.cta.label)}</a></p>`
    : "";
  const closing = spec.closing
    ? `<p style="margin:0;color:#5b6075;font-size:13px">${esc(spec.closing)}</p>`
    : "";
  const unsub = opts.unsubscribeUrl
    ? `<br /><a href="${esc(opts.unsubscribeUrl)}" style="color:#5b6075">Turn these emails off</a>. You can also change this any time in Profile.`
    : "";
  const html = `<!doctype html><html><body style="margin:0"><span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(spec.preheader)}</span>
<div style="background:#f3f4f9;padding:24px 12px;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden">
<tr><td style="background:#1b1b36;padding:20px 24px"><div style="color:#c8a84b;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:bold">Chardikala Fitness &amp; Performance</div><div style="color:#ffffff;font-size:22px;font-weight:bold;margin-top:4px">Chardikala Fitness</div></td></tr>
<tr><td style="padding:24px;color:#1b1b36;font-size:15px;line-height:1.55"><h1 style="margin:0 0 12px;font-size:20px">${esc(spec.heading(name))}</h1>${paras}${cta}${closing}</td></tr>
<tr><td style="padding:14px 24px;border-top:1px solid #dfe2ec;color:#5b6075;font-size:12px;line-height:1.5">Chardikala Fitness &amp; Performance, Surrey, British Columbia, Canada. Need help? Reply to this email or visit app.chardikalafitness.com/support${unsub}</td></tr>
</table></div></body></html>`;
  const text = [
    spec.heading(name),
    "",
    ...spec.paragraphs,
    ...(spec.cta ? ["", `${spec.cta.label}: ${url}`] : []),
    ...(spec.closing ? ["", spec.closing] : []),
    "",
    "Chardikala Fitness & Performance, Surrey, British Columbia, Canada.",
    ...(opts.unsubscribeUrl ? [`Turn these emails off: ${opts.unsubscribeUrl}`] : []),
  ].join("\n");
  return { subject: spec.subject(name), preheader: spec.preheader, html, text };
}
