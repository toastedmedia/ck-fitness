"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/app";
import { track } from "@/lib/events";
import { markLessonComplete } from "@/lib/lesson-complete";
import { getProgramOutline } from "@/lib/programs";

/** Enrols her (the database refuses if the program is locked for her) and opens the first step. */
export async function startProgram(programId: string, slug: string): Promise<void> {
  const ctx = await getContext();
  const { supabase, user } = ctx;
  const { data: existing } = await supabase
    .from("program_enrollments")
    .select("id,current_lesson_id")
    .eq("user_id", user.id)
    .eq("program_id", programId)
    .maybeSingle();
  const { flat } = await getProgramOutline(ctx, programId);
  const first = existing?.current_lesson_id ?? flat[0]?.id ?? null;
  if (!existing) {
    const { error } = await supabase
      .from("program_enrollments")
      .insert({ user_id: user.id, program_id: programId, current_lesson_id: first });
    if (error) redirect(`/programs/${slug}?error=locked`);
    await track(user.id, "program_started", { program: slug });
  }
  revalidatePath("/", "layout");
  redirect(first ? `/programs/${slug}/${first}` : `/programs/${slug}`);
}

/** Marks a lesson done, counts it as today's workout, moves her to the next step. */
export async function completeLesson(
  lessonId: string,
  programId: string,
  slug: string,
): Promise<void> {
  const ctx = await getContext();
  const r = await markLessonComplete(ctx, lessonId, programId, slug, "manual");
  if (!r.ok) redirect(`/programs/${slug}?error=locked`);
  redirect(r.nextId ? `/programs/${slug}/${r.nextId}` : `/programs/${slug}?done=1`);
}
