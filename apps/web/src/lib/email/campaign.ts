import "server-only";
import { renderCampaign, resolveMembership, type Campaign } from "@ck/core";
import { signUnsubscribe } from "@/lib/email/token";
import { emailConfigured } from "@/lib/email/send";
import type { createAdminSupabase } from "@/lib/supabase/admin";

type Db = ReturnType<typeof createAdminSupabase>;
export interface Audience {
  tag_id?: string;
  plan?: "all" | "free" | "member";
}
export interface CampaignRow {
  id: string;
  name: string;
  subject: string;
  preheader: string;
  heading: string;
  body: string;
  image_path: string | null;
  cta_label: string;
  cta_url: string;
  audience: Audience;
  status: "draft" | "sending" | "sent" | "cancelled";
  total: number;
  sent: number;
  failed: number;
  created_at: string;
  sent_at: string | null;
}

const FROM = () =>
  process.env.EMAIL_FROM ?? "Chardikala Fitness <no-reply@chardikalafitness.com>";
const REPLY_TO = () => process.env.EMAIL_REPLY_TO ?? "support@chardikalafitness.com";
export const siteBase = () =>
  (process.env.NEXT_PUBLIC_SITE_URL ?? "https://app.chardikalafitness.com").replace(
    /\/$/,
    "",
  );
export const imageUrlOf = (path: string | null) =>
  path && process.env.NEXT_PUBLIC_SUPABASE_URL
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/program-thumbnails/${path}`
    : null;
export const toCampaign = (r: CampaignRow): Campaign => ({
  subject: r.subject,
  preheader: r.preheader,
  heading: r.heading,
  body: r.body,
  imageUrl: imageUrlOf(r.image_path),
  ctaLabel: r.cta_label,
  ctaUrl: r.cta_url,
});

/** Only members who turned on Offers and news AND email can receive marketing. Then the optional filters. */
export async function audienceUserIds(db: Db, a: Audience): Promise<string[]> {
  const { data: prefs } = await db
    .from("notification_preferences")
    .select("user_id")
    .eq("marketing", true)
    .eq("email", true)
    .limit(50000);
  let ids = ((prefs ?? []) as { user_id: string }[]).map((p) => p.user_id);
  if (a.tag_id) {
    const { data: tm } = await db
      .from("member_tag_map")
      .select("user_id")
      .eq("tag_id", a.tag_id)
      .limit(50000);
    const tagged = new Set(((tm ?? []) as { user_id: string }[]).map((x) => x.user_id));
    ids = ids.filter((i) => tagged.has(i));
  }
  if (a.plan === "free" || a.plan === "member") {
    const { data: ms } = await db
      .from("memberships")
      .select("user_id,entitlement,status,period_end,cancel_at_period_end")
      .limit(50000);
    const paid = new Set(
      (
        (ms ?? []) as {
          user_id: string;
          entitlement: string;
          status: string;
          period_end: string | null;
          cancel_at_period_end: boolean;
        }[]
      )
        .filter((m) => resolveMembership(m).entitlement !== "free")
        .map((m) => m.user_id),
    );
    ids = ids.filter((i) => (a.plan === "member" ? paid.has(i) : !paid.has(i)));
  }
  // Must have an email address.
  const withEmail: string[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await db
      .from("profiles")
      .select("user_id,email")
      .in("user_id", ids.slice(i, i + 500));
    for (const p of (data ?? []) as { user_id: string; email: string | null }[])
      if (p.email) withEmail.push(p.user_id);
  }
  return withEmail;
}

/** Snapshots the audience into the send list and marks the campaign as sending. */
export async function startCampaign(db: Db, c: CampaignRow): Promise<number> {
  const ids = await audienceUserIds(db, c.audience);
  for (let i = 0; i < ids.length; i += 500)
    await db.from("email_campaign_sends").upsert(
      ids
        .slice(i, i + 500)
        .map((user_id) => ({ campaign_id: c.id, user_id, status: "pending" })),
      { onConflict: "campaign_id,user_id", ignoreDuplicates: true },
    );
  await db
    .from("email_campaigns")
    .update({
      status: ids.length ? "sending" : "sent",
      total: ids.length,
      sent_at: ids.length ? null : new Date().toISOString(),
    })
    .eq("id", c.id);
  return ids.length;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Sends up to `limit` pending emails for one campaign (in batches of 90). Safe to call again and again. */
export async function processCampaign(
  db: Db,
  id: string,
  limit = 270,
): Promise<{ sent: number; left: number }> {
  if (!emailConfigured()) return { sent: 0, left: -1 };
  const { data: row } = await db
    .from("email_campaigns")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  const c = row as CampaignRow | null;
  if (!c || c.status !== "sending") return { sent: 0, left: 0 };
  const campaign = toCampaign(c);
  let done = 0;
  while (done < limit) {
    const { data: pend } = await db
      .from("email_campaign_sends")
      .select("user_id")
      .eq("campaign_id", id)
      .eq("status", "pending")
      .limit(90);
    const ids = ((pend ?? []) as { user_id: string }[]).map((p) => p.user_id);
    if (!ids.length) break;
    const { data: profs } = await db
      .from("profiles")
      .select("user_id,email,first_name")
      .in("user_id", ids);
    const byId = new Map(
      (
        (profs ?? []) as {
          user_id: string;
          email: string | null;
          first_name: string | null;
        }[]
      ).map((p) => [p.user_id, p]),
    );
    const messages = ids.flatMap((uid) => {
      const p = byId.get(uid);
      if (!p?.email) return [];
      const unsub = `${siteBase()}/api/email/unsubscribe?c=marketing&t=${encodeURIComponent(signUnsubscribe(uid))}`;
      const e = renderCampaign(
        campaign,
        { name: p.first_name ?? undefined },
        { siteUrl: siteBase(), unsubscribeUrl: unsub },
      );
      return [
        {
          uid,
          msg: {
            from: FROM(),
            to: [p.email],
            reply_to: REPLY_TO(),
            subject: e.subject,
            html: e.html,
            text: e.text,
            headers: {
              "List-Unsubscribe": `<${unsub}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          },
        },
      ];
    });
    const sentIds = new Set<string>();
    let error = "";
    if (messages.length) {
      try {
        const res = await fetch("https://api.resend.com/emails/batch", {
          method: "POST",
          headers: {
            authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(messages.map((m) => m.msg)),
        });
        if (res.ok) messages.forEach((m) => sentIds.add(m.uid));
        else error = `Resend ${res.status}: ${(await res.text()).slice(0, 150)}`;
      } catch (e) {
        error = (e as Error).message.slice(0, 150);
      }
    }
    const now = new Date().toISOString();
    for (const uid of ids) {
      const ok = sentIds.has(uid);
      await db
        .from("email_campaign_sends")
        .update({
          status: ok ? "sent" : "failed",
          error: ok ? null : error || "No email address",
          sent_at: ok ? now : null,
        })
        .eq("campaign_id", id)
        .eq("user_id", uid);
    }
    done += ids.length;
    await sleep(600);
  }
  const count = async (status: string) =>
    (
      await db
        .from("email_campaign_sends")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", id)
        .eq("status", status)
    ).count ?? 0;
  const [sent, failed, left] = await Promise.all([
    count("sent"),
    count("failed"),
    count("pending"),
  ]);
  await db
    .from("email_campaigns")
    .update({
      sent,
      failed,
      ...(left === 0 ? { status: "sent", sent_at: new Date().toISOString() } : {}),
    })
    .eq("id", id);
  return { sent: done, left };
}
