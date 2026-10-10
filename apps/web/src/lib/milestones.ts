import "server-only";
import {
  addDays,
  milestonesEarned,
  streakDays,
  weekStart,
  weekProgress,
  type ActionStatus,
} from "@ck/core";
import type { AppContext } from "@/lib/app";

/** Active days: any day she logged water, steps, a weigh-in or completed something. */
export async function activeDays(
  { supabase, user, today }: AppContext,
  sinceDays = 60,
): Promise<string[]> {
  const since = addDays(today, -sinceDays);
  const [habits, actions, weighs] = await Promise.all([
    supabase
      .from("habit_logs")
      .select("log_date")
      .eq("user_id", user.id)
      .gte("log_date", since),
    supabase
      .from("scheduled_actions")
      .select("scheduled_for")
      .eq("user_id", user.id)
      .eq("status", "completed")
      .gte("scheduled_for", since),
    supabase
      .from("weigh_ins")
      .select("log_date")
      .eq("user_id", user.id)
      .gte("log_date", since),
  ]);
  const days = [
    ...(habits.data ?? []).map((r: { log_date: string }) => r.log_date),
    ...(actions.data ?? []).map((r: { scheduled_for: string }) => r.scheduled_for),
    ...(weighs.data ?? []).map((r: { log_date: string }) => r.log_date),
  ];
  return [...new Set(days)];
}

/** Records any newly earned milestones. Called after she completes something. */
export async function awardMilestones(ctx: AppContext) {
  const { supabase, user, today } = ctx;
  const { data: done } = await supabase
    .from("scheduled_actions")
    .select("scheduled_for,status")
    .eq("user_id", user.id)
    .eq("action_type", "workout")
    .in("status", ["planned", "completed"]);
  const rows = (done ?? []) as { scheduled_for: string; status: ActionStatus }[];
  const completedWorkouts = rows.filter((r) => r.status === "completed").length;

  const weeks = new Map<string, { scheduled_for: string; status: ActionStatus }[]>();
  for (const r of rows) {
    const w = weekStart(r.scheduled_for);
    weeks.set(w, [...(weeks.get(w) ?? []), r]);
  }
  const thisWeek = weekStart(today);
  const fullWeeks = [...weeks.entries()].filter(([w, a]) => {
    const p = weekProgress(a);
    return w < thisWeek && p.planned > 0 && p.completed === p.planned;
  }).length;

  const { count: lessons } = await supabase
    .from("lesson_progress")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .not("completed_at", "is", null);

  const earned = milestonesEarned({
    completedWorkouts,
    streak: streakDays(await activeDays(ctx), today),
    fullWeeks,
    programLessons: lessons ?? 0,
  });
  if (earned.length === 0) return;
  await supabase.from("milestones").upsert(
    earned.map((milestone_type) => ({ user_id: user.id, milestone_type })),
    {
      onConflict: "user_id,milestone_type",
      ignoreDuplicates: true,
    },
  );
}
