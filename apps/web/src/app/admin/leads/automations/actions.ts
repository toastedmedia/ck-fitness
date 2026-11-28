"use server";

import { redirect } from "next/navigation";
import {
  AUTOMATION_TRIGGERS,
  CRM_SOURCES,
  CRM_STAGES,
  cleanSteps,
  isStage,
} from "@ck/core";
import { audit, requireStaff } from "@/lib/admin";
import { triggerAutomations } from "@/lib/automations";
import { CRM_ROLES, readAll } from "@/lib/leads";
import { sendRaw } from "@/lib/email/send";
import { renderCampaign } from "@ck/core";

const staff = () => requireStaff([...CRM_ROLES]);
const str = (f: FormData, k: string, max = 500) =>
  String(f.get(k) ?? "")
    .trim()
    .slice(0, max);

export async function saveAutomation(id: string, formData: FormData): Promise<void> {
  const { db, user, supabase } = await staff();
  const type = str(formData, "trigger_type", 20);
  if (!AUTOMATION_TRIGGERS.some((t) => t.key === type))
    redirect(`/admin/leads/automations/${id}?error=trigger`);
  const value =
    type === "tag_added"
      ? str(formData, "trigger_tag", 40)
      : type === "stage"
        ? str(formData, "trigger_stage", 40)
        : type === "new_lead"
          ? str(formData, "trigger_source", 40)
          : "";
  if (type === "tag_added" && !/^[0-9a-f-]{36}$/.test(value))
    redirect(`/admin/leads/automations/${id}?error=tag`);
  if (type === "stage" && !isStage(value))
    redirect(`/admin/leads/automations/${id}?error=stage`);
  if (type === "new_lead" && value && !CRM_SOURCES.some((s) => s.key === value))
    redirect(`/admin/leads/automations/${id}?error=trigger`);
  const steps = cleanSteps(
    Array.from({ length: 10 }, (_, i) => ({
      delay_days: Number(formData.get(`s${i}_delay`) ?? 0),
      subject: str(formData, `s${i}_subject`, 150),
      heading: str(formData, `s${i}_heading`, 150),
      body: str(formData, `s${i}_body`, 6000),
      cta_label: str(formData, `s${i}_cta_label`, 40),
      cta_url: str(formData, `s${i}_cta_url`, 500),
    })),
  );
  if (!steps.length) redirect(`/admin/leads/automations/${id}?error=steps`);
  const row = {
    name: str(formData, "name", 100) || "Untitled automation",
    active: formData.get("active") === "on",
    trigger_type: type,
    trigger_value: value,
    stop_stages: formData
      .getAll("stop_stage")
      .map(String)
      .filter((s) => CRM_STAGES.some((x) => x.key === s)),
    steps,
    updated_at: new Date().toISOString(),
  };
  let saved = id;
  if (id === "new") {
    const { data, error } = await db
      .from("crm_automations")
      .insert({ ...row, created_by: user.id })
      .select("id")
      .single();
    if (error || !data) redirect("/admin/leads/automations?error=save");
    saved = data.id as string;
  } else {
    const { error } = await db.from("crm_automations").update(row).eq("id", id);
    if (error) redirect(`/admin/leads/automations/${id}?error=save`);
  }
  await audit(supabase, user.id, "crm.automation_save", saved, { active: row.active });
  redirect(`/admin/leads/automations/${saved}?saved=1`);
}

export async function deleteAutomation(id: string): Promise<void> {
  const { db, user, supabase } = await staff();
  await db.from("crm_automations").delete().eq("id", id);
  await audit(supabase, user.id, "crm.automation_delete", id);
  redirect("/admin/leads/automations?deleted=1");
}

/** Put everyone who ALREADY has the trigger tag or stage into the series (it only catches new ones otherwise). */
export async function enrollExisting(id: string): Promise<void> {
  const { db } = await staff();
  const { data: a } = await db
    .from("crm_automations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!a || !a.active) redirect(`/admin/leads/automations/${id}?error=inactive`);
  let ids: string[] = [];
  if (a.trigger_type === "tag_added") {
    const { rows } = await readAll<{ contact_id: string }>((x, y) =>
      db
        .from("crm_contact_tags")
        .select("contact_id")
        .eq("tag_id", a.trigger_value)
        .order("contact_id")
        .range(x, y),
    );
    ids = rows.map((r) => r.contact_id);
  } else if (a.trigger_type === "stage") {
    const { rows } = await readAll<{ id: string }>((x, y) =>
      db
        .from("crm_contacts")
        .select("id")
        .eq("stage", a.trigger_value)
        .order("id")
        .range(x, y),
    );
    ids = rows.map((r) => r.id);
  }
  await triggerAutomations(db, a.trigger_type, a.trigger_value, ids);
  redirect(`/admin/leads/automations/${id}?enrolled=${ids.length}`);
}

/** Sends one step to the signed-in staff member, to check it. */
export async function testStep(id: string, step: number): Promise<void> {
  const { db, user } = await staff();
  const { data: a } = await db
    .from("crm_automations")
    .select("name, steps")
    .eq("id", id)
    .maybeSingle();
  const s = (a?.steps as ReturnType<typeof cleanSteps> | undefined)?.[step];
  if (!s || !user.email) redirect(`/admin/leads/automations/${id}?error=test`);
  const site = (
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://app.chardikalafitness.com"
  ).replace(/\/$/, "");
  const mail = renderCampaign(
    {
      subject: `[Test] ${s.subject}`,
      preheader: "",
      heading: s.heading || s.subject,
      body: s.body,
      imageUrl: null,
      ctaLabel: s.cta_label,
      ctaUrl: s.cta_url,
    },
    { name: "Priya" },
    {
      siteUrl: site,
      unsubscribeUrl: `${site}/unsubscribe-sample`,
      reason: "Test of an automation email.",
    },
  );
  const ok = await sendRaw({ to: user.email, ...mail });
  redirect(
    `/admin/leads/automations/${id}?${ok ? `test=${encodeURIComponent(user.email)}` : "error=test"}`,
  );
}
