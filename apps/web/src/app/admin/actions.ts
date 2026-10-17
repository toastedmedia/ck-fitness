"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  ALWAYS_SENT,
  EMAIL_LABELS,
  renderCampaign,
  validBannerLink,
  isDiet,
  needsSafetyGuidance,
  NUTRITION,
  MAX_BULK_ACCESS,
  cleanIds,
  audienceMatches,
  canManageRole,
  normalizePhone,
  parseProgramImport,
  renderEmail,
  resolveMembership,
  validateForPublish,
  STAFF_ROLES,
  type AudienceKey,
  type EmailKey,
} from "@ck/core";
import { CONTENT, OPS, SUPPORT, audit, requireStaff } from "@/lib/admin";
import { processCrmQueue } from "@/lib/crm";
import {
  audienceUserIds,
  imageUrlOf,
  processCampaign,
  siteBase,
  startCampaign,
  toCampaign,
  type Audience,
  type CampaignRow,
} from "@/lib/email/campaign";
import { resendConfirmationEmail } from "@/lib/email/confirm";
import { sendMemberEmail, sendRaw, emailConfigured } from "@/lib/email/send";
import { notifyUser } from "@/lib/events";
import { createMember, grantAccess } from "@/lib/members";
import {
  addTag as tagMembers,
  ensureTag,
  removeTag as untagMembers,
} from "@/lib/member-tags";
import { releaseVideo } from "@/lib/r2";
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

/** Deletes a thumbnail file only when no lesson uses it any more (cloned lessons share files). */
async function releaseThumbnail(
  supabase: Awaited<ReturnType<typeof requireStaff>>["supabase"],
  db: Awaited<ReturnType<typeof requireStaff>>["db"],
  path: string | null | undefined,
) {
  if (!path) return;
  const { count } = await db
    .from("lessons")
    .select("*", { count: "exact", head: true })
    .eq("thumbnail_path", path);
  if (!count) await supabase.storage.from("program-thumbnails").remove([path]);
}

/** Swaps an item with its neighbour and renumbers the whole list 1..n so order is always clean. */
async function moveWithin(
  supabase: Awaited<ReturnType<typeof requireStaff>>["supabase"],
  table: "lessons" | "program_sections",
  parentCol: "section_id" | "program_id",
  parentId: string,
  id: string,
  dir: "up" | "down",
) {
  const { data } = await supabase
    .from(table)
    .select("id")
    .eq(parentCol, parentId)
    .order("order_index")
    .order("id");
  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
  const i = ids.indexOf(id);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await Promise.all(
    ids.map((x, n) =>
      supabase
        .from(table)
        .update({ order_index: n + 1 })
        .eq("id", x),
    ),
  );
}

export async function moveLesson(
  programId: string,
  sectionId: string,
  lessonId: string,
  dir: "up" | "down",
): Promise<void> {
  const { supabase } = await requireStaff(CONTENT);
  await moveWithin(supabase, "lessons", "section_id", sectionId, lessonId, dir);
  redirect(`/admin/programs/${programId}?lesson=${lessonId}`);
}

export async function moveSection(
  programId: string,
  sectionId: string,
  dir: "up" | "down",
): Promise<void> {
  const { supabase } = await requireStaff(CONTENT);
  await moveWithin(supabase, "program_sections", "program_id", programId, sectionId, dir);
  redirect(`/admin/programs/${programId}?week=${sectionId}`);
}

