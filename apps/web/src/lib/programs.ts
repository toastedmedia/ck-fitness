import "server-only";
import { canAccess, type AccessLevel } from "@ck/core";
import type { AppContext } from "@/lib/app";
import { getViewer } from "@/lib/viewer";

export interface TodayWorkout {
  label: string;
  title: string;
  subtitle: string;
  href: string | null;
  scheduled: boolean;
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
      .select("current_lesson_id,programs(slug,title)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const program = (enr?.programs ?? null) as { slug: string; title: string } | null;
  if (enr && program && enr.current_lesson_id) {
    const { data: lesson } = await supabase
      .from("lesson_outline")
      .select("id,title,duration_minutes")
      .eq("id", enr.current_lesson_id)
      .maybeSingle();
    if (lesson) {
      return {
        label: planned ? "Today" : "Up next",
        title: lesson.title,
        subtitle: `${program.title}${lesson.duration_minutes ? ` · ${lesson.duration_minutes} min` : ""}`,
        href: `/programs/${program.slug}/${lesson.id}`,
        scheduled: Boolean(planned),
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
    };
  return {
    label: "Today",
    title: "Rest or move gently",
    subtitle: "No session planned. A walk counts.",
    href: null,
    scheduled: false,
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
