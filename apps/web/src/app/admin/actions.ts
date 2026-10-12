"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  audienceMatches,
  canManageRole,
  resolveMembership,
  validateForPublish,
  STAFF_ROLES,
  type AudienceKey,
} from "@ck/core";
import { CONTENT, OPS, SUPPORT, audit, requireStaff } from "@/lib/admin";
import { processCrmQueue } from "@/lib/crm";
import { notifyUser } from "@/lib/events";
import { isInternalPath } from "@/lib/same-origin";

const str = (f: FormData, k: string, max = 500) =>
  String(f.get(k) ?? "")
    .trim()
    .slice(0, max);
const int = (f: FormData, k: string, d = 0) => {
  const n = parseInt(String(f.get(k) ?? ""), 10);
  return Number.isFinite(n) ? n : d;
};
const slugify = (t: string) =>
  t
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "program";
const LEVELS = ["free", "member", "premium_preview", "coach_only", "hidden"];

/* ------------------------------------------------------------------ programs */
export async function createProgram(formData: FormData): Promise<void> {
  const { supabase, user } = await requireStaff(CONTENT);
  const title = str(formData, "title", 120);
  if (!title) redirect("/admin/programs?error=title");
  let slug = slugify(title);
  const { data: clash } = await supabase
    .from("programs")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (clash) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  const { data, error } = await supabase
    .from("programs")
    .insert({ slug, title, access_level: "member", published: false })
    .select("id")
    .single();
  if (error || !data) redirect("/admin/programs?error=save");
  await audit(supabase, user.id, "program.create", data.id, { title });
  redirect(`/admin/programs/${data.id}`);
}

export async function updateProgram(id: string, formData: FormData): Promise<void> {
  const { supabase, user } = await requireStaff(CONTENT);
  const level = str(formData, "access_level");
  const patch: Record<string, unknown> = {
    title: str(formData, "title", 120),
    short_description: str(formData, "short_description", 200),
    long_description: str(formData, "long_description", 4000),
    access_level: LEVELS.includes(level) ? level : "member",
    level: str(formData, "level") || null,
    duration_label: str(formData, "duration_label", 40) || null,
    featured: formData.get("featured") === "on",
    sort_order: int(formData, "sort_order"),
  };
  const slug = slugify(str(formData, "slug", 80));
  if (slug) patch.slug = slug;

  const file = formData.get("cover");
  if (file instanceof File && file.size > 0) {
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 2_097_152
    )
      redirect(`/admin/programs/${id}?error=cover`);
    const ext =
      file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("program-thumbnails")
      .upload(path, file, { contentType: file.type });
    if (error) redirect(`/admin/programs/${id}?error=cover`);
    patch.cover_path = path;
  }
  const { error } = await supabase.from("programs").update(patch).eq("id", id);
  if (error) redirect(`/admin/programs/${id}?error=save`);

  const tagIds = formData.getAll("tags").map(String);
  await supabase.from("program_tag_map").delete().eq("program_id", id);
  if (tagIds.length)
    await supabase
      .from("program_tag_map")
      .insert(tagIds.map((tag_id) => ({ program_id: id, tag_id })));
  await audit(supabase, user.id, "program.update", id, {
    access_level: patch.access_level,
  });
  revalidatePath("/programs");
  redirect(`/admin/programs/${id}?saved=1`);
}

