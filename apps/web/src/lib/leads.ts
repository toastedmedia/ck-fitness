import "server-only";
import {
  cleanEmail,
  impliedUntil,
  isStage,
  stageAfterBooking,
  type CrmStage,
} from "@ck/core";
import { stopRunsForStage, triggerAutomations } from "@/lib/automations";
import type { createAdminSupabase } from "@/lib/supabase/admin";

type Db = ReturnType<typeof createAdminSupabase>;

/** Who may use Admin -> Leads and Admin -> Calendar. */
export const CRM_ROLES = ["owner", "admin", "coach"] as const;

export interface ContactRow {
  id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  source: string;
  stage: string;
  stage_changed_at: string;
  goal: string | null;
  utm: Record<string, string>;
  email_consent_at: string | null;
  implied_consent_until: string | null;
  unsubscribed_at: string | null;
  consent_note: string | null;
  external_id: string | null;
  created_at: string;
  last_activity_at: string;
}

export const contactName = (c: {
  first_name: string;
  last_name: string;
  email?: string | null;
}) => `${c.first_name} ${c.last_name}`.trim() || c.email || "No name";

/** The app account with this email, if there is one (so a lead can be linked to her member page). */
async function appUserId(db: Db, email: string): Promise<string | null> {
  const { data } = await db
    .from("profiles")
    .select("user_id")
    .ilike(
      "email",
      email.replace(/[%_\\]/g, (m) => `\\${m}`),
    )
    .limit(1)
    .maybeSingle();
  return (data?.user_id as string | undefined) ?? null;
}

/**
 * Finds the contact by email (any capitals) or creates it. Blank fields are filled in, nothing a
 * coach typed is overwritten. Returns the contact id and stage.
 */
export async function upsertContact(
  db: Db,
  input: {
    email: string | null;
    first_name?: string;
    last_name?: string;
    phone?: string;
    source?: string;
    goal?: string;
    utm?: Record<string, string>;
    consent?: boolean;
    /** They asked about our services (e.g. booked a consultation): CASL implied consent for 6 months. */
    enquiry?: boolean;
    created_by?: string | null;
  },
): Promise<{ id: string; stage: string } | null> {
  const email = input.email ? cleanEmail(input.email) : null;
  let existing: ContactRow | null = null;
  if (email) {
    const { data } = await db
      .from("crm_contacts")
      .select("*")
      .ilike(
        "email",
        email.replace(/[%_\\]/g, (m) => `\\${m}`),
      )
      .maybeSingle();
    existing = (data as ContactRow | null) ?? null;
  }
  const now = new Date().toISOString();
  if (existing) {
    const patch: Record<string, unknown> = { updated_at: now, last_activity_at: now };
    if (!existing.first_name && input.first_name) patch.first_name = input.first_name;
    if (!existing.last_name && input.last_name) patch.last_name = input.last_name;
    if (!existing.phone && input.phone) patch.phone = input.phone;
    if (!existing.goal && input.goal) patch.goal = input.goal;
    if (input.consent && !existing.email_consent_at) patch.email_consent_at = now;
    if (input.enquiry) {
      const until = impliedUntil(now, "enquiry");
      if (!existing.implied_consent_until || existing.implied_consent_until < until)
        patch.implied_consent_until = until;
    }
    if (!existing.user_id && email) {
      const uid = await appUserId(db, email);
      if (uid) patch.user_id = uid;
    }
    await db.from("crm_contacts").update(patch).eq("id", existing.id);
    return { id: existing.id, stage: existing.stage };
  }
  const user_id = email ? await appUserId(db, email) : null;
  const row = {
    email,
    first_name: (input.first_name ?? "").slice(0, 80),
    last_name: (input.last_name ?? "").slice(0, 80),
    phone: input.phone?.slice(0, 40) || null,
    source: input.source ?? "other",
    goal: input.goal?.slice(0, 1000) || null,
    utm: input.utm ?? {},
    email_consent_at: input.consent ? now : null,
    implied_consent_until: input.enquiry ? impliedUntil(now, "enquiry") : null,
    consent_note: input.consent ? 'Ticked "send me tips and offers" when booking' : null,
    created_by: input.created_by ?? null,
  };
  let { data, error } = await db
    .from("crm_contacts")
    .insert({ ...row, user_id })
    .select("id, stage")
    .single();
  // That app account is already linked to another contact: keep this one unlinked.
  if (error && user_id)
    ({ data, error } = await db
      .from("crm_contacts")
      .insert(row)
      .select("id, stage")
      .single());
  if (error || !data) {
    // Created a moment ago by another request: read it again.
    if (email) {
      const { data: again } = await db
        .from("crm_contacts")
        .select("id, stage")
        .ilike("email", email)
        .maybeSingle();
      if (again) return again as { id: string; stage: string };
    }
    console.error("crm contact failed", error?.message);
    return null;
  }
  await triggerAutomations(db, "new_lead", "", [data.id as string]);
  await triggerAutomations(db, "new_lead", row.source, [data.id as string]);
  return data as { id: string; stage: string };
}