/** Adds an empty draft lesson at the end of a week and opens it. */
export async function createLesson(programId: string, sectionId: string): Promise<void> {
  const { supabase, user } = await requireStaff(CONTENT);
  const { data: last } = await supabase
    .from("lessons")
    .select("order_index")
    .eq("section_id", sectionId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase
    .from("lessons")
    .insert({
      section_id: sectionId,
      title: "New lesson",
      order_index: (last?.order_index ?? 0) + 1,
      published: false,
    })
    .select("id")
    .single();
  if (error || !data) redirect(`/admin/programs/${programId}?error=save`);
  await audit(supabase, user.id, "lesson.create", data.id);
  redirect(`/admin/programs/${programId}?lesson=${data.id}`);
}

/** Copies a week and all its lessons as drafts (videos and thumbnails are shared, not duplicated). */
export async function duplicateSection(
  programId: string,
  sectionId: string,
): Promise<void> {
  const { supabase, user } = await requireStaff(CONTENT);
  const { data: s } = await supabase
    .from("program_sections")
    .select("*")
    .eq("id", sectionId)
    .maybeSingle();
  if (!s) redirect(`/admin/programs/${programId}?error=save`);
  const { data: last } = await supabase
    .from("program_sections")
    .select("order_index")
    .eq("program_id", programId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { id: _sid, ...srest } = s;
  void _sid;
  const { data: copy } = await supabase
    .from("program_sections")
    .insert({
      ...srest,
      title: `${s.title} (copy)`,
      order_index: (last?.order_index ?? 0) + 1,
      published: false,
    })
    .select("id")
    .single();
  if (!copy) redirect(`/admin/programs/${programId}?error=save`);
  const { data: ls } = await supabase
    .from("lessons")
    .select("*")
    .eq("section_id", sectionId)
    .order("order_index");
  if (ls?.length)
    await supabase.from("lessons").insert(
      ls.map((l) => {
        const { id: _lid, ...rest } = l;
        void _lid;
        return { ...rest, section_id: copy.id, published: false };
      }),
    );
  await audit(supabase, user.id, "section.duplicate", sectionId);
  redirect(`/admin/programs/${programId}?week=${copy.id}&saved=1`);
}

/** Instructor profile and the learning-experience switches for one program. */
export async function updateProgramSettings(
  programId: string,
  formData: FormData,
): Promise<void> {
  const { supabase, user } = await requireStaff(CONTENT);
  const patch: Record<string, unknown> = {
    instructor_name: str(formData, "instructor_name", 120) || null,
    instructor_title: str(formData, "instructor_title", 160) || null,
    instructor_bio: str(formData, "instructor_bio", 1000) || null,
    autoplay_next: formData.get("autoplay_next") === "on",
    autoplay_first: formData.get("autoplay_first") === "on",
    auto_complete: formData.get("auto_complete") === "on",
  };
  const photo = formData.get("instructor_photo");
  const wipe = formData.get("remove_instructor_photo") === "on";
  const back = `/admin/programs/${programId}?view=settings`;
  const { data: cur } = await supabase
    .from("programs")
    .select("instructor_photo_path")
    .eq("id", programId)
    .maybeSingle();
  if (photo instanceof File && photo.size > 0) {
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(photo.type) ||
      photo.size > 2_097_152
    )
      redirect(`${back}&error=cover`);
    const ext =
      photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
    const path = `programs/${programId}/instructor-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("program-thumbnails")
      .upload(path, photo, { contentType: photo.type });
    if (error) redirect(`${back}&error=cover`);
    patch.instructor_photo_path = path;
  } else if (wipe) patch.instructor_photo_path = null;
  const { error } = await supabase.from("programs").update(patch).eq("id", programId);
  if (error) redirect(`${back}&error=save`);
  if ("instructor_photo_path" in patch && cur?.instructor_photo_path)
    await supabase.storage.from("program-thumbnails").remove([cur.instructor_photo_path]);
  await audit(supabase, user.id, "program.settings", programId);
  revalidatePath("/programs");
  redirect(`${back}&saved=1`);
}

/** Copies the three learning-experience switches to every program. */
export async function applyLearningToAll(
  programId: string,
  formData: FormData,
): Promise<void> {
  const { supabase, user } = await requireStaff(CONTENT);
  const { error } = await supabase
    .from("programs")
    .update({
      autoplay_next: formData.get("autoplay_next") === "on",
      autoplay_first: formData.get("autoplay_first") === "on",
      auto_complete: formData.get("auto_complete") === "on",
    })
    .not("id", "is", null);
  await audit(supabase, user.id, "program.settings_all", programId);
  revalidatePath("/programs");
  redirect(
    `/admin/programs/${programId}?view=settings&${error ? "error=save" : "saved=1"}`,
  );
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
  const { data: made } = await supabase
    .from("program_sections")
    .insert({
      program_id: programId,
      title,
      section_type: type,
      order_index: (last?.order_index ?? 0) + 1,
      published: false,
    })
    .select("id")
    .single();
  await audit(supabase, user.id, "section.add", programId, { title });
  redirect(`/admin/programs/${programId}?${made ? `week=${made.id}&` : ""}saved=1`);
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
  redirect(`/admin/programs/${programId}?week=${sectionId}&saved=1`);
}

export async function deleteSection(programId: string, sectionId: string): Promise<void> {
  const { supabase, user, db } = await requireStaff(CONTENT);
  const { data: gone } = await supabase
    .from("lessons")
    .select("video_key,thumbnail_path")
    .eq("section_id", sectionId);
  await supabase.from("program_sections").delete().eq("id", sectionId);
  for (const l of gone ?? []) {
    await releaseVideo(db, l.video_key);
    await releaseThumbnail(supabase, db, l.thumbnail_path);
  }
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
  const { supabase, user, db } = await requireStaff(CONTENT);
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
    access_override: LEVELS.includes(override) ? override : null,
    order_index: int(formData, "order_index"),
  };
  // Save keeps the current status; the two buttons beside it publish or unpublish in one click.
  const intent = str(formData, "intent");
  if (intent === "publish") row.published = true;
  else if (intent === "unpublish") row.published = false;
  else if (lessonId === "new") row.published = false;
  const back = (q: string) =>
    `/admin/programs/${programId}?${lessonId !== "new" ? `lesson=${lessonId}&` : ""}${q}`;
  if (!row.title) redirect(back("error=lesson"));
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
    if (error) redirect(back("error=save"));
  }
  const file = formData.get("resource");
  if (file instanceof File && file.size > 0) {
    if (
      !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 4_194_304
    )
      redirect(`/admin/programs/${programId}?lesson=${id}&error=resource`);
    const path = `${id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error } = await supabase.storage
      .from("program-resources")
      .upload(path, file, { contentType: file.type });
    if (error) redirect(`/admin/programs/${programId}?lesson=${id}&error=resource`);
    await supabase.from("lessons").update({ resource_path: path }).eq("id", id);
  }
  const thumb = formData.get("thumbnail");
  const wipe = formData.get("remove_thumbnail") === "on";
  if ((thumb instanceof File && thumb.size > 0) || wipe) {
    const { data: cur } = await supabase
      .from("lessons")
      .select("thumbnail_path")
      .eq("id", id)
      .maybeSingle();
    let next: string | null = null;
    if (thumb instanceof File && thumb.size > 0) {
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(thumb.type) ||
        thumb.size > 2_097_152
      )
        redirect(`/admin/programs/${programId}?lesson=${id}&error=cover`);
      const ext =
        thumb.type === "image/png" ? "png" : thumb.type === "image/webp" ? "webp" : "jpg";
      next = `lessons/${id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("program-thumbnails")
        .upload(next, thumb, { contentType: thumb.type });
      if (error) redirect(`/admin/programs/${programId}?lesson=${id}&error=cover`);
    }
    await supabase.from("lessons").update({ thumbnail_path: next }).eq("id", id);
    await releaseThumbnail(supabase, db, cur?.thumbnail_path);
  }
  await audit(
    supabase,
    user.id,
    lessonId === "new" ? "lesson.create" : "lesson.update",
    id,
    { title: row.title },
  );
  revalidatePath("/programs");
  redirect(
    `/admin/programs/${programId}?lesson=${id}&${intent === "publish" ? "lpub=1" : intent === "unpublish" ? "lunpub=1" : "saved=1"}`,
  );
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
    const { data: copy } = await supabase
      .from("lessons")
      .insert({
        ...rest,
        title: `${l.title} (copy)`,
        order_index: l.order_index + 1,
        published: false,
      })
      .select("id")
      .single();
    await audit(supabase, user.id, "lesson.duplicate", lessonId);
    if (copy) redirect(`/admin/programs/${programId}?lesson=${copy.id}&cloned=1`);
  }
  redirect(`/admin/programs/${programId}?saved=1`);
}

export async function deleteLesson(programId: string, lessonId: string): Promise<void> {
  const { supabase, user, db } = await requireStaff(CONTENT);
  const { data: gone } = await supabase
    .from("lessons")
    .select("video_key,thumbnail_path")
    .eq("id", lessonId)
    .maybeSingle();
  await supabase.from("lessons").delete().eq("id", lessonId);
  await releaseVideo(db, gone?.video_key);
  await releaseThumbnail(supabase, db, gone?.thumbnail_path);
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
    .select("title,section_id,video_key,instructions,published")
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
      title: `New training: ${p.title}`,
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
  if (reply && row?.user_id) await sendMemberEmail(row.user_id, "support_replied");
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
    membership_price_amount: JSON.stringify(
      Number(formData.get("price_amount")) > 0
        ? Number(formData.get("price_amount"))
        : 29.99,
    ),
    support_email: JSON.stringify(str(formData, "support_email", 120)),
    referral_reward: JSON.stringify(str(formData, "referral_reward", 160)),
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

/**
 * Bulk-create DRAFT programs from CK's inventory spreadsheet (docs/program-import-template.csv).
 * Nothing is published automatically; existing programs with the same web address are skipped.
 */
export async function importPrograms(formData: FormData): Promise<void> {
  const { supabase, user } = await requireStaff(CONTENT);
  const file = formData.get("file");
  const text =
    file instanceof File && file.size > 0
      ? await file.text()
      : str(formData, "csv", 200_000);
  if (!text.trim())
    redirect(
      "/admin/programs/import?problems=" +
        encodeURIComponent("Choose a CSV file or paste its contents."),
    );
  if (text.length > 1_000_000)
    redirect(
      "/admin/programs/import?problems=" + encodeURIComponent("That file is too large."),
    );

  const parsed = parseProgramImport(text);
  if (parsed.programs.length === 0) {
    redirect(
      "/admin/programs/import?problems=" +
        encodeURIComponent(
          [...parsed.problems, ...parsed.skipped].slice(0, 8).join("|") ||
            "Nothing to import.",
        ),
    );
  }

  const { data: tags } = await supabase.from("content_tags").select("id,tag_group,label");
  const tagId = (group: string, label: string) =>
    ((tags ?? []) as { id: string; tag_group: string; label: string }[]).find(
      (t) =>
        t.tag_group === group && t.label.toLowerCase() === label.trim().toLowerCase(),
    )?.id;

  let created = 0,
    lessons = 0;
  const notes = [...parsed.problems];
  for (const p of parsed.programs) {
    const slug = slugify(p.name);
    const { data: clash } = await supabase
      .from("programs")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (clash) {
      notes.push(`"${p.name}" already exists, so it was skipped.`);
      continue;
    }
    const { data: prog, error } = await supabase
      .from("programs")
      .insert({
        slug,
        title: p.name,
        access_level: p.access,
        level: p.level,
        duration_label: p.duration || null,
        published: false,
      })
      .select("id")
      .single();
    if (error || !prog) {
      notes.push(`"${p.name}" could not be created.`);
      continue;
    }
    created++;

    const wanted = [
      ["category", p.category],
      ...p.delivery.map((d) => ["delivery", d]),
    ].filter(([, label]) => label);
    const ids = wanted.map(([g, l]) => ({ g, l, id: tagId(g, l) }));
    ids
      .filter((x) => !x.id)
      .forEach((x) =>
        notes.push(`"${p.name}": no ${x.g} tag called "${x.l}" (add it under Tags).`),
      );
    const rows = ids
      .filter((x) => x.id)
      .map((x) => ({ program_id: prog.id, tag_id: x.id as string }));
    if (rows.length) await supabase.from("program_tag_map").insert(rows);

    for (const [si, s] of p.sections.entries()) {
      const { data: sec } = await supabase
        .from("program_sections")
        .insert({ program_id: prog.id, title: s.title, order_index: si + 1 })
        .select("id")
        .single();
      if (!sec) continue;
      const lessonRows = s.lessons.map((l, li) => ({
        section_id: sec.id,
        title: l.title,
        order_index: li + 1,
        published: true,
      }));
      const { error: le } = await supabase.from("lessons").insert(lessonRows);
      if (!le) lessons += lessonRows.length;
    }
    await audit(supabase, user.id, "program.import", prog.id, { title: p.name });
  }
  redirect(
    `/admin/programs/import?done=${created}-${lessons}&problems=${encodeURIComponent([...notes, ...parsed.skipped].slice(0, 12).join("|"))}`,
  );
}

/** Staff correct a client's contact details. The change (before and after) is logged. */
export async function updateClientContact(
  userId: string,
  formData: FormData,
): Promise<void> {
  const { supabase, user, db } = await requireStaff(OPS);
  const first = str(formData, "first_name", 60),
    last = str(formData, "last_name", 60);
  const phone = str(formData, "phone", 30),
    email = str(formData, "email", 200).toLowerCase();
  if (!first || !last) redirect(`/admin/users/${userId}?error=name`);
  if (phone && !/^\+?[0-9 ()-]{7,20}$/.test(phone))
    redirect(`/admin/users/${userId}?error=phone`);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    redirect(`/admin/users/${userId}?error=email`);

  const { data: before } = await db
    .from("profiles")
    .select("first_name,last_name,phone,email")
    .eq("user_id", userId)
    .maybeSingle();
  if (before && before.email !== email) {
    const { error } = await db.auth.admin.updateUserById(userId, {
      email,
      email_confirm: true,
    });
    if (error) redirect(`/admin/users/${userId}?error=email`);
  }
  await db
    .from("profiles")
    .update({ first_name: first, last_name: last, phone: phone || null, email })
    .eq("user_id", userId);
  await audit(supabase, user.id, "client.contact_update", userId, {
    before,
    after: { first_name: first, last_name: last, phone: phone || null, email },
  });
  redirect(`/admin/users/${userId}?saved=1`);
}

export async function addClientNote(userId: string, formData: FormData): Promise<void> {
  const { supabase, user } = await requireStaff(SUPPORT);
  const body = str(formData, "body", 2000);
  if (body)
    await supabase
      .from("client_notes")
      .insert({ user_id: userId, author_id: user.id, body });
  redirect(`/admin/users/${userId}?tab=notes&saved=1`);
}

export async function deleteClientNote(userId: string, noteId: string): Promise<void> {
  const { supabase } = await requireStaff(SUPPORT);
  await supabase.from("client_notes").delete().eq("id", noteId);
  redirect(`/admin/users/${userId}?tab=notes&saved=1`);
}

/** Quick switch between Free and Member (and the other levels) from the programs list. */
export async function updateProgramAccess(id: string, formData: FormData): Promise<void> {
  const { supabase, user } = await requireStaff(CONTENT);
  const level = str(formData, "access_level");
  if (!LEVELS.includes(level)) redirect("/admin/programs");
  await supabase.from("programs").update({ access_level: level }).eq("id", id);
  await audit(supabase, user.id, "program.access", id, { access_level: level });
  revalidatePath("/programs");
  redirect("/admin/programs?saved=1");
}

/* --------------------------------------------------------------- community moderation */
const POST_TABLE = (kind: string) =>
  kind === "comment" ? "community_comments" : "community_posts";

/** Hide, restore or remove a post or comment. Open reports about it are marked as handled. */
export async function moderateContent(
  kind: "post" | "comment",
  id: string,
  status: "visible" | "hidden" | "removed",
): Promise<void> {
  const { supabase, user } = await requireStaff(SUPPORT);
  await supabase.from(POST_TABLE(kind)).update({ status }).eq("id", id);
  await supabase
    .from("community_reports")
    .update({ status: "resolved", resolved_by: user.id })
    .eq(kind === "post" ? "post_id" : "comment_id", id)
    .eq("status", "open");
  await audit(supabase, user.id, `community.${status}`, id, { kind });
  revalidatePath("/community");
  redirect("/admin/community?saved=1");
}

/** The reports were not valid: keep the content visible and close the reports. */
export async function dismissReports(
  kind: "post" | "comment",
  id: string,
): Promise<void> {
  const { supabase, user } = await requireStaff(SUPPORT);
  await supabase.from(POST_TABLE(kind)).update({ status: "visible" }).eq("id", id);
  await supabase
    .from("community_reports")
    .update({ status: "resolved", resolved_by: user.id })
    .eq(kind === "post" ? "post_id" : "comment_id", id)
    .eq("status", "open");
  await audit(supabase, user.id, "community.dismiss", id, { kind });
  revalidatePath("/community");
  redirect("/admin/community?saved=1");
}

export async function muteMember(userId: string, formData: FormData): Promise<void> {
  const { supabase, user, db } = await requireStaff(SUPPORT);
  const days = Math.min(
    90,
    Math.max(1, parseInt(String(formData.get("days") ?? "7"), 10) || 7),
  );
  await db
    .from("profiles")
    .update({
      community_muted_until: new Date(Date.now() + days * 86_400_000).toISOString(),
    })
    .eq("user_id", userId);
  await notifyUser(userId, {
    kind: "community",
    title: "Your community posting is paused",
    body: `You can read the community, but not post for ${days} day${days === 1 ? "" : "s"}. Please review the guidelines.`,
    link: "/community/guidelines",
  });
  await audit(supabase, user.id, "community.mute", userId, { days });
  redirect("/admin/community?saved=1");
}

export async function setCommunityBan(userId: string, banned: boolean): Promise<void> {
  const { supabase, user, db } = await requireStaff(OPS);
  await db.from("profiles").update({ community_banned: banned }).eq("user_id", userId);
  await audit(supabase, user.id, banned ? "community.ban" : "community.unban", userId);
  redirect("/admin/community?saved=1");
}

export async function postAnnouncement(formData: FormData): Promise<void> {
  const { supabase, user } = await requireStaff(SUPPORT);
  const body = str(formData, "body", 1000);
  if (!body) redirect("/admin/community?error=1");
  const { data } = await supabase
    .from("community_posts")
    .insert({ user_id: user.id, body, category: "announcement" })
    .select("id")
    .single();
  if (data && formData.get("pinned") === "on")
    await supabase.from("community_posts").update({ pinned: true }).eq("id", data.id);
  await audit(supabase, user.id, "community.announce", data?.id ?? "-");
  revalidatePath("/community");
  redirect("/admin/community?saved=1");
}

export async function togglePin(id: string, pinned: boolean): Promise<void> {
  const { supabase, user } = await requireStaff(SUPPORT);
  await supabase.from("community_posts").update({ pinned }).eq("id", id);
  await audit(supabase, user.id, pinned ? "community.pin" : "community.unpin", id);
  revalidatePath("/community");
  redirect("/admin/community?saved=1");
}

export async function setCommunityAudience(formData: FormData): Promise<void> {
  const { supabase, user } = await requireStaff(OPS);
  const value = str(formData, "audience") === "members" ? "members" : "all";
  await supabase
    .from("app_settings")
    .upsert({ key: "community_audience", value }, { onConflict: "key" });
  await audit(supabase, user.id, "community.audience", value);
  revalidatePath("/community");
  redirect("/admin/community?saved=1");
}

/** Photo posts wait here until a staff member approves them (switch it off in Community settings). */
export async function approvePost(id: string): Promise<void> {
  const { supabase, user } = await requireStaff(SUPPORT);
  const { data } = await supabase
    .from("community_posts")
    .update({ approval_status: "approved" })
    .eq("id", id)
    .select("user_id")
    .maybeSingle();
  if (data?.user_id)
    await notifyUser(data.user_id, {
      kind: "community",
      title: "Your post is now live",
      body: "Thanks for sharing.",
      link: `/community/${id}`,
    });
  await audit(supabase, user.id, "community.approve", id);
  revalidatePath("/community");
  redirect("/admin/community?saved=1");
}

export async function rejectPost(id: string): Promise<void> {
  const { supabase, user } = await requireStaff(SUPPORT);
  const { data } = await supabase
    .from("community_posts")
    .update({ approval_status: "rejected", status: "removed" })
    .eq("id", id)
    .select("user_id")
    .maybeSingle();
  if (data?.user_id)
    await notifyUser(data.user_id, {
      kind: "community",
      title: "Your post was not approved",
      body: "It did not follow the community guidelines. Please review them and try again.",
      link: "/community/guidelines",
    });
  await audit(supabase, user.id, "community.reject", id);
  revalidatePath("/community");
  redirect("/admin/community?saved=1");
}

export async function setPhotoApproval(formData: FormData): Promise<void> {
  const { supabase, user } = await requireStaff(OPS);
  const value = str(formData, "approval") === "off" ? "off" : "on";
  await supabase
    .from("app_settings")
    .upsert({ key: "community_photo_approval", value }, { onConflict: "key" });
  await audit(supabase, user.id, "community.photo_approval", value);
  redirect("/admin/community?saved=1");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Adds one member by hand (owner/admin). She signs in by choosing "Forgot password" with this email. */
export async function addMember(formData: FormData): Promise<void> {
  const { supabase, user, db } = await requireStaff(OPS);
  const first = str(formData, "first_name", 60);
  const last = str(formData, "last_name", 60);
  const email = str(formData, "email", 200).toLowerCase();
  const rawPhone = str(formData, "phone", 30);
  const phone = normalizePhone(rawPhone);
  const programId = str(formData, "program_id");
  const back = "/admin/users?view=add";
  if (!first || !last) redirect(`${back}&error=name`);
  if (!EMAIL_RE.test(email)) redirect(`${back}&error=email`);
  if (!phone) redirect(`${back}&error=phone`);
  let id = "";
  let created = false;
  try {
    ({ id, created } = await createMember(db, { first, last, email, phone }));
    if (programId) await grantAccess(db, id, programId);
    if (created && formData.get("notify") === "on") {
      const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
      if (site)
        await db.auth.resetPasswordForEmail(email, {
          redirectTo: `${site}/auth/callback?next=/reset-password`,
        });
    }
  } catch {
    redirect(`${back}&error=save`);
  }
  await audit(supabase, user.id, "member.add", id, {
    email,
    created,
    programId: programId || null,
  });
  redirect(`/admin/users/${id}?saved=1${created ? "&added=1" : "&existed=1"}`);
}

/** Gives a member a program the way a payment would (manual CK Membership + enrol). From a client page. */
export async function giveAccessToUser(
  userId: string,
  formData: FormData,
): Promise<void> {
  const { supabase, user, db } = await requireStaff(OPS);
  const programId = str(formData, "program_id");
  if (!programId) redirect(`/admin/users/${userId}?tab=programs&error=program`);
  try {
    await grantAccess(db, userId, programId);
  } catch {
    redirect(`/admin/users/${userId}?tab=programs&error=save`);
  }
  await audit(supabase, user.id, "member.grant_access", userId, { programId });
  redirect(`/admin/users/${userId}?tab=programs&saved=1`);
}

/** Same thing from a program page, looked up by the member's email. */
export async function giveProgramAccess(
  programId: string,
  formData: FormData,
): Promise<void> {
  const { supabase, user, db } = await requireStaff(OPS);
  const email = str(formData, "email", 200).toLowerCase();
  const back = `/admin/programs/${programId}?view=access`;
  if (!EMAIL_RE.test(email)) redirect(`${back}&error=email`);
  const { data: prof } = await db
    .from("profiles")
    .select("user_id")
    .eq("email", email)
    .maybeSingle();
  if (!prof) redirect(`${back}&error=nouser`);
  let r: Awaited<ReturnType<typeof grantAccess>>;
  try {
    r = await grantAccess(db, prof.user_id, programId);
  } catch {
    redirect(`${back}&error=save`);
  }
  await audit(supabase, user.id, "member.grant_access", prof.user_id, { programId });
  redirect(`${back}&granted=${r.membership}&who=${encodeURIComponent(email)}`);
}

/** Saves a drag-and-drop reorder: the order of weeks, the lessons in each, and lessons moved between weeks. */
export async function reorderOutline(
  programId: string,
  order: { id: string; lessons: string[] }[],
): Promise<{ ok: boolean }> {
  const { supabase, user } = await requireStaff(CONTENT);
  const { data: secs } = await supabase
    .from("program_sections")
    .select("id")
    .eq("program_id", programId);
  const sectionIds = new Set((secs ?? []).map((s: { id: string }) => s.id));
  if (order.length !== sectionIds.size || order.some((s) => !sectionIds.has(s.id)))
    return { ok: false };
  const { data: ls } = sectionIds.size
    ? await supabase
        .from("lessons")
        .select("id")
        .in("section_id", [...sectionIds])
    : { data: [] as { id: string }[] };
  const lessonIds = new Set((ls ?? []).map((l: { id: string }) => l.id));
  const given = order.flatMap((s) => s.lessons);
  if (
    given.length !== lessonIds.size ||
    given.some((l) => !lessonIds.has(l)) ||
    new Set(given).size !== given.length
  )
    return { ok: false };
  const results = await Promise.all([
    ...order.map((s, i) =>
      supabase
        .from("program_sections")
        .update({ order_index: i + 1 })
        .eq("id", s.id),
    ),
    ...order.flatMap((s) =>
      s.lessons.map((lid, j) =>
        supabase
          .from("lessons")
          .update({ section_id: s.id, order_index: j + 1 })
          .eq("id", lid),
      ),
    ),
  ]);
  if (results.some((r) => r.error)) return { ok: false };
  await audit(supabase, user.id, "program.reorder", programId);
  revalidatePath("/programs");
  return { ok: true };
}

/** Owner/admin: sends one sample email (with example data) to their own address so they can see the real thing. */
export async function sendTestEmail(formData: FormData): Promise<void> {
  const { user, db } = await requireStaff(OPS);
  const key = str(formData, "key") as EmailKey;
  if (!(key in EMAIL_LABELS)) redirect("/admin/emails?error=key");
  const { data: me } = await db
    .from("profiles")
    .select("email,first_name")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me?.email) redirect("/admin/emails?error=noemail");
  const site = (
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://app.chardikalafitness.com"
  ).replace(/\/$/, "");
  const e = renderEmail(
    key,
    { name: me.first_name ?? undefined },
    {
      siteUrl: site,
      unsubscribeUrl: ALWAYS_SENT.includes(key)
        ? undefined
        : `${site}/api/email/unsubscribe?t=sample`,
    },
  );
  const ok = await sendRaw({
    to: me.email,
    subject: `[TEST] ${e.subject}`,
    html: e.html,
    text: e.text,
  });
  redirect(
    `/admin/emails?tab=auto&${ok ? `sent=${encodeURIComponent(me.email)}` : "error=send"}`,
  );
}

/** Users page: add or remove a tag for every ticked member. */
export async function bulkTag(formData: FormData): Promise<void> {
  const { supabase, user, db } = await requireStaff(OPS);
  const back = str(formData, "back") || "/admin/users";
  const safeBack = back.startsWith("/admin/users") ? back : "/admin/users";
  const ids = cleanIds(formData.getAll("ids"));
  const mode = str(formData, "mode") === "remove" ? "remove" : "add";
  if (!ids.length) redirect(`${safeBack}${safeBack.includes("?") ? "&" : "?"}bulk=none`);
  const existing = str(formData, "tag_id");
  const typed = str(formData, "new_tag", 30);
  const tagId = typed ? await ensureTag(db, typed, user.id) : existing || null;
  if (!tagId) redirect(`${safeBack}${safeBack.includes("?") ? "&" : "?"}bulk=notag`);
  if (mode === "add") await tagMembers(db, tagId, ids);
  else await untagMembers(db, tagId, ids);
  await audit(supabase, user.id, `members.tag_${mode}`, tagId, { count: ids.length });
  redirect(
    `${safeBack}${safeBack.includes("?") ? "&" : "?"}bulk=${mode}&n=${ids.length}`,
  );
}

/** Users page: give a training to every ticked member (up to 100 at a time). */
export async function bulkGiveAccess(formData: FormData): Promise<void> {
  const { supabase, user, db } = await requireStaff(OPS);
  const back = str(formData, "back") || "/admin/users";
  const safeBack = back.startsWith("/admin/users") ? back : "/admin/users";
  const join = safeBack.includes("?") ? "&" : "?";
  const ids = cleanIds(formData.getAll("ids"), 5000);
  const programId = str(formData, "program_id");
  if (!ids.length || !programId) redirect(`${safeBack}${join}bulk=none`);
  if (ids.length > MAX_BULK_ACCESS) redirect(`${safeBack}${join}bulk=toomany`);
  let ok = 0;
  for (const id of ids) {
    try {
      await grantAccess(db, id, programId);
      ok++;
    } catch {
      /* keep going; the count shows how many worked */
    }
  }
  await audit(supabase, user.id, "members.bulk_access", programId, { count: ok });
  redirect(`${safeBack}${join}bulk=access&n=${ok}`);
}

/** One member's page: add a tag, or remove one. */
export async function addMemberTag(userId: string, formData: FormData): Promise<void> {
  const { supabase, user, db } = await requireStaff(OPS);
  const typed = str(formData, "new_tag", 30);
  const tagId = typed ? await ensureTag(db, typed, user.id) : str(formData, "tag_id");
  if (tagId) {
    await tagMembers(db, tagId, [userId]);
    await audit(supabase, user.id, "members.tag_add", tagId, { count: 1 });
  }
  redirect(`/admin/users/${userId}`);
}
export async function removeMemberTag(userId: string, tagId: string): Promise<void> {
  const { supabase, user, db } = await requireStaff(OPS);
  await untagMembers(db, tagId, [userId]);
  await audit(supabase, user.id, "members.tag_remove", tagId, { count: 1 });
  redirect(`/admin/users/${userId}`);
}

/* ------------------------------------------------------------ marketing emails */
const planOf = (v: string): Audience["plan"] =>
  v === "free" || v === "member" ? v : "all";

/** Create or update a marketing email draft. */
export async function saveCampaign(id: string, formData: FormData): Promise<void> {
  const { supabase, user } = await requireStaff(OPS);
  const subject = str(formData, "subject", 150);
  const body = str(formData, "body", 6000);
  if (!subject || !body)
    redirect(`/admin/emails/${id === "new" ? "new" : `${id}/edit`}?error=missing`);
  const row: Record<string, unknown> = {
    name: str(formData, "name", 80) || subject,
    subject,
    preheader: str(formData, "preheader", 150),
    heading: str(formData, "heading", 150),
    body,
    cta_label: str(formData, "cta_label", 40),
    cta_url: str(formData, "cta_url", 500),
    audience: {
      plan: planOf(str(formData, "audience_plan")),
      ...(str(formData, "audience_tag") ? { tag_id: str(formData, "audience_tag") } : {}),
    },
  };
  const file = formData.get("image");
  if (file instanceof File && file.size > 0) {
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 2_097_152
    )
      redirect(`/admin/emails/${id === "new" ? "new" : `${id}/edit`}?error=image`);
    const path = `emails/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage
      .from("program-thumbnails")
      .upload(path, file, { contentType: file.type });
    if (error)
      redirect(`/admin/emails/${id === "new" ? "new" : `${id}/edit`}?error=image`);
    row.image_path = path;
  } else if (formData.get("remove_image") === "on") row.image_path = null;
  let target = id;
  if (id === "new") {
    const { data, error } = await supabase
      .from("email_campaigns")
      .insert({ ...row, created_by: user.id })
      .select("id")
      .single();
    if (error || !data) redirect("/admin/emails/new?error=save");
    target = data.id;
  } else {
    const { error } = await supabase
      .from("email_campaigns")
      .update(row)
      .eq("id", id)
      .eq("status", "draft");
    if (error) redirect(`/admin/emails/${id}/edit?error=save`);
  }
  await audit(
    supabase,
    user.id,
    id === "new" ? "campaign.create" : "campaign.update",
    target,
  );
  redirect(`/admin/emails/${target}?saved=1`);
}

async function loadCampaign(id: string) {
  const { supabase, user, db } = await requireStaff(OPS);
  const { data } = await supabase
    .from("email_campaigns")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!data) redirect("/admin/emails");
  return { supabase, user, db, c: data as CampaignRow };
}