export async function addSection(programId: string, formData: FormData): Promise<void> {
  const { supabase, user } = await requireStaff(CONTENT);
  const title = str(formData, "title", 120);
  if (!title) redirect(`/admin/programs/${programId}?error=section`);
  const { data: last } = await supabase
    .from("program_sections")
    .select("order_index")
    .eq("program_id", programId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  const type = ["phase", "week", "module"].includes(str(formData, "section_type"))
    ? str(formData, "section_type")
    : "week";
  await supabase.from("program_sections").insert({
    program_id: programId,
    title,
    section_type: type,
    order_index: (last?.order_index ?? 0) + 1,
  });
  await audit(supabase, user.id, "section.add", programId, { title });
  redirect(`/admin/programs/${programId}?saved=1`);
}

export async function updateSection(
  programId: string,
  sectionId: string,
  formData: FormData,
): Promise<void> {
  const { supabase, user } = await requireStaff(CONTENT);
  await supabase
    .from("program_sections")
    .update({
      title: str(formData, "title", 120),
      order_index: int(formData, "order_index"),
      published: formData.get("published") === "on",
    })
    .eq("id", sectionId);
  await audit(supabase, user.id, "section.update", sectionId);
  redirect(`/admin/programs/${programId}?saved=1`);
}

export async function deleteSection(programId: string, sectionId: string): Promise<void> {
  const { supabase, user } = await requireStaff(CONTENT);
  await supabase.from("program_sections").delete().eq("id", sectionId);
  await audit(supabase, user.id, "section.delete", sectionId);
  redirect(`/admin/programs/${programId}?saved=1`);
}

/** Creates or updates a lesson. Pass lessonId "new" with a section id to create. */
export async function saveLesson(
  programId: string,
  sectionId: string,
  lessonId: string,
  formData: FormData,
): Promise<void> {
  const { supabase, user } = await requireStaff(CONTENT);
  const override = str(formData, "access_override");
  const row: Record<string, unknown> = {
    section_id: sectionId,
    title: str(formData, "title", 120),
    content_type: str(formData, "content_type") || "workout",
    summary: str(formData, "summary", 300),
    instructions: str(formData, "instructions", 4000),
    equipment: str(formData, "equipment", 120),
    safety_notes: str(formData, "safety_notes", 600),
    duration_minutes: int(formData, "duration_minutes") || null,
    stream_uid: str(formData, "stream_uid", 80) || null,
    access_override: LEVELS.includes(override) ? override : null,
    order_index: int(formData, "order_index"),
    published: formData.get("published") === "on",
  };
  if (!row.title) redirect(`/admin/programs/${programId}?error=lesson`);
  let id = lessonId;
  if (lessonId === "new") {
    const { data, error } = await supabase
      .from("lessons")
      .insert(row)
      .select("id")
      .single();
    if (error || !data) redirect(`/admin/programs/${programId}?error=save`);
    id = data.id;
  } else {
    const { error } = await supabase.from("lessons").update(row).eq("id", lessonId);
    if (error) redirect(`/admin/programs/${programId}?error=save`);
  }
  const file = formData.get("resource");
  if (file instanceof File && file.size > 0) {
    if (
      !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 20_971_520
    )
      redirect(`/admin/programs/${programId}?error=resource`);
    const path = `${id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error } = await supabase.storage
      .from("program-resources")
      .upload(path, file, { contentType: file.type });
    if (error) redirect(`/admin/programs/${programId}?error=resource`);
    await supabase.from("lessons").update({ resource_path: path }).eq("id", id);
  }
  await audit(
    supabase,
    user.id,
    lessonId === "new" ? "lesson.create" : "lesson.update",
    id,
    { title: row.title },
  );
  revalidatePath("/programs");
  redirect(`/admin/programs/${programId}?saved=1`);
}

export async function duplicateLesson(
  programId: string,
  lessonId: string,
): Promise<void> {
  const { supabase, user } = await requireStaff(CONTENT);
  const { data: l } = await supabase
    .from("lessons")
    .select("*")
    .eq("id", lessonId)
    .maybeSingle();
  if (l) {
    const { id: _id, ...rest } = l;
    void _id;
    await supabase.from("lessons").insert({
      ...rest,
      title: `${l.title} (copy)`,
      order_index: l.order_index + 1,
      published: false,
    });
    await audit(supabase, user.id, "lesson.duplicate", lessonId);
  }
  redirect(`/admin/programs/${programId}?saved=1`);
}

export async function deleteLesson(programId: string, lessonId: string): Promise<void> {
  const { supabase, user } = await requireStaff(CONTENT);
  await supabase.from("lessons").delete().eq("id", lessonId);
  await audit(supabase, user.id, "lesson.delete", lessonId);
  redirect(`/admin/programs/${programId}?saved=1`);
}

export async function publishProgram(id: string, formData: FormData): Promise<void> {
  const { supabase, user, db } = await requireStaff(CONTENT);
  const { data: p } = await supabase
    .from("programs")
    .select("title,short_description,access_level,level,duration_label,slug")
    .eq("id", id)
    .maybeSingle();
  if (!p) redirect("/admin/programs");
  const { data: sections } = await supabase
    .from("program_sections")
    .select("id,title")
    .eq("program_id", id);
  const { data: lessons } = await supabase
    .from("lessons")
    .select("title,section_id,stream_uid,instructions,published")
    .in(
      "section_id",
      (sections ?? []).map((s: { id: string }) => s.id),
    );
  const problems = validateForPublish({
    program: p,
    sections: sections ?? [],
    lessons: lessons ?? [],
  });
  if (problems.length)
    redirect(`/admin/programs/${id}?problems=${encodeURIComponent(problems.join("|"))}`);

  await supabase
    .from("programs")
    .update({
      published: true,
      published_at: new Date().toISOString(),
      published_by: user.id,
    })
    .eq("id", id);
  await audit(supabase, user.id, "program.publish", id, { title: p.title });

  if (formData.get("notify") === "on" && p.access_level !== "hidden") {
    const { data: prefs } = await db
      .from("notification_preferences")
      .select("user_id")
      .eq("new_content", true);
    const rows = ((prefs ?? []) as { user_id: string }[]).map((u) => ({
      user_id: u.user_id,
      kind: "content",
      title: `New program: ${p.title}`,
      body: p.short_description,
      link: `/programs/${p.slug}`,
      dedupe_key: `program:${id}`,
    }));
    for (let i = 0; i < rows.length; i += 500)
      await db.from("notifications").upsert(rows.slice(i, i + 500), {
        onConflict: "user_id,dedupe_key",
        ignoreDuplicates: true,
      });
  }
  revalidatePath("/programs");
  redirect(`/admin/programs/${id}?published=1`);
}

export async function unpublishProgram(id: string): Promise<void> {
  const { supabase, user } = await requireStaff(CONTENT);
  await supabase.from("programs").update({ published: false }).eq("id", id);
  await audit(supabase, user.id, "program.unpublish", id);
  revalidatePath("/programs");
  redirect(`/admin/programs/${id}?unpublished=1`);
}

/* --------------------------------------------------------------------- users */
export async function setMembership(userId: string, formData: FormData): Promise<void> {
  const { supabase, user, db } = await requireStaff(OPS);
  const choice = str(formData, "entitlement");
  const { data: existing } = await db
    .from("memberships")
    .select("provider")
    .eq("user_id", userId)
    .maybeSingle();
  if (choice === "none") {
    if (existing?.provider === "manual")
      await db.from("memberships").delete().eq("user_id", userId);
  } else if (choice === "ck_member" || choice === "ck_premium") {
    if (existing && existing.provider !== "manual")
      redirect(`/admin/users/${userId}?error=stripe`);
    await db.from("memberships").upsert(
      {
        user_id: userId,
        provider: "manual",
        source: "manual",
        entitlement: choice,
        status: "active",
        period_end: null,
        cancel_at_period_end: false,
        started_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  }
  await audit(supabase, user.id, "membership.manual", userId, { choice });
  redirect(`/admin/users/${userId}?saved=1`);
}

export async function setStaffRole(
  userId: string,
  role: string,
  grant: boolean,
): Promise<void> {
  const { supabase, user, roles, db } = await requireStaff(OPS);
  if (!STAFF_ROLES.includes(role as never) || !canManageRole(roles, role))
    redirect(`/admin/users/${userId}?error=role`);
  if (!grant && role === "owner") {
    const { count } = await db
      .from("staff_roles")
      .select("*", { count: "exact", head: true })
      .eq("role", "owner")
      .eq("active", true);
    if ((count ?? 0) <= 1) redirect(`/admin/users/${userId}?error=lastowner`);
  }
  if (grant)
    await db
      .from("staff_roles")
      .upsert({ user_id: userId, role, active: true }, { onConflict: "user_id,role" });
  else await db.from("staff_roles").delete().eq("user_id", userId).eq("role", role);
  await audit(supabase, user.id, grant ? "role.grant" : "role.revoke", userId, { role });
  redirect(`/admin/users/${userId}?saved=1`);
}

/* ------------------------------------------------------------------- support */
export async function updateSupportRequest(
  id: string,
  formData: FormData,
): Promise<void> {
  const { supabase, user, db } = await requireStaff(SUPPORT);
  const status = ["open", "in_progress", "resolved"].includes(str(formData, "status"))
    ? str(formData, "status")
    : "open";
  const reply = str(formData, "reply", 2000);
  const patch: Record<string, unknown> = { status };
  if (formData.get("assign") === "on") patch.assigned_to = user.id;
  if (reply)
    Object.assign(patch, {
      staff_reply: reply,
      replied_at: new Date().toISOString(),
      replied_by: user.id,
    });
  const { data: row } = await supabase
    .from("support_requests")
    .update(patch)
    .eq("id", id)
    .select("user_id")
    .maybeSingle();
  if (reply && row?.user_id)
    await notifyUser(row.user_id, {
      kind: "support",
      title: "CK replied to your message",
      body: reply.slice(0, 120),
      link: "/accountability/help",
    });
  void db;
  redirect("/admin/support?saved=1");
}

/* ------------------------------------------------------------- announcements */
export async function sendAnnouncement(formData: FormData): Promise<void> {
  const { supabase, user, db } = await requireStaff(OPS);
  const title = str(formData, "title", 100),
    body = str(formData, "body", 400),
    link = str(formData, "link", 200);
  const audience = (
    ["all", "free", "member", "premium"].includes(str(formData, "audience"))
      ? str(formData, "audience")
      : "all"
  ) as AudienceKey;
  if (!title) redirect("/admin/notifications?error=title");
  if (link && !isInternalPath(link)) redirect("/admin/notifications?error=link");

  const [{ data: profiles }, { data: memberships }] = await Promise.all([
    db.from("profiles").select("user_id").eq("onboarding_complete", true),
    db
      .from("memberships")
      .select("user_id,entitlement,status,period_end,cancel_at_period_end"),
  ]);
  const ent = new Map(
    (
      (memberships ?? []) as {
        user_id: string;
        entitlement: string;
        status: string;
        period_end: string | null;
        cancel_at_period_end: boolean;
      }[]
    ).map((m) => [m.user_id, resolveMembership(m).entitlement]),
  );
  const targets = ((profiles ?? []) as { user_id: string }[]).filter((p) =>
    audienceMatches(audience, ent.get(p.user_id) ?? "free"),
  );
  const key = `announcement:${Date.now()}`;
  for (let i = 0; i < targets.length; i += 500) {
    await db.from("notifications").insert(
      targets.slice(i, i + 500).map((t) => ({
        user_id: t.user_id,
        kind: "announcement",
        title,
        body,
        link: link || null,
        dedupe_key: key,
      })),
    );
  }
  await audit(supabase, user.id, "announcement.send", audience, {
    title,
    recipients: targets.length,
  });
  redirect(`/admin/notifications?sent=${targets.length}`);
}

/* ----------------------------------------------------------------------- CRM */
export async function retryCrmEvent(id: string): Promise<void> {
  const { db } = await requireStaff(OPS);
  await db
    .from("crm_sync_events")
    .update({
      status: "pending",
      attempts: 0,
      next_attempt_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", id);
  redirect("/admin/crm?retried=1");
}

export async function runCrmNow(): Promise<void> {
  await requireStaff(OPS);
  const r = await processCrmQueue();
  redirect(`/admin/crm?ran=${r.skipped ? "skipped" : `${r.sent}-${r.failed}`}`);
}

/* ------------------------------------------------------------------ settings */
export async function saveSettings(formData: FormData): Promise<void> {
  const { supabase, user } = await requireStaff(OPS);
  const num = (k: string, d: number) => {
    const n = Number(formData.get(k));
    return Number.isFinite(n) && n > 0 ? n : d;
  };
  const entries = {
    membership_price_display: JSON.stringify(str(formData, "price", 60)),
    support_email: JSON.stringify(str(formData, "support_email", 120)),
    privacy_url: JSON.stringify(str(formData, "privacy_url", 200)),
    terms_url: JSON.stringify(str(formData, "terms_url", 200)),
    daily_goals: JSON.stringify({
      waterTargetMl: num("water", 2500),
      stepGoal: num("steps", 8000),
      weighInEveryDays: num("weigh_every", 7),
      weighInRemindFromDay: num("weigh_from", 5),
      weights: {
        workout: num("w_workout", 40),
        water: num("w_water", 30),
        steps: num("w_steps", 20),
        checkin: num("w_checkin", 10),
      },
    }),
  };
  const rows = Object.entries(entries).map(([key, value]) => ({
    key,
    value: JSON.parse(value),
  }));
  const { error } = await supabase
    .from("app_settings")
    .upsert(rows, { onConflict: "key" });
  if (error) redirect("/admin/settings?error=save");
  await audit(supabase, user.id, "settings.update", "app_settings");
  revalidatePath("/", "layout");
  redirect("/admin/settings?saved=1");
}

export async function saveVideoMinutes(formData: FormData): Promise<void> {
  const { supabase, user } = await requireStaff(OPS);
  const n = Math.max(0, Math.round(Number(formData.get("minutes")) || 0));
  await supabase
    .from("app_settings")
    .upsert({ key: "video_minutes_delivered_month", value: n }, { onConflict: "key" });
  await audit(supabase, user.id, "settings.video_minutes", "app_settings", {
    minutes: n,
  });
  redirect("/admin/kpis?saved=1");
}

/** Tags drive filters and categories. Owners add new ones here instead of editing the database. */
export async function addTag(formData: FormData): Promise<void> {
  const { supabase, user } = await requireStaff(CONTENT);
  const group = str(formData, "group", 30);
  const label = str(formData, "label", 60);
  if (
    !["category", "goal", "delivery", "equipment", "duration"].includes(group) ||
    !label
  )
    redirect("/admin/tags?error=1");
  const { error } = await supabase.from("content_tags").insert({
    tag_group: group,
    slug: slugify(label).replace(/-/g, "_"),
    label,
    sort_order: 100,
  });
  if (error) redirect("/admin/tags?error=1");
  await audit(supabase, user.id, "tag.add", group, { label });
  redirect("/admin/tags?saved=1");
}

export async function deleteTag(id: string): Promise<void> {
  const { supabase, user } = await requireStaff(CONTENT);
  await supabase.from("content_tags").delete().eq("id", id);
  await audit(supabase, user.id, "tag.delete", id);
  redirect("/admin/tags?saved=1");
}
