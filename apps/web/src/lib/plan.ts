import "server-only";
import { addDays, dayOfWeek, weekStart } from "@ck/core";
import type { AppContext } from "@/lib/app";

export interface Plan {
  weekly_target_workouts: number;
  preferred_days: number[];
  reminder_time: string;
}

/** Returns her plan, creating a sensible one if onboarding did not (should be rare). */
export async function ensurePlan({ supabase, user }: AppContext): Promise<Plan> {
  const { data } = await supabase
    .from("accountability_plans")
    .select("weekly_target_workouts,preferred_days,reminder_time")
    .eq("user_id", user.id)
    .maybeSingle();
  if (data) return data as Plan;
  const fresh = {
    weekly_target_workouts: 3,
    preferred_days: [0, 2, 4],
    reminder_time: "07:00",
  };
  await supabase.from("accountability_plans").insert({ user_id: user.id, ...fresh });
  return fresh;
}

/** The days she will actually train: preferred days, limited to her weekly target. */
export function plannedDays(plan: Plan): number[] {
  return [...plan.preferred_days].sort().slice(0, plan.weekly_target_workouts);
}

/**
 * Makes sure this week has a planned workout on each training day from today on. Safe to repeat:
 * existing rows are left alone and the database allows only one workout per day.
 */
export async function ensureWeekPlanned(ctx: AppContext, plan: Plan) {
  const { supabase, user, today, profile } = ctx;
  const start = weekStart(today);
  const firstDay = profile
    ? [start, profile.created_at.slice(0, 10)].sort().pop()!
    : start;
  const days = plannedDays(plan)
    .map((dow) => addDays(start, dow))
    .filter((d) => d >= today && d >= firstDay);
  if (days.length === 0) return;
  const { data: existing } = await supabase
    .from("scheduled_actions")
    .select("scheduled_for,status")
    .eq("user_id", user.id)
    .eq("action_type", "workout")
    .gte("scheduled_for", start)
    .lte("scheduled_for", addDays(start, 6));
  const taken = new Set(
    (existing ?? [])
      .filter(
        (a: { status: string }) => a.status === "planned" || a.status === "completed",
      )
      .map((a: { scheduled_for: string }) => a.scheduled_for),
  );
  // A day she already rescheduled or skipped should not be re-planned.
  const handled = new Set(
    (existing ?? []).map((a: { scheduled_for: string }) => a.scheduled_for),
  );
  const rows = days
    .filter((d) => !taken.has(d) && !handled.has(d))
    .map((d) => ({ user_id: user.id, action_type: "workout", scheduled_for: d }));
  if (rows.length) await supabase.from("scheduled_actions").insert(rows);
}

export const isTrainingDay = (plan: Plan, day: string) =>
  plannedDays(plan).includes(dayOfWeek(day));
