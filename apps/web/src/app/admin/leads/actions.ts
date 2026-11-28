"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  ACTIVITY_KINDS,
  CRM_SOURCES,
  CRM_STAGES,
  cleanEmail,
  impliedUntil,
  isStage,
  normalizePhone,
} from "@ck/core";
import { audit, requireStaff } from "@/lib/admin";
import {
  CRM_ROLES,
  logActivity,
  setStage,
  tagContacts,
  untagContacts,
  upsertContact,
} from "@/lib/leads";
import { ensureTag } from "@/lib/member-tags";

const staff = () => requireStaff([...CRM_ROLES]);
const str = (f: FormData, k: string, max = 500) =>
  String(f.get(k) ?? "")
    .trim()
    .slice(0, max);
const back = (f: FormData, fallback: string) => {
  const b = str(f, "back", 300);
  return /^\/admin\/(leads|calendar)(\/|\?|$)/.test(b) ? b : fallback;
};

export async function createContact(formData: FormData): Promise<void> {
  const { db, user, supabase } = await staff();
  const rawEmail = str(formData, "email", 200);
  const email = rawEmail ? cleanEmail(rawEmail) : null;
  if (rawEmail && !email) redirect("/admin/leads?error=email");
  const first = str(formData, "first_name", 80);
  if (!first && !email) redirect("/admin/leads?error=name");
  const source = str(formData, "source", 40);
  const c = await upsertContact(db, {
    email,
    first_name: first,
    last_name: str(formData, "last_name", 80),
    phone: normalizePhone(str(formData, "phone", 40)) ?? "",
    goal: str(formData, "goal", 1000),
    source: CRM_SOURCES.some((s) => s.key === source) ? source : "other",
    created_by: user.id,
  });
  if (!c) redirect("/admin/leads?error=save");
  const note = str(formData, "note", 4000);
  if (note) await logActivity(db, c.id, "note", note, user.id);
  const permission = str(formData, "permission", 20);
  if (email && ["express", "enquiry", "customer"].includes(permission)) {
    const now = new Date().toISOString();
    await db
      .from("crm_contacts")
      .update(
        permission === "express"
          ? {
              email_consent_at: now,
              consent_note: "Agreed to get our emails (added by the team)",
            }
          : {
              implied_consent_until: impliedUntil(
                now,
                permission === "customer" ? "customer" : "enquiry",
              ),
              consent_note:
                permission === "customer"
                  ? "Client of the studio"
                  : "Asked about our services",
            },
      )
      .eq("id", c.id);
  }
  await audit(supabase, user.id, "crm.contact_create", c.id);
  redirect(`/admin/leads/${c.id}?saved=1`);
}

