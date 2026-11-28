import "server-only";
import {
  leadEmailable,
  nextStepAt,
  renderCampaign,
  type AutomationStep,
  type AutomationTrigger,
} from "@ck/core";
import { signLeadUnsubscribe } from "@/lib/email/token";
import { sendRaw } from "@/lib/email/send";
import type { createAdminSupabase } from "@/lib/supabase/admin";

type Db = ReturnType<typeof createAdminSupabase>;

export interface AutomationRow {
  id: string;
  name: string;
  active: boolean;
  trigger_type: AutomationTrigger;
  trigger_value: string;
  stop_stages: string[];
  steps: AutomationStep[];
  created_at: string;
  updated_at: string;
}

const APP = () =>
  (process.env.NEXT_PUBLIC_SITE_URL ?? "https://app.chardikalafitness.com").replace(
    /\/$/,
    "",
  );

export const leadUnsubscribeUrl = (contactId: string) =>
  `${APP()}/api/email/unsubscribe?c=lead&t=${encodeURIComponent(signLeadUnsubscribe(contactId))}`;

export const LEAD_EMAIL_REASON =
  "You are getting this because you contacted or trained with Chardikala Fitness & Performance.";

/**
 * Something happened to these leads: start every active automation that listens for it. Each lead
 * enters an automation once (a second tag add does not restart it). Never throws.
 */
export async function triggerAutomations(
  db: Db,
  type: AutomationTrigger,
  value: string,
  contactIds: string[],
): Promise<void> {
  if (!contactIds.length) return;
  try {
    const { data } = await db
      .from("crm_automations")
      .select("id, trigger_value, steps")
      .eq("active", true)
      .eq("trigger_type", type);
    const now = new Date();
    for (const a of (data ?? []) as Pick<
      AutomationRow,
      "id" | "trigger_value" | "steps"
    >[]) {
      if (a.trigger_value && a.trigger_value !== value) continue;
      const next = nextStepAt(a.steps ?? [], 0, now);
      if (!next) continue;
      for (let i = 0; i < contactIds.length; i += 500)
        await db.from("crm_automation_runs").upsert(
          contactIds.slice(i, i + 500).map((contact_id) => ({
            automation_id: a.id,
            contact_id,
            step: 0,
            next_at: next,
          })),
          { onConflict: "automation_id,contact_id", ignoreDuplicates: true },
        );
    }
  } catch (e) {
    console.error("automation trigger failed", (e as Error).message);
  }
}

/** A lead reached a stage: stop the series that end at that stage. */
export async function stopRunsForStage(db: Db, contactId: string, stage: string) {
  const { data } = await db
    .from("crm_automations")
    .select("id, stop_stages")
    .contains("stop_stages", [stage]);
  const ids = ((data ?? []) as { id: string }[]).map((a) => a.id);
  if (ids.length)
    await db
      .from("crm_automation_runs")
      .update({
        status: "stopped",
        stop_reason: `Reached ${stage}`,
        updated_at: new Date().toISOString(),
      })
      .eq("contact_id", contactId)
      .eq("status", "active")
      .in("automation_id", ids);
}

/** Cron: sends the automation emails that are due. Claims each step first so it never sends twice. */
export async function processAutomations(db: Db, limit = 200) {
  const now = new Date();
  const { data: due, error } = await db
    .from("crm_automation_runs")
    .select("automation_id, contact_id, step")
    .eq("status", "active")
    .lte("next_at", now.toISOString())
    .order("next_at")
    .limit(limit);
  if (error) return { sent: 0, skipped: "not ready (0037)" };
  const autos = new Map<string, AutomationRow>();
  let sent = 0;
  for (const r of (due ?? []) as {
    automation_id: string;
    contact_id: string;
    step: number;
  }[]) {
    let a = autos.get(r.automation_id);
    if (!a) {
      const { data } = await db
        .from("crm_automations")
        .select("*")
        .eq("id", r.automation_id)
        .maybeSingle();
      if (!data) continue;
      a = data as AutomationRow;
      autos.set(a.id, a);
    }
    const key = { automation_id: r.automation_id, contact_id: r.contact_id };
    const stop = async (reason: string) =>
      db
        .from("crm_automation_runs")
        .update({ status: "stopped", stop_reason: reason, updated_at: now.toISOString() })
        .match(key);
    if (!a.active) {
      await stop("Automation switched off");
      continue;
    }
    const step = a.steps?.[r.step];
    // Claim: move to the next step before sending.
    const next = nextStepAt(a.steps ?? [], r.step + 1, now);
    const { data: claimed } = await db
      .from("crm_automation_runs")
      .update({
        step: r.step + 1,
        next_at: next,
        status: next ? "active" : "done",
        updated_at: now.toISOString(),
      })
      .match({ ...key, step: r.step, status: "active" })
      .select("contact_id");
    if (!claimed?.length || !step) continue;
    const { data: c } = await db
      .from("crm_contacts")
      .select(
        "id, first_name, email, stage, email_consent_at, implied_consent_until, unsubscribed_at",
      )
      .eq("id", r.contact_id)
      .maybeSingle();
    if (!c) continue;
    if ((a.stop_stages ?? []).includes(c.stage as string)) {
      await stop(`Reached ${c.stage}`);
      continue;
    }
    if (!leadEmailable(c as Parameters<typeof leadEmailable>[0], now)) {
      await stop(c.unsubscribed_at ? "Unsubscribed" : "No email permission");
      continue;
    }
    const unsub = leadUnsubscribeUrl(c.id as string);
    const mail = renderCampaign(
      {
        subject: step.subject,
        preheader: "",
        heading: step.heading || step.subject,
        body: step.body,
        imageUrl: null,
        ctaLabel: step.cta_label,
        ctaUrl: step.cta_url,
      },
      { name: (c.first_name as string) || undefined },
      { siteUrl: APP(), unsubscribeUrl: unsub, reason: LEAD_EMAIL_REASON },
    );
    const ok = await sendRaw({ to: c.email as string, ...mail, unsubscribeUrl: unsub });
    await db.from("crm_activities").insert({
      contact_id: c.id,
      kind: "sent",
      body: `${ok ? "Email sent" : "Email FAILED"} (automation "${a.name}", step ${r.step + 1}): ${step.subject}`,
    });
    if (ok) sent++;
  }
  return { sent };
}
