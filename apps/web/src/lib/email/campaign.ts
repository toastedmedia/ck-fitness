import "server-only";
import {
  canAccess,
  leadEmailable,
  renderCampaign,
  resolveMembership,
  type AccessLevel,
  type Campaign,
} from "@ck/core";
import { signUnsubscribe } from "@/lib/email/token";
import { LEAD_EMAIL_REASON, leadUnsubscribeUrl } from "@/lib/automations";
import { readAll } from "@/lib/leads";
import { emailConfigured } from "@/lib/email/send";
import type { createAdminSupabase } from "@/lib/supabase/admin";

type Db = ReturnType<typeof createAdminSupabase>;
export interface Audience {
  /** "leads" = CRM contacts (Admin -> Leads) chosen by tag and stage; default = app members. */
  kind?: "members" | "leads";
  /** Leads: has ANY of these tags (empty = every lead). */
  lead_tags?: string[];
  /** Leads: leave out anyone with one of these tags. */
  lead_exclude?: string[];
  /** Leads: only these stages (empty = all). */
  lead_stages?: string[];
  tag_id?: string;
  plan?: "all" | "free" | "member";
  /** Training announcement: the training it is about (Admin -> training -> Emails). */
  training?: string;
  /** Announcement only to the people given that training one at a time. */
  given_only?: boolean;
  /**
   * Which permission the email relies on: "news" = members who keep "New trainings and content"
   * on (most members); "offers" (default for older emails) = only members who turned on Offers and news.
   */
  consent?: "news" | "offers";
  /** Only people who can open this training (free, their plan, or given to them). */
  has_training?: string;
  /** Only people who can NOT open this training. */
  lacks_training?: string;
}

/** True when the email relies on the "New trainings and content" switch rather than Offers and news. */
export const usesNewsConsent = (a: Audience) =>
  Boolean(a.training) || a.consent === "news";
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

/**
 * Marketing: only members who turned on Offers and news AND email. A training announcement
 * (audience.training) instead needs Email and "New trainings and content" on, and only members who
 * signed up and accepted the terms themselves (imported people are never emailed). Then the filters.
 */
export async function audienceUserIds(db: Db, a: Audience): Promise<string[]> {
  const { data: prefs } = await db
    .from("notification_preferences")
    .select("user_id")
    .eq(usesNewsConsent(a) ? "new_content" : "marketing", true)
    .eq("email", true)
    .limit(50000);
  let ids = ((prefs ?? []) as { user_id: string }[]).map((p) => p.user_id);
  if (a.training && a.given_only) {
    const { data: g } = await db
      .from("program_grants")
      .select("user_id")
      .eq("program_id", a.training)
      .limit(50000);
    const given = new Set(((g ?? []) as { user_id: string }[]).map((x) => x.user_id));
    ids = ids.filter((i) => given.has(i));
  }
  if (a.tag_id) {
    const { data: tm } = await db
      .from("member_tag_map")
      .select("user_id")
      .eq("tag_id", a.tag_id)
      .limit(50000);
    const tagged = new Set(((tm ?? []) as { user_id: string }[]).map((x) => x.user_id));
    ids = ids.filter((i) => tagged.has(i));
  }
  const trainingId = a.has_training || a.lacks_training;
  if (trainingId && ids.length) {
    const { data: prog } = await db
      .from("programs")
      .select("*")
      .eq("id", trainingId)
      .maybeSingle();
    if (!prog) ids = [];
    else {
      const [{ data: ms }, { data: gs }] = await Promise.all([
        db
          .from("memberships")
          .select("user_id,entitlement,status,period_end,cancel_at_period_end")
          .limit(50000),
        db
          .from("program_grants")
          .select("user_id")
          .eq("program_id", trainingId)
          .limit(50000),
      ]);
      const ent = new Map(
        (
          (ms ?? []) as {
            user_id: string;
            entitlement: string;
            status: string;
            period_end: string | null;
            cancel_at_period_end: boolean;
          }[]
        ).map((m) => [m.user_id, resolveMembership(m).entitlement]),
      );
      const given = new Set(((gs ?? []) as { user_id: string }[]).map((g) => g.user_id));
      const opens = (uid: string) =>
        canAccess(
          {
            entitlement: ent.get(uid) ?? "free",
            staffRoles: [],
            programGrants: given.has(uid) ? [trainingId] : [],
          },
          prog.access_level as AccessLevel,
          trainingId,
          prog.members_included !== false,
        );
      ids = ids.filter((i) => (a.has_training ? opens(i) : !opens(i)));
    }
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
      .select("user_id,email,terms_accepted_at")
      .in("user_id", ids.slice(i, i + 500));
    for (const p of (data ?? []) as {
      user_id: string;
      email: string | null;
      terms_accepted_at: string | null;
    }[])
      if (p.email && (!usesNewsConsent(a) || p.terms_accepted_at))
        withEmail.push(p.user_id);
  }
  return withEmail;
}

