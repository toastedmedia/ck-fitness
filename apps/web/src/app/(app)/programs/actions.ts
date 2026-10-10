"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/app";
import { queueCrm, track } from "@/lib/events";
import { awardMilestones } from "@/lib/milestones";
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
  const { supabase, user, today } = ctx;
  const now = new Date().toISOString();

  const { data: prior } = await supabase
    .from("lesson_progress")
    .select("completed_at")
    .eq("user_id", user.id)
    .eq("lesson_id", lessonId)
    .maybeSingle();
  const row = { completed_at: prior?.completed_at ?? now, completion_source: "manual" };
  const { error } = prior
    ? await supabase
        .from("lesson_progress")
        .update(row)
        .eq("user_id", user.id)
        .eq("lesson_id", lessonId)
    : await supabase
        .from("lesson_progress")
        .insert({ user_id: user.id, lesson_id: lessonId, ...row });
  if (error) redirect(`/programs/${slug}?error=locked`);

  const { flat } = await getProgramOutline(ctx, programId);
  const idx = flat.findIndex((l) => l.id === lessonId);
  const next = idx >= 0 ? flat[idx + 1] : undefined;

  // Count it as today's workout once, the first time she completes this lesson.
  if (!prior?.completed_at) {
    const { data: planned } = await supabase
      .from("scheduled_actions")
      .select("id")
      .eq("user_id", user.id)
      .eq("action_type", "workout")
      .eq("scheduled_for", today)
      .eq("status", "planned")
      .maybeSingle();
    if (planned)
      await supabase
        .from("scheduled_actions")
        .update({ status: "completed", completed_at: now, linked_lesson_id: lessonId })
        .eq("id", planned.id);
    else {
      const { data: done } = await supabase
        .from("scheduled_actions")
        .select("id")
        .eq("user_id", user.id)
        .eq("action_type", "workout")
        .eq("scheduled_for", today)
        .eq("status", "completed")
        .maybeSingle();
      if (!done)
        await supabase.from("scheduled_actions").insert({
          user_id: user.id,
          action_type: "workout",
          scheduled_for: today,
          status: "completed",
          completed_at: now,
          linked_lesson_id: lessonId,
        });
    }
  }

  await supabase
    .from("program_enrollments")
    .update(
      next ? { current_lesson_id: next.id } : { status: "completed", completed_at: now },
    )
    .eq("user_id", user.id)
    .eq("program_id", programId);

  if (!prior?.completed_at)
    await track(user.id, "lesson_completed", { lesson: lessonId });
  if (!next) {
    await track(user.id, "program_completed", { program: slug });
    await queueCrm(user.id, "program_completed", { program: slug });
  }
  await awardMilestones(ctx);
  revalidatePath("/", "layout");
  redirect(next ? `/programs/${slug}/${next.id}` : `/programs/${slug}?done=1`);
}