/** Sends this email to the signed-in owner/admin only, so they can see the real thing. */
export async function sendCampaignTest(id: string): Promise<void> {
  const { user, db, c } = await loadCampaign(id);
  const { data: me } = await db
    .from("profiles")
    .select("email,first_name")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me?.email) redirect(`/admin/emails/${id}?error=noemail`);
  const site = siteBase();
  const e = renderCampaign(
    { ...toCampaign(c), imageUrl: imageUrlOf(c.image_path) },
    { name: me.first_name ?? undefined },
    {
      siteUrl: site,
      unsubscribeUrl: `${site}/api/email/unsubscribe?c=marketing&t=sample`,
    },
  );
  const ok = await sendRaw({
    to: me.email,
    subject: `[TEST] ${e.subject}`,
    html: e.html,
    text: e.text,
  });
  redirect(
    `/admin/emails/${id}?${ok ? `test=${encodeURIComponent(me.email)}` : "error=send"}`,
  );
}

/** Builds the list of who gets it (marketing consent only), then starts sending. */
export async function launchCampaign(id: string): Promise<void> {
  const { supabase, user, db, c } = await loadCampaign(id);
  if (c.status !== "draft") redirect(`/admin/emails/${id}`);
  if (!emailConfigured()) redirect(`/admin/emails/${id}?error=send`);
  const n = await startCampaign(db, c);
  await audit(supabase, user.id, "campaign.send", id, { recipients: n });
  if (n > 0) await processCampaign(db, id, 180);
  redirect(`/admin/emails/${id}?started=${n}`);
}

