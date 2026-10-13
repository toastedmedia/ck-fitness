"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  audienceMatches,
  canManageRole,
  parseProgramImport,
  resolveMembership,
  validateForPublish,
  STAFF_ROLES,
  type AudienceKey,
} from "@ck/core";
import { CONTENT, OPS, SUPPORT, audit, requireStaff } from "@/lib/admin";
import { processCrmQueue } from "@/lib/crm";
import { notifyUser } from "@/lib/events";
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
    membership_price_amount: JSON.stringify(
      Number(formData.get("price_amount")) > 0
        ? Number(formData.get("price_amount"))
        : 29.99,
    ),
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
