import "server-only";
import { canAccess, type AccessLevel } from "@ck/core";
import type { AppContext } from "@/lib/app";
import { getViewer } from "@/lib/viewer";

export interface TodayWorkout {
  /** For example "Today · Week 2 · Day 2" */
  label: string;
  title: string;
  subtitle: string;
  /** Link to the current lesson, if she is in a program. */
  href: string | null;
  /** A session is planned for today (or already done). */
  scheduled: boolean;
  cover: string | null;
  /** Remaining (not yet completed) lessons in her current week or phase. */
  section: { title: string; remaining: number } | null;
}

/** What the Today card shows: her current program step if she has one, else her planned session. */
export async function getTodayWorkout({
  supabase,
  user,
  today,
}: AppContext): Promise<TodayWorkout> {
  const [{ data: planned }, { data: enr }] = await Promise.all([
    supabase
      .from("scheduled_actions")
      .select("id")
      .eq("user_id", user.id)
      .eq("action_type", "workout")
      .eq("scheduled_for", today)
      .in("status", ["planned", "completed"])
      .maybeSingle(),
    supabase
      .from("program_enrollments")
      .select("current_lesson_id,programs(slug,title,cover_path)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const program = (enr?.programs ?? null) as {
    slug: string;
    title: string;
    cover_path: string | null;
  } | null;
  if (enr && program && enr.current_lesson_id) {
    const { data: lesson } = await supabase
      .from("lesson_outline")
      .select("id,title,duration_minutes,section_id")
      .eq("id", enr.current_lesson_id)
      .maybeSingle();
    if (lesson) {
      const [{ data: section }, { data: siblings }, { data: done }] = await Promise.all([
        supabase
          .from("program_sections")
          .select("title")
          .eq("id", lesson.section_id)
          .maybeSingle(),
        supabase
          .from("lesson_outline")
          .select("id,order_index")
          .eq("section_id", lesson.section_id)
          .order("order_index"),
        supabase
          .from("lesson_progress")
          .select("lesson_id")
          .eq("user_id", user.id)
          .not("completed_at", "is", null),
      ]);
      const ids = ((siblings ?? []) as { id: string }[]).map((l) => l.id);
      const doneSet = new Set(
        ((done ?? []) as { lesson_id: string }[]).map((d) => d.lesson_id),
      );
      const dayNumber = ids.indexOf(lesson.id) + 1;
      const sectionTitle = section?.title ?? "";
      return {
        label: ["Today", sectionTitle, dayNumber > 0 ? `Day ${dayNumber}` : ""]
          .filter(Boolean)
          .join(" · "),
        title: lesson.title,
        subtitle: `${lesson.duration_minutes ? `${lesson.duration_minutes} min · ` : ""}${program.title}`,
        href: `/programs/${program.slug}/${lesson.id}`,
        scheduled: Boolean(planned),
        cover: coverUrl(program.cover_path),
        section: sectionTitle
          ? {
              title: sectionTitle,
              remaining: ids.filter((id) => !doneSet.has(id)).length,
            }
          : null,
      };
    }
  }
  if (planned)
    return {
      label: "Today",
      title: "Training session",
      subtitle: "Your planned workout",
      href: null,
      scheduled: true,
      cover: null,
      section: null,
    };
  return {
    label: "Today",
    title: "Rest or move gently",
    subtitle: "No session planned. A walk counts.",
    href: null,
    scheduled: false,
    cover: null,
    section: null,
  };
}

export interface LessonRow {
  id: string;
  section_id: string;
  title: string;
  content_type: string;
  duration_minutes: number | null;
  order_index: number;
  effective_access: AccessLevel;
}

/** Ordered lessons of a program with their section order, used for lists and previous/next. */
export async function getProgramOutline({ supabase }: AppContext, programId: string) {
  const { data: sections } = await supabase
    .from("program_sections")
    .select("id,title,section_type,order_index")
    .eq("program_id", programId)
    .order("order_index");
  const ids = (sections ?? []).map((s: { id: string }) => s.id);
  const { data: lessons } = ids.length
    ? await supabase
        .from("lesson_outline")
        .select("*")
        .in("section_id", ids)
        .order("order_index")
    : { data: [] };
  const bySection = new Map<string, LessonRow[]>();
  for (const l of (lessons ?? []) as LessonRow[])
    bySection.set(l.section_id, [...(bySection.get(l.section_id) ?? []), l]);
  const outline = (
    (sections ?? []) as { id: string; title: string; section_type: string }[]
  ).map((s) => ({ ...s, lessons: bySection.get(s.id) ?? [] }));
  return { outline, flat: outline.flatMap((s) => s.lessons) };
}

export async function canViewLevel(level: AccessLevel): Promise<boolean> {
  const { viewer } = await getViewer();
  return canAccess(viewer, level);
}

export function coverUrl(path: string | null): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return path && base
    ? `${base}/storage/v1/object/public/program-thumbnails/${path}`
    : null;
}

/**
 * Loads a program by slug. The newest database columns are requested first; if a deploy lands a
 * moment before its migration, fall back to the long-standing columns instead of showing "not found".
 */
export async function fetchProgramBySlug<T>(
  supabase: AppContext["supabase"],
  slug: string,
  base: string,
  extra: string,
): Promise<T | null> {
  const full = await supabase
    .from("programs")
    .select(`${base},${extra}`)
    .eq("slug", slug)
    .maybeSingle();
  if (!full.error) return (full.data ?? null) as T | null;
  const old = await supabase.from("programs").select(base).eq("slug", slug).maybeSingle();
  return (old.data ?? null) as T | null;
}