export async function cancelCampaign(id: string): Promise<void> {
  const { supabase, user, db } = await loadCampaign(id);
  await db
    .from("email_campaigns")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("status", "sending");
  await audit(supabase, user.id, "campaign.cancel", id);
  redirect(`/admin/emails/${id}`);
}

export async function deleteCampaign(id: string): Promise<void> {
  const { supabase, user, c } = await loadCampaign(id);
  if (c.status === "draft" || c.status === "cancelled") {
    await supabase.from("email_campaigns").delete().eq("id", id);
    await audit(supabase, user.id, "campaign.delete", id);
  }
  redirect("/admin/emails");
}

export async function duplicateCampaign(id: string): Promise<void> {
  const { supabase, user, c } = await loadCampaign(id);
  const { data } = await supabase
    .from("email_campaigns")
    .insert({
      name: `${c.name} (copy)`,
      subject: c.subject,
      preheader: c.preheader,
      heading: c.heading,
      body: c.body,
      image_path: c.image_path,
      cta_label: c.cta_label,
      cta_url: c.cta_url,
      audience: c.audience,
      created_by: user.id,
    })
    .select("id")
    .single();
  redirect(data ? `/admin/emails/${data.id}/edit` : "/admin/emails");
}

export async function countCampaignAudience(a: Audience): Promise<number> {
  const { db } = await requireStaff(OPS);
  return (await audienceUserIds(db, a)).length;
}

