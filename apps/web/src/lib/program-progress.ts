import "server-only";
import { summarizeProgress, type MemberProgress } from "@ck/core";
import type { createAdminSupabase } from "@/lib/supabase/admin";

export interface ProgressMember extends MemberProgress {
  name: string;
  email: string;
}

/** Reads enrolments and lesson progress for one program (service role; callers must be staff). */
export async function loadProgramProgress(
  db: ReturnType<typeof createAdminSupabase>,
  programId: string,
) {
  const { data: secs } = await db
    .from("program_sections")
    .select("id")
    .eq("program_id", programId);
  const sectionIds = (secs ?? []).map((s: { id: string }) => s.id);
  const { data: ls } = sectionIds.length
    ? await db
        .from("lessons")
        .select("id")
        .in("section_id", sectionIds)
        .eq("published", true)
    : { data: [] as { id: string }[] };
  const lessonIds = (ls ?? []).map((l: { id: string }) => l.id);
  const [{ data: enr }, { data: rows }] = await Promise.all([
    db
      .from("program_enrollments")
      .select("user_id,status,started_at")
      .eq("program_id", programId)
      .order("started_at", { ascending: false })
      .limit(5000),
    lessonIds.length
      ? db
          .from("lesson_progress")
          .select("user_id,completed_at,play_count,last_watched_at")
          .in("lesson_id", lessonIds)
          .limit(100000)
      : Promise.resolve({ data: [] }),
  ]);
  const enrollments = (enr ?? []) as {
    user_id: string;
    status: string;
    started_at: string;
  }[];
  const ids = enrollments.map((e) => e.user_id);
  const { data: profs } = ids.length
    ? await db
        .from("profiles")
        .select("user_id,first_name,last_name,email")
        .in("user_id", ids)
    : { data: [] };
  const byId = new Map(
    (
      (profs ?? []) as {
        user_id: string;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
      }[]
    ).map((p) => [p.user_id, p]),
  );
  const mine = new Set(ids);
  const summary = summarizeProgress(
    enrollments,
    (
      (rows ?? []) as {
        user_id: string;
        completed_at: string | null;
        play_count: number | null;
        last_watched_at: string | null;
      }[]
    ).filter((r) => mine.has(r.user_id)),
    lessonIds.length,
  );
  const members: ProgressMember[] = summary.members.map((m) => {
    const p = byId.get(m.userId);
    return {
      ...m,
      name: [p?.first_name, p?.last_name].filter(Boolean).join(" ") || "(no name)",
      email: p?.email ?? "",
    };
  });
  return { ...summary, members, totalLessons: lessonIds.length };
}