export const isLeadAudience = (a: Audience | null | undefined) => a?.kind === "leads";

interface LeadPick {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  stage: string;
  user_id: string | null;
  email_consent_at: string | null;
  implied_consent_until: string | null;
  unsubscribed_at: string | null;
}

/**
 * Leads an email may go to: chosen tags/stages, minus excluded tags, and only people we may email
 * (permission recorded, not unsubscribed; linked app members who turned email or offers off are left out).
 */
export async function audienceLeads(db: Db, a: Audience): Promise<LeadPick[]> {
  const { rows } = await readAll<LeadPick>((x, y) =>
    db
      .from("crm_contacts")
      .select(
        "id,first_name,last_name,email,stage,user_id,email_consent_at,implied_consent_until,unsubscribed_at",
      )
      .not("email", "is", null)
      .order("id")
      .range(x, y),
  );
  const tagSet = async (ids: string[]) => {
    if (!ids.length) return null;
    const { rows: m } = await readAll<{ contact_id: string }>((x, y) =>
      db
        .from("crm_contact_tags")
        .select("contact_id")
        .in("tag_id", ids)
        .order("contact_id")
        .range(x, y),
    );
    return new Set(m.map((r) => r.contact_id));
  };
  const want = await tagSet(a.lead_tags ?? []);
  const skip = await tagSet(a.lead_exclude ?? []);
  const stages = a.lead_stages ?? [];
  const now = new Date();
  let list = rows.filter(
    (c) =>
      leadEmailable(c, now) &&
      (!want || want.has(c.id)) &&
      (!skip || !skip.has(c.id)) &&
      (!stages.length || stages.includes(c.stage)),
  );
  const members = list.map((c) => c.user_id).filter(Boolean) as string[];
  if (members.length) {
    const off = new Set<string>();
    for (let i = 0; i < members.length; i += 500) {
      const { data } = await db
        .from("notification_preferences")
        .select("user_id,email,marketing")
        .in("user_id", members.slice(i, i + 500));
      for (const p of (data ?? []) as {
        user_id: string;
        email: boolean;
        marketing: boolean;
      }[])
        if (!p.email || !p.marketing) off.add(p.user_id);
    }
    list = list.filter((c) => !c.user_id || !off.has(c.user_id));
  }
  return list;
}

