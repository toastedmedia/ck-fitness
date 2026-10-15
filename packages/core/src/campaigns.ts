/** Marketing emails written in the admin. Pure functions so the preview and the real send are identical. */
export interface Campaign {
  subject: string;
  preheader: string;
  heading: string;
  body: string;
  imageUrl?: string | null;
  ctaLabel: string;
  ctaUrl: string;
}
export type Block = { type: "p"; text: string } | { type: "ul"; items: string[] };

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Blank line = new paragraph. Lines that start with "- " become a bullet list. */
export function campaignBlocks(body: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of body.replace(/\r/g, "").split(/\n{2,}/)) {
    const lines = chunk
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) continue;
    if (lines.every((l) => l.startsWith("- "))) {
      blocks.push({ type: "ul", items: lines.map((l) => l.slice(2).trim()) });
    } else blocks.push({ type: "p", text: lines.join(" ") });
  }
  return blocks;
}

/** A button link must be https, or a path inside the app. Anything else (like javascript:) is dropped. */
export function safeCtaUrl(url: string, siteUrl: string): string | null {
  const u = url.trim();
  if (!u) return null;
  if (u.startsWith("/") && !u.startsWith("//"))
    return `${siteUrl.replace(/\/$/, "")}${u}`;
  return /^https:\/\/[^\s]+$/i.test(u) ? u : null;
}

const fill = (s: string, name: string) => s.replace(/\{\{\s*name\s*\}\}/gi, name);

export function renderCampaign(
  c: Campaign,
  data: { name?: string },
  opts: { siteUrl: string; unsubscribeUrl?: string },
): { subject: string; html: string; text: string } {
  const name = (data.name ?? "").trim() || "there";
  const url = c.ctaLabel.trim() ? safeCtaUrl(c.ctaUrl, opts.siteUrl) : null;
  const blocks = campaignBlocks(c.body);
  const body = blocks
    .map((b) =>
      b.type === "p"
        ? `<p style="margin:0 0 16px">${esc(fill(b.text, name))}</p>`
        : `<ul style="margin:0 0 16px;padding-left:20px">${b.items.map((i) => `<li style="margin:0 0 6px">${esc(fill(i, name))}</li>`).join("")}</ul>`,
    )
    .join("");
  const img =
    c.imageUrl && /^https:\/\//.test(c.imageUrl)
      ? `<tr><td><img src="${esc(c.imageUrl)}" alt="" width="480" style="display:block;width:100%;height:auto;border:0" /></td></tr>`
      : "";
  const cta = url
    ? `<p style="margin:0 0 20px"><a href="${esc(url)}" style="display:inline-block;background:#c8a84b;color:#1b1b36;text-decoration:none;font-weight:bold;padding:14px 26px;border-radius:999px">${esc(c.ctaLabel.trim())}</a></p>`
    : "";
  const unsub = opts.unsubscribeUrl
    ? `<br />You are getting this because you chose to receive offers and news. <a href="${esc(opts.unsubscribeUrl)}" style="color:#5b6075">Unsubscribe</a>`
    : "";
  const html = `<!doctype html><html><body style="margin:0"><span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(fill(c.preheader, name))}</span>
<div style="background:#f3f4f9;padding:24px 12px;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden">
<tr><td style="background:#1b1b36;padding:20px 24px"><div style="color:#c8a84b;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:bold">Chardikala Fitness &amp; Performance</div><div style="color:#ffffff;font-size:22px;font-weight:bold;margin-top:4px">Chardikala Fitness</div></td></tr>
${img}
<tr><td style="padding:24px;color:#1b1b36;font-size:15px;line-height:1.55">${c.heading.trim() ? `<h1 style="margin:0 0 12px;font-size:20px">${esc(fill(c.heading, name))}</h1>` : ""}${body}${cta}</td></tr>
<tr><td style="padding:14px 24px;border-top:1px solid #dfe2ec;color:#5b6075;font-size:12px;line-height:1.5">Chardikala Fitness &amp; Performance, Surrey, British Columbia, Canada. Questions? Reply to this email.${unsub}</td></tr>
</table></div></body></html>`;
  const text = [
    c.heading.trim() ? fill(c.heading, name) : "",
    "",
    ...blocks.map((b) =>
      b.type === "p"
        ? fill(b.text, name)
        : b.items.map((i) => `- ${fill(i, name)}`).join("\n"),
    ),
    ...(url ? ["", `${c.ctaLabel.trim()}: ${url}`] : []),
    "",
    "Chardikala Fitness & Performance, Surrey, British Columbia, Canada.",
    ...(opts.unsubscribeUrl ? [`Unsubscribe: ${opts.unsubscribeUrl}`] : []),
  ].join("\n");
  return { subject: fill(c.subject, name), html, text };
}

/** Starting points for the Create email screen. Words in [square brackets] are for you to replace. */
export const CAMPAIGN_PRESETS: {
  key: string;
  label: string;
  subject: string;
  preheader: string;
  heading: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
}[] = [
  {
    key: "diet",
    label: "Diet plan",
    subject: "{{name}}, your simple eating plan is here",
    preheader: "Easy meals that fit around your training.",
    heading: "Eat well without the stress",
    body: "Hi {{name}}, training works best when your eating supports it. We put together a simple plan you can actually follow.\n\n- [Meal idea or benefit 1]\n- [Meal idea or benefit 2]\n- [Meal idea or benefit 3]\n\nYou do not need to be perfect. Start with one change this week.",
    ctaLabel: "Get the plan",
    ctaUrl: "/programs",
  },
  {
    key: "promo",
    label: "Limited-time promo",
    subject: "{{name}}, this week only: [your offer]",
    preheader: "A limited-time offer for our members.",
    heading: "[Your offer], this week only",
    body: "Hi {{name}}, for a short time we are offering [describe the offer clearly: what you get, the price or discount, and the end date].\n\nIf you have been thinking about it, this is a great moment to start.\n\nOffer ends [date].",
    ctaLabel: "See the offer",
    ctaUrl: "https://chardikalafitness.com",
  },
  {
    key: "winter",
    label: "Winter offer",
    subject: "Stay strong this winter, {{name}}",
    preheader: "Keep your routine going when it gets cold.",
    heading: "Winter is for building strength",
    body: "Hi {{name}}, shorter days make it easy to skip training. That is exactly why a plan helps.\n\n- [Winter benefit or offer 1]\n- [Winter benefit or offer 2]\n\n[Add any winter offer details and the end date here.]",
    ctaLabel: "Keep going",
    ctaUrl: "/home",
  },
  {
    key: "training",
    label: "New training",
    subject: "New training: [name of the training]",
    preheader: "A new training is ready for you.",
    heading: "New: [name of the training]",
    body: "Hi {{name}}, a new training just landed.\n\n[Two or three sentences about who it is for and what they will do.]",
    ctaLabel: "Take a look",
    ctaUrl: "/programs",
  },
  {
    key: "news",
    label: "News or motivation",
    subject: "A note from Chardikala Fitness",
    preheader: "A short update from your coaches.",
    heading: "A quick note from us",
    body: "Hi {{name}},\n\n[Write your message here. Keep it short and warm.]\n\nWith care,\nThe Chardikala Fitness team",
    ctaLabel: "",
    ctaUrl: "",
  },
];