/* -------------------------------------------------------------- home banners */
/** A calendar date typed in the admin, as the start or end of that day in Vancouver. */
function vancouverDay(date: string, end: boolean): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const utc = new Date(`${date}T${end ? "23:59:59" : "00:00:00"}Z`);
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Vancouver",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(utc)
      .map((x) => [x.type, x.value]),
  );
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return new Date(utc.getTime() + (utc.getTime() - asUtc)).toISOString();
}

export async function saveBanner(formData: FormData): Promise<void> {
  const { supabase, user } = await requireStaff(CONTENT);
  const id = str(formData, "id");
  const back = (q: string) => redirect(`/admin/banners?${q}${id ? `&edit=${id}` : ""}`);
  const title = str(formData, "title", 100);
  const link = str(formData, "link_url", 500);
  if (!title) back("error=title");
  if (!validBannerLink(link)) back("error=link");
  const audience = ["free", "member"].includes(str(formData, "audience"))
    ? str(formData, "audience")
    : "all";
  const row: Record<string, unknown> = {
    title,
    alt: str(formData, "alt", 200) || title,
    link_url: link,
    audience,
    starts_at: vancouverDay(str(formData, "starts"), false),
    ends_at: vancouverDay(str(formData, "ends"), true),
    active: formData.get("active") === "on",
    sort_order: int(formData, "sort_order", 0),
  };
  const file = formData.get("image");
  if (file instanceof File && file.size > 0) {
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 2_097_152
    )
      back("error=image");
    const path = `banners/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage
      .from("program-thumbnails")
      .upload(path, file, { contentType: file.type });
    if (error) back("error=image");
    row.image_path = path;
  } else if (!id) back("error=image");
  if (id) {
    const { error } = await supabase.from("home_banners").update(row).eq("id", id);
    if (error) back("error=save");
  } else {
    const { error } = await supabase
      .from("home_banners")
      .insert({ ...row, created_by: user.id });
    if (error) back("error=save");
  }
  await audit(supabase, user.id, id ? "banner.update" : "banner.create", id || title);
  revalidatePath("/home");
  redirect("/admin/banners?saved=1");
}

export async function toggleBanner(id: string, on: boolean): Promise<void> {
  const { supabase, user } = await requireStaff(CONTENT);
  await supabase.from("home_banners").update({ active: on }).eq("id", id);
  await audit(supabase, user.id, on ? "banner.on" : "banner.off", id);
  revalidatePath("/home");
  redirect("/admin/banners?saved=1");
}

export async function deleteBanner(id: string): Promise<void> {
  const { supabase, user } = await requireStaff(CONTENT);
  const { data } = await supabase
    .from("home_banners")
    .select("image_path")
    .eq("id", id)
    .maybeSingle();
  await supabase.from("home_banners").delete().eq("id", id);
  if (data?.image_path)
    await supabase.storage.from("program-thumbnails").remove([data.image_path]);
  await audit(supabase, user.id, "banner.delete", id);
  revalidatePath("/home");
  redirect("/admin/banners?saved=1");
}

/* ---------------------------------------------------------------- meal plans */
const MEAL: Parameters<typeof requireStaff>[0] = [
  "owner",
  "admin",
  "coach",
  "content_manager",
];
const dateOnly = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export async function saveMealPlan(formData: FormData): Promise<void> {
  const { supabase, user } = await requireStaff(MEAL);
  const id = str(formData, "id");
  const back = (q: string) =>
    redirect(`/admin/meal-plans?${q}${id ? `&edit=${id}` : ""}`);
  const title = str(formData, "title", 120);
  const diet = str(formData, "diet");
  const starts = dateOnly(str(formData, "starts_on"));
  const body = str(formData, "body", 20000);
  if (!title || !body) back("error=missing");
  if (!isDiet(diet) || !starts) back("error=dates");
  const row = {
    title,
    diet,
    body,
    starts_on: starts,
    ends_on: dateOnly(str(formData, "ends_on")),
    published: formData.get("published") === "on",
    notify_on: dateOnly(str(formData, "notify_on")),
  };
  if (id) {
    const { error } = await supabase.from("diet_plans").update(row).eq("id", id);
    if (error) back("error=save");
  } else {
    const { error } = await supabase
      .from("diet_plans")
      .insert({ ...row, created_by: user.id });
    if (error) back("error=save");
  }
  await audit(supabase, user.id, id ? "mealplan.update" : "mealplan.create", id || title);
  revalidatePath("/accountability/diet");
  revalidatePath("/home");
  redirect("/admin/meal-plans?saved=1");
}

export async function toggleMealPlan(id: string, on: boolean): Promise<void> {
  const { supabase, user } = await requireStaff(MEAL);
  await supabase.from("diet_plans").update({ published: on }).eq("id", id);
  await audit(supabase, user.id, on ? "mealplan.publish" : "mealplan.unpublish", id);
  revalidatePath("/accountability/diet");
  revalidatePath("/home");
  redirect("/admin/meal-plans?saved=1");
}

export async function deleteMealPlan(id: string): Promise<void> {
  const { supabase, user } = await requireStaff(MEAL);
  await supabase.from("diet_plans").delete().eq("id", id);
  await audit(supabase, user.id, "mealplan.delete", id);
  revalidatePath("/accountability/diet");
  revalidatePath("/home");
  redirect("/admin/meal-plans?saved=1");
}

/* ------------------------------------------------- edit a member's questionnaire */
const PREGNANCY_OPTIONS = ["yes", "no", "prefer_not_to_say"];

/** A coach/admin updates a member's food preference, pregnancy answer and limitations. Logged before and after. */
export async function updateQuestionnaire(
  userId: string,
  formData: FormData,
): Promise<void> {
  const { supabase, user, db } = await requireStaff(["owner", "admin", "coach"]);
  const back = (q: string) => redirect(`/admin/users/${userId}?tab=questionnaire&${q}`);
  const { data: prof } = await db
    .from("profiles")
    .select("coach_access_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (!prof?.coach_access_at) back("error=notshared");
  const nutrition = str(formData, "nutrition");
  const pregnancy = str(formData, "pregnancy");
  const limitations = str(formData, "limitations", 500);
  if (
    !(NUTRITION as readonly string[]).includes(nutrition) ||
    !PREGNANCY_OPTIONS.includes(pregnancy)
  )
    back("edit=1&error=answers");
  const { data: before } = await db
    .from("onboarding_profiles")
    .select("nutrition_preference,safety_flags")
    .eq("user_id", userId)
    .maybeSingle();
  if (!before) back("error=answers");
  const flags = (before?.safety_flags ?? {}) as Record<string, unknown>;
  const safety_flags = {
    ...flags,
    limitations,
    pregnancy_context: pregnancy,
    show_guidance: needsSafetyGuidance({
      limitations,
      pregnancyContext: pregnancy as "yes" | "no" | "prefer_not_to_say",
    }),
  };
  await db
    .from("onboarding_profiles")
    .update({ nutrition_preference: nutrition, safety_flags })
    .eq("user_id", userId);
  // Her own earlier plan choice would override the corrected answer, so clear it.
  await db.from("member_diet_pref").delete().eq("user_id", userId);
  await audit(supabase, user.id, "client.questionnaire_update", userId, {
    before: {
      nutrition: before?.nutrition_preference,
      pregnancy: flags.pregnancy_context,
      limitations: flags.limitations,
    },
    after: { nutrition, pregnancy, limitations },
  });
  revalidatePath("/home");
  revalidatePath("/accountability/diet");
  back("saved=1");
}

/* ------------------------------------------------------- quick coach message */
/** A coach sends a short message that appears in the member's notifications (and as a push later). */
export async function sendCoachMessage(
  userId: string,
  formData: FormData,
): Promise<void> {
  const { supabase, user } = await requireStaff(["owner", "admin", "coach"]);
  const back =
    str(formData, "back") === "client"
      ? `/admin/users/${userId}`
      : "/admin/accountability";
  const message = str(formData, "message", 500);
  if (!message) redirect(`${back}?error=message`);
  await notifyUser(userId, {
    kind: "coach",
    title: "A message from your CK coach",
    body: message,
    link: "/notifications",
  });
  await audit(supabase, user.id, "coach.message", userId, { message });
  redirect(`${back}?sent=1`);
}

/** Owner/admin/support: sends the member the sign-up confirmation email again (only if still unconfirmed). */
export async function resendConfirmation(userId: string): Promise<void> {
  const { supabase, user, db } = await requireStaff(SUPPORT);
  const { data } = await db.auth.admin.getUserById(userId);
  if (!data?.user?.email || data.user.email_confirmed_at)
    redirect(`/admin/users/${userId}?error=confirm`);
  const ok = await resendConfirmationEmail(db, data.user.email);
  await audit(supabase, user.id, "client.resend_confirmation", userId, { ok });
  redirect(`/admin/users/${userId}?${ok ? "sent=confirm" : "error=confirm"}`);
}