/** Snapshots the audience into the send list and marks the campaign as sending. */
export async function startCampaign(db: Db, c: CampaignRow): Promise<number> {
  if (isLeadAudience(c.audience)) {
    const leads = await audienceLeads(db, c.audience);
    for (let i = 0; i < leads.length; i += 500)
      await db.from("crm_campaign_sends").upsert(
        leads
          .slice(i, i + 500)
          .map((l) => ({ campaign_id: c.id, contact_id: l.id, status: "pending" })),
        { onConflict: "campaign_id,contact_id", ignoreDuplicates: true },
      );
    await db
      .from("email_campaigns")
      .update({
        status: leads.length ? "sending" : "sent",
        total: leads.length,
        sent_at: leads.length ? null : new Date().toISOString(),
      })
      .eq("id", c.id);
    return leads.length;
  }
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
  if (isLeadAudience(c.audience)) return processLeadCampaign(db, c, limit);
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
      const training = usesNewsConsent(c.audience ?? {});
      const unsub = `${siteBase()}/api/email/unsubscribe?c=${training ? "content" : "marketing"}&t=${encodeURIComponent(signUnsubscribe(uid))}`;
      const e = renderCampaign(
        campaign,
        { name: p.first_name ?? undefined },
        {
          siteUrl: siteBase(),
          unsubscribeUrl: unsub,
          reason: training
            ? "You are getting this because you get news about trainings and the app."
            : undefined,
        },
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

/** Names and emails of who an audience reaches (for the "See who" list), first 300. */
export async function audiencePeople(
  db: Db,
  a: Audience,
): Promise<{ total: number; people: { name: string; email: string }[] }> {
  if (isLeadAudience(a)) {
    const leads = await audienceLeads(db, a);
    return {
      total: leads.length,
      people: leads
        .slice(0, 300)
        .map((l) => ({
          name: `${l.first_name} ${l.last_name}`.trim() || "(no name)",
          email: l.email ?? "",
        }))
        .sort((x, y) => x.name.localeCompare(y.name)),
    };
  }
  const ids = await audienceUserIds(db, a);
  const people: { name: string; email: string }[] = [];
  for (let i = 0; i < Math.min(ids.length, 300); i += 300) {
    const { data } = await db
      .from("profiles")
      .select("first_name,last_name,email")
      .in("user_id", ids.slice(i, i + 300));
    for (const p of (data ?? []) as {
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    }[])
      people.push({
        name: [p.first_name, p.last_name].filter(Boolean).join(" ") || "(no name)",
        email: p.email ?? "",
      });
  }
  people.sort((x, y) => x.name.localeCompare(y.name));
  return { total: ids.length, people };
}

/** Sends up to `limit` pending emails of a leads campaign (batches of 90). Logs each on the lead. */
async function processLeadCampaign(
  db: Db,
  c: CampaignRow,
  limit: number,
): Promise<{ sent: number; left: number }> {
  const campaign = toCampaign(c);
  let done = 0;
  while (done < limit) {
    const { data: pend } = await db
      .from("crm_campaign_sends")
      .select("contact_id")
      .eq("campaign_id", c.id)
      .eq("status", "pending")
      .limit(90);
    const ids = ((pend ?? []) as { contact_id: string }[]).map((p) => p.contact_id);
    if (!ids.length) break;
    const { data: people } = await db
      .from("crm_contacts")
      .select(
        "id,first_name,email,email_consent_at,implied_consent_until,unsubscribed_at",
      )
      .in("id", ids);
    const byId = new Map(
      (
        (people ?? []) as (Parameters<typeof leadEmailable>[0] & {
          id: string;
          first_name: string;
        })[]
      ).map((p) => [p.id, p]),
    );
    const now = new Date();
    const messages = ids.flatMap((id) => {
      const p = byId.get(id);
      // Permission is checked again at send time (someone may have unsubscribed since).
      if (!p || !leadEmailable(p, now)) return [];
      const unsub = leadUnsubscribeUrl(id);
      const e = renderCampaign(
        campaign,
        { name: p.first_name || undefined },
        { siteUrl: siteBase(), unsubscribeUrl: unsub, reason: LEAD_EMAIL_REASON },
      );
      return [
        {
          id,
          msg: {
            from: FROM(),
            to: [p.email!],
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
        if (res.ok) messages.forEach((m) => sentIds.add(m.id));
        else error = `Resend ${res.status}: ${(await res.text()).slice(0, 150)}`;
      } catch (e) {
        error = (e as Error).message.slice(0, 150);
      }
    }
    const at = new Date().toISOString();
    for (const id of ids) {
      const ok = sentIds.has(id);
      const allowed = messages.some((m) => m.id === id);
      await db
        .from("crm_campaign_sends")
        .update({
          status: ok ? "sent" : allowed ? "failed" : "skipped",
          error: ok ? null : allowed ? error : "No permission or unsubscribed",
          sent_at: ok ? at : null,
        })
        .eq("campaign_id", c.id)
        .eq("contact_id", id);
    }
    if (sentIds.size)
      await db.from("crm_activities").insert(
        [...sentIds].map((contact_id) => ({
          contact_id,
          kind: "sent",
          body: `Email sent (campaign "${c.name}"): ${c.subject}`,
        })),
      );
    done += ids.length;
    await sleep(600);
  }
  const count = async (status: string) =>
    (
      await db
        .from("crm_campaign_sends")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", c.id)
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
    .eq("id", c.id);
  return { sent: done, left };
}
