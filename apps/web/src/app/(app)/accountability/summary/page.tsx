import type { Metadata } from "next";
import Link from "next/link";
import { addDays, weekProgress, weekStart, type ActionStatus } from "@ck/core";
import { Cap, Card, Flash, Pill } from "@/components/app/ui";
import { getContext } from "@/lib/app";
import { ensurePlan, plannedDays } from "@/lib/plan";
import { getTodayWorkout } from "@/lib/programs";
import { flags } from "@/lib/flags";
import { getViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Weekly summary" };

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** This week at a glance. Members also see program adherence and their next best step. */
export default async function SummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await getContext();
  const { supabase, user, today, goals } = ctx;
  const { viewer } = await getViewer();
  const plan = await ensurePlan(ctx);
  const start = weekStart(today);
  const end = addDays(start, 6);

  const [acts, water, checkin, enr, workout] = await Promise.all([
    supabase
      .from("scheduled_actions")
      .select("scheduled_for,status")
      .eq("user_id", user.id)
      .eq("action_type", "workout")
      .gte("scheduled_for", start)
      .lte("scheduled_for", end),
    supabase
      .from("habit_logs")
      .select("log_date,value")
      .eq("user_id", user.id)
      .eq("habit_type", "water_ml")
      .gte("log_date", start)
      .lte("log_date", end),
    supabase
      .from("weekly_checkins")
      .select("energy,sleep,soreness,confidence,obstacle,next_week_target")
      .eq("user_id", user.id)
      .eq("week_start", start)
      .maybeSingle(),
    supabase
      .from("program_enrollments")
      .select("program_id,status,programs(title,slug)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle(),
    getTodayWorkout(ctx),
  ]);
  const prog = weekProgress(
    (acts.data ?? []) as { scheduled_for: string; status: ActionStatus }[],
  );
  const perDay = new Map<string, number>();
  for (const r of (water.data ?? []) as { log_date: string; value: number }[])
    perDay.set(r.log_date, (perDay.get(r.log_date) ?? 0) + Number(r.value));
  const waterDays = [...perDay.values()].filter((v) => v >= goals.waterTargetMl).length;
  const daysSoFar = Math.min(
    7,
    Math.round(
      (new Date(`${today}T00:00:00Z`).getTime() -
        new Date(`${start}T00:00:00Z`).getTime()) /
        86_400_000,
    ) + 1,
  );
  const ci = checkin.data as {
    energy: number;
    sleep: number;
    soreness: number;
    confidence: number;
    obstacle: string | null;
    next_week_target: number;
  } | null;
  const program = (enr.data?.programs ?? null) as { title: string; slug: string } | null;
  const isMember = viewer.entitlement !== "free";

  return (
    <>
      <h1 className="sr-only">Your week</h1>
      {sp.saved ? <Flash>Check-in saved. Here is your week.</Flash> : null}
      <Card>
        <Cap>Workouts</Cap>
        <p className="mt-1 text-2xl font-extrabold text-brand">
          {prog.completed} of {prog.planned}
        </p>
        <p className="text-xs text-muted">
          Consistency {prog.consistency}%.{" "}
          {prog.completed > 0
            ? "Every session counts."
            : "One session is a great way to start the week."}
        </p>
      </Card>
      <Card>
        <Cap>Water</Cap>
        <p className="mt-1 text-2xl font-extrabold text-brand">
          {waterDays} of {daysSoFar} days
        </p>
        <p className="text-xs text-muted">
          You reached your water target on {waterDays} day{waterDays === 1 ? "" : "s"} so
          far this week.
        </p>
      </Card>
      <Card>
        <div className="flex items-center justify-between">
          <Cap>Weekly check-in</Cap>
          {ci ? <Pill>Done</Pill> : <Pill tone="gold">Not yet</Pill>}
        </div>
        {ci ? (
          <p className="mt-1 text-xs">
            Energy {ci.energy}/5 · Sleep {ci.sleep}/5 · Soreness {ci.soreness}/5 ·
            Confidence {ci.confidence}/5
            {ci.obstacle ? ` · Got in the way: ${ci.obstacle.replace("_", " ")}` : ""}
          </p>
        ) : (
          <Link
            href="/accountability/checkin"
            className="mt-2 inline-flex min-h-11 items-center rounded-button bg-brand px-4 text-xs font-bold text-on-brand"
          >
            Do your check-in
          </Link>
        )}
      </Card>
      <Card>
        <Cap>Next week&apos;s commitment</Cap>
        <p className="mt-1 text-sm font-bold text-brand">
          {ci?.next_week_target ?? plan.weekly_target_workouts} workouts
        </p>
        <p className="text-xs text-muted">
          {plannedDays(plan)
            .map((d) => DAYS[d])
            .join(", ") || "No days chosen yet"}
          .{" "}
          <Link href="/accountability" className="font-bold text-brand underline">
            Change
          </Link>
        </p>
      </Card>
      {flags.progressPhotos ? (
        <Card>
          <Cap>Weekly photos</Cap>
          <p className="mt-1 text-xs text-muted">
            Optional. Front, side, back and arms raised, once a week. Private to you.
          </p>
          <Link
            href="/progress/photos"
            className="mt-2 inline-flex min-h-11 items-center rounded-button border-2 border-line px-4 text-xs font-bold text-brand"
          >
            Add this week&apos;s photos
          </Link>
        </Card>
      ) : null}
      {isMember ? (
        <Card>
          <Cap>Member extras</Cap>
          <p className="mt-1 text-xs">
            Training: <b>{program?.title ?? "No active training"}</b>. Training sessions
            completed: {prog.completed} of {prog.planned} planned.
          </p>
          <p className="mt-2 text-xs text-muted">Next best step</p>
          {workout.href ? (
            <Link
              href={workout.href}
              className="mt-1 inline-flex min-h-11 items-center rounded-button bg-accent px-4 text-xs font-bold text-on-accent"
            >
              {workout.title}
            </Link>
          ) : (
            <Link
              href="/programs"
              className="mt-1 inline-flex min-h-11 items-center rounded-button bg-accent px-4 text-xs font-bold text-on-accent"
            >
              Choose a training
            </Link>
          )}
        </Card>
      ) : null}
    </>
  );
}
