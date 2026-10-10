import type { Metadata } from "next";
import Link from "next/link";
import {
  addDays,
  buildWeek,
  streakDays,
  weekProgress,
  weekStart,
  MILESTONE_COPY,
  type ActionStatus,
  type MilestoneType,
} from "@ck/core";
import { ActionButton } from "@/components/app/ActionButton";
import { DayPicker } from "@/components/app/Scale";
import { Button, Cap, Card, Flash, Pill } from "@/components/app/ui";
import { getContext } from "@/lib/app";
import { activeDays } from "@/lib/milestones";
import { ensurePlan, ensureWeekPlanned } from "@/lib/plan";
import { recoverWorkout, setCommitment } from "../actions";

export const metadata: Metadata = { title: "Accountability" };

const NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const STATE_LABEL = {
  done: "Done",
  planned: "Planned",
  missed: "Missed",
  rescheduled: "Moved",
  rest: "Rest",
} as const;

export default async function AccountabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await getContext();
  const { supabase, user, today } = ctx;
  const plan = await ensurePlan(ctx);
  await ensureWeekPlanned(ctx, plan);
  const start = weekStart(today);
  const [acts, checkin, milestones, active] = await Promise.all([
    supabase
      .from("scheduled_actions")
      .select("id,scheduled_for,status")
      .eq("user_id", user.id)
      .eq("action_type", "workout")
      .gte("scheduled_for", start)
      .lte("scheduled_for", addDays(start, 6)),
    supabase
      .from("weekly_checkins")
      .select("id")
      .eq("user_id", user.id)
      .eq("week_start", start)
      .maybeSingle(),
    supabase
      .from("milestones")
      .select("milestone_type")
      .eq("user_id", user.id)
      .order("achieved_at"),
    activeDays(ctx),
  ]);
  const actions = (acts.data ?? []) as {
    id: string;
    scheduled_for: string;
    status: ActionStatus;
  }[];
  const week = buildWeek(start, today, actions);
  const prog = weekProgress(actions);
  const streak = streakDays(active, today);
  const missed = week
    .filter((d) => d.state === "missed")
    .map((d) => ({
      day: d,
      action: actions.find((a) => a.scheduled_for === d.date && a.status === "planned")!,
    }));
  const earned = ((milestones.data ?? []) as { milestone_type: MilestoneType }[])
    .map((m) => MILESTONE_COPY[m.milestone_type])
    .filter(Boolean);

  return (
    <>
      <h1 className="font-display text-[19px] text-brand">My Week</h1>
      {sp.saved ? <Flash>Saved.</Flash> : null}
      {sp.error === "days" ? (
        <Flash tone="error">Pick at least one training day.</Flash>
      ) : null}

      <Card>
        <ol className="grid grid-cols-7 gap-1 text-center">
          {week.map((d) => (
            <li
              key={d.date}
              className="flex flex-col items-center gap-1 text-[10px] text-muted"
            >
              {NAMES[d.dow]}
              <span
                aria-hidden="true"
                className={`grid size-8 place-items-center rounded-full border-2 text-xs ${d.state === "done" ? "border-success bg-success text-white" : d.state === "planned" ? "border-accent" : d.state === "missed" ? "border-dashed border-muted" : d.isToday ? "border-brand" : "border-line bg-page"}`}
              >
                {d.state === "done" ? "✓" : ""}
              </span>
              <span className="font-semibold text-ink">{STATE_LABEL[d.state]}</span>
            </li>
          ))}
        </ol>
        <div className="mt-3 flex items-center justify-between">
          <div>
            <Cap>Consistency</Cap>
            <p className="text-xl font-extrabold text-brand">{prog.consistency}%</p>
          </div>
          <p className="text-right text-xs text-muted">
            {prog.completed} of {prog.planned} workouts
            <br />
            {streak >= 2 ? `${streak} days in a row` : "Every day counts"}
          </p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-success"
            style={{ width: `${prog.consistency}%` }}
          />
        </div>
      </Card>

      {missed.map(({ day, action }) =>
        action ? (
          <Card key={action.id} className="border-[#ecdca4] bg-[#fbf5e1]">
            <Cap>One missed day does not end the week</Cap>
            <h2 className="mt-1 text-sm font-bold text-brand">
              {NAMES[day.dow]} slipped by. Want to move it?
            </h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <ActionButton
                variant="primary"
                run={recoverWorkout.bind(null, action.id, "reschedule")}
              >
                Reschedule
              </ActionButton>
              <ActionButton run={recoverWorkout.bind(null, action.id, "rest")}>
                Rest
              </ActionButton>
              <ActionButton run={recoverWorkout.bind(null, action.id, "skip")}>
                Skip
              </ActionButton>
              <Link
                href="/accountability/help"
                className="inline-flex min-h-11 items-center px-2 text-xs font-bold text-brand underline underline-offset-4"
              >
                Need help
              </Link>
            </div>
          </Card>
        ) : null,
      )}

      <Card>
        <Cap>Weekly check-in</Cap>
        {checkin.data ? (
          <p className="mt-1 text-xs text-muted">Done for this week. Thank you.</p>
        ) : (
          <>
            <p className="mt-1 text-xs text-muted">
              A one-minute reflection that helps plan next week.
            </p>
            <Link
              href="/accountability/checkin"
              className="mt-2 inline-flex min-h-11 items-center rounded-button bg-brand px-4 text-xs font-bold text-on-brand"
            >
              Do your weekly check-in
            </Link>
          </>
        )}
      </Card>

      <Card>
        <Cap>Weekly commitment</Cap>
        <form action={setCommitment} className="mt-2 flex flex-col gap-3">
          <label className="text-xs font-bold text-brand">
            Workouts this week
            <select
              name="target"
              defaultValue={plan.weekly_target_workouts}
              className="mt-1 min-h-11 w-full rounded-2xl border-2 border-line bg-surface px-3 text-sm font-normal"
            >
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <DayPicker selected={plan.preferred_days} />
          <label className="text-xs font-bold text-brand">
            Reminder time
            <input
              name="time"
              type="time"
              defaultValue={plan.reminder_time.slice(0, 5)}
              className="mt-1 min-h-11 w-full rounded-2xl border-2 border-line bg-surface px-3 text-sm font-normal"
            />
          </label>
          <Button variant="primary">Save</Button>
        </form>
      </Card>

      <Card>
        <Cap>Milestones</Cap>
        {earned.length === 0 ? (
          <p className="mt-1 text-xs text-muted">
            Your first milestone is one workout away.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {earned.map((m) => (
              <li key={m.title} className="flex items-center gap-2 text-xs">
                <Pill tone="gold">Earned</Pill>
                <span>
                  <b>{m.title}.</b> {m.body}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Link
        href="/accountability/summary"
        className="text-center text-xs font-bold text-brand underline underline-offset-4"
      >
        See your weekly summary
      </Link>
      <Link
        href="/accountability/help"
        className="text-center text-xs font-bold text-brand underline underline-offset-4"
      >
        Need help? Talk to a real person
      </Link>
    </>
  );
}