/** Adds a tag to contacts and starts the automations that wait for that tag (only for new tags). */
export async function tagContacts(
  db: Db,
  tagId: string,
  contactIds: string[],
  automations = true,
) {
  if (!contactIds.length) return;
  const fresh: string[] = [];
  for (let i = 0; i < contactIds.length; i += 500) {
    const { data } = await db
      .from("crm_contact_tags")
      .upsert(
        contactIds.slice(i, i + 500).map((contact_id) => ({ contact_id, tag_id: tagId })),
        { onConflict: "contact_id,tag_id", ignoreDuplicates: true },
      )
      .select("contact_id");
    fresh.push(...((data ?? []) as { contact_id: string }[]).map((r) => r.contact_id));
  }
  if (automations) await triggerAutomations(db, "tag_added", tagId, fresh);
}

export async function untagContacts(db: Db, tagId: string, contactIds: string[]) {
  for (let i = 0; i < contactIds.length; i += 200)
    await db
      .from("crm_contact_tags")
      .delete()
      .eq("tag_id", tagId)
      .in("contact_id", contactIds.slice(i, i + 200));
}

export async function logActivity(
  db: Db,
  contactId: string,
  kind: string,
  body: string,
  by: string | null = null,
) {
  await db
    .from("crm_activities")
    .insert({ contact_id: contactId, kind, body: body.slice(0, 4000), created_by: by });
  await db
    .from("crm_contacts")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", contactId);
}

export async function setStage(
  db: Db,
  contactId: string,
  stage: string,
  by: string | null = null,
  note?: string,
): Promise<boolean> {
  if (!isStage(stage)) return false;
  const { data } = await db
    .from("crm_contacts")
    .select("stage")
    .eq("id", contactId)
    .maybeSingle();
  if (!data || data.stage === stage) return Boolean(data);
  const now = new Date().toISOString();
  await db
    .from("crm_contacts")
    .update({ stage, stage_changed_at: now, updated_at: now })
    .eq("id", contactId);
  await logActivity(db, contactId, "stage", note ?? `Moved to ${stage}`, by);
  await stopRunsForStage(db, contactId, stage);
  await triggerAutomations(db, "stage", stage, [contactId]);
  return true;
}

/** After a booking: move forward to Consult booked (never backwards). */
export async function stageForBooking(db: Db, contactId: string, current: string) {
  const next: CrmStage = stageAfterBooking(current);
  if (next !== current)
    await setStage(db, contactId, next, null, "Booked a consultation");
}

/** Reads every row of a query, 1000 at a time (the database hands out at most 1000 per request). */
export async function readAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
  max = 50000,
): Promise<{ rows: T[]; error: boolean }> {
  const rows: T[] = [];
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) return { rows, error: true };
    const list = (data ?? []) as T[];
    rows.push(...list);
    if (list.length < 1000) break;
  }
  return { rows, error: false };
}

/** A member finished signing up in the app: they appear in Leads too (source "App sign-up"). Never throws. */
export async function leadFromMember(db: Db, userId: string): Promise<void> {
  try {
    const { data: p } = await db
      .from("profiles")
      .select("first_name,last_name,email,phone")
      .eq("user_id", userId)
      .maybeSingle();
    if (!p?.email) return;
    const { data: linked } = await db
      .from("crm_contacts")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (linked) return;
    await upsertContact(db, {
      email: p.email as string,
      first_name: (p.first_name as string) ?? "",
      last_name: (p.last_name as string) ?? "",
      phone: (p.phone as string) ?? "",
      source: "app",
    });
  } catch (e) {
    console.error("lead from member failed", (e as Error).message);
  }
}