export async function updateContact(id: string, formData: FormData): Promise<void> {
  const { db, user } = await staff();
  const rawEmail = str(formData, "email", 200);
  const email = rawEmail ? cleanEmail(rawEmail) : null;
  if (rawEmail && !email) redirect(`/admin/leads/${id}?error=email`);
  const source = str(formData, "source", 40);
  const { error } = await db
    .from("crm_contacts")
    .update({
      first_name: str(formData, "first_name", 80),
      last_name: str(formData, "last_name", 80),
      email,
      phone:
        normalizePhone(str(formData, "phone", 40)) || str(formData, "phone", 40) || null,
      goal: str(formData, "goal", 1000) || null,
      ...(CRM_SOURCES.some((s) => s.key === source) ? { source } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error)
    redirect(`/admin/leads/${id}?error=${error.code === "23505" ? "duplicate" : "save"}`);
  await logActivity(db, id, "edit", "Details updated", user.id);
  redirect(`/admin/leads/${id}?saved=1`);
}

export async function changeStage(id: string, formData: FormData): Promise<void> {
  const { db, user } = await staff();
  const stage = str(formData, "stage", 40);
  if (isStage(stage)) await setStage(db, id, stage, user.id);
  revalidatePath("/admin/leads");
  redirect(back(formData, `/admin/leads/${id}`));
}

export async function addContactTag(id: string, formData: FormData): Promise<void> {
  const { db, user } = await staff();
  const tagId = await ensureTag(db, str(formData, "tag", 60), user.id);
  if (tagId)
    await db
      .from("crm_contact_tags")
      .upsert(
        { contact_id: id, tag_id: tagId },
        { onConflict: "contact_id,tag_id", ignoreDuplicates: true },
      );
  redirect(`/admin/leads/${id}`);
}

export async function removeContactTag(id: string, tagId: string): Promise<void> {
  const { db } = await staff();
  await untagContacts(db, tagId, [id]);
  redirect(`/admin/leads/${id}`);
}

export async function addActivity(id: string, formData: FormData): Promise<void> {
  const { db, user } = await staff();
  const body = str(formData, "body", 4000);
  const kind = str(formData, "kind", 20);
  if (body)
    await logActivity(
      db,
      id,
      ACTIVITY_KINDS.some((k) => k.key === kind) ? kind : "note",
      body,
      user.id,
    );
  // Contacting a new lead moves it to Contacted.
  if (body && kind !== "note") {
    const { data } = await db
      .from("crm_contacts")
      .select("stage")
      .eq("id", id)
      .maybeSingle();
    if (data?.stage === "new") await setStage(db, id, "contacted", user.id);
  }
  redirect(`/admin/leads/${id}`);
}

export async function deleteActivity(id: string, activityId: string): Promise<void> {
  const { db } = await staff();
  await db.from("crm_activities").delete().eq("id", activityId).eq("contact_id", id);
  redirect(`/admin/leads/${id}`);
}

export async function addTask(id: string, formData: FormData): Promise<void> {
  const { db, user } = await staff();
  const title = str(formData, "title", 200);
  const due = str(formData, "due", 20);
  if (title)
    await db.from("crm_tasks").insert({
      contact_id: id,
      title,
      due_at: /^\d{4}-\d{2}-\d{2}$/.test(due) ? `${due}T17:00:00Z` : null,
      created_by: user.id,
      assigned_to: user.id,
    });
  redirect(`/admin/leads/${id}`);
}

export async function toggleTask(
  id: string,
  taskId: string,
  done: boolean,
  formData?: FormData,
): Promise<void> {
  const { db } = await staff();
  await db
    .from("crm_tasks")
    .update({ done_at: done ? new Date().toISOString() : null })
    .eq("id", taskId);
  redirect(formData ? back(formData, `/admin/leads/${id}`) : `/admin/leads/${id}`);
}

export async function deleteContact(id: string, formData: FormData): Promise<void> {
  const { db, user, supabase } = await staff();
  if (str(formData, "confirm", 10) !== "DELETE")
    redirect(`/admin/leads/${id}?error=confirm`);
  await db.from("crm_contacts").delete().eq("id", id);
  await audit(supabase, user.id, "crm.contact_delete", id);
  redirect("/admin/leads?deleted=1");
}

/** Leads list: add or remove a tag, or move a stage, for the ticked people or everyone in the filter. */
export async function bulkLeads(formData: FormData): Promise<void> {
  const { db, user, supabase } = await staff();
  const backTo = back(formData, "/admin/leads?view=list");
  const uuid = /^[0-9a-f-]{36}$/;
  const ids = (
    str(formData, "scope", 10) === "all"
      ? str(formData, "all_ids", 200000).split(",")
      : formData.getAll("ids").map(String)
  ).filter((x) => uuid.test(x));
  const op = str(formData, "op", 20);
  const value = str(formData, "value", 60);
  if (!ids.length || !value) redirect(`${backTo}&bulk=0`);
  if (op === "stage") {
    const stage = CRM_STAGES.find(
      (s) => s.key === value || s.label.toLowerCase() === value.toLowerCase(),
    )?.key;
    if (!stage) redirect(`${backTo}&bulk=0`);
    for (const id of ids) await setStage(db, id, stage, user.id);
  } else if (op === "remove_tag") {
    const { data: t } = await db
      .from("member_tags")
      .select("id")
      .ilike("name", value)
      .maybeSingle();
    if (t) await untagContacts(db, t.id as string, ids);
  } else {
    const tagId = await ensureTag(db, value, user.id);
    if (tagId) await tagContacts(db, tagId, ids);
  }
  await audit(supabase, user.id, `crm.bulk_${op}`, value, { count: ids.length });
  revalidatePath("/admin/leads");
  redirect(`${backTo}&bulk=${ids.length}`);
}

/** Record or remove email permission for one lead (CASL), with a note on how it was given. */
export async function setEmailPermission(id: string, formData: FormData): Promise<void> {
  const { db, user } = await staff();
  const choice = str(formData, "permission", 20);
  const note = str(formData, "note", 200);
  const now = new Date().toISOString();
  const patch: Record<string, unknown> =
    choice === "express"
      ? {
          email_consent_at: now,
          unsubscribed_at: null,
          consent_note: note || "Agreed to get our emails (recorded by the team)",
        }
      : choice === "enquiry"
        ? {
            implied_consent_until: impliedUntil(now, "enquiry"),
            consent_note: note || "Asked about our services",
          }
        : choice === "customer"
          ? {
              implied_consent_until: impliedUntil(now, "customer"),
              consent_note: note || "Client of the studio",
            }
          : { unsubscribed_at: now };
  await db
    .from("crm_contacts")
    .update({ ...patch, updated_at: now })
    .eq("id", id);
  if (choice === "unsubscribe")
    await db
      .from("crm_automation_runs")
      .update({ status: "stopped", stop_reason: "Unsubscribed", updated_at: now })
      .eq("contact_id", id)
      .eq("status", "active");
  await logActivity(
    db,
    id,
    "edit",
    choice === "unsubscribe"
      ? "Unsubscribed from emails (by the team)"
      : `Email permission recorded: ${String(patch.consent_note)}`,
    user.id,
  );
  redirect(`/admin/leads/${id}?saved=1`);
}

export async function stopAutomationRun(id: string, automationId: string): Promise<void> {
  const { db } = await staff();
  await db
    .from("crm_automation_runs")
    .update({
      status: "stopped",
      stop_reason: "Stopped by the team",
      updated_at: new Date().toISOString(),
    })
    .eq("contact_id", id)
    .eq("automation_id", automationId);
  redirect(`/admin/leads/${id}`);
}
