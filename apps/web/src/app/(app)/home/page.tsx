import type { Metadata } from "next";
import Link from "next/link";
import {
  addDays,
  bmiLabel,
  buildWeek,
  calcBmi,
  dayScore,
  greeting,
  homeReminders,
  hourIn,
  streakDays,
  weekProgress,
  weekStart,
  weighInStatus,
  MILESTONE_COPY,
  daysBetween,
  type ActionStatus,
  type MilestoneType,
} from "@ck/core";
import { ActionButton } from "@/components/app/ActionButton";
import { DayRing, MiniRing } from "@/components/app/DayRing";
import { LineChart } from "@/components/app/charts";
import { Button, Cap, Card, Flash, Pill } from "@/components/app/ui";
import { activeDays } from "@/lib/milestones";
import { ensurePlan, ensureWeekPlanned } from "@/lib/plan";
import { getContext } from "@/lib/app";
import { getTodayWorkout } from "@/lib/programs";
import { getViewer } from "@/lib/viewer";
import {
  addWater,
  completeWorkout,
  dailyCheckin,
  dismissMilestones,
  recoverWorkout,
  logWeight,
  setSteps,
  toggleBmi,
  undoWater,
} from "../actions";

export const metadata: Metadata = { title: "Home" };

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ log?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await getContext();
  const { supabase, user, profile, today, tz, goals } = ctx;
  const name = profile?.first_name ?? "there";
  const plan = await ensurePlan(ctx);
  await ensureWeekPlanned(ctx, plan);
  const start = weekStart(today);

  const [
    unread,
    habits,
    weekActs,
    todayActs,
    weighs,
    checkin,
    ob,
    newMilestones,
    active,
    workout,
  ] = await Promise.all([
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null),
    supabase
      .from("habit_logs")
      .select("habit_type,value")
      .eq("user_id", user.id)
      .eq("log_date", today),
    supabase
      .from("scheduled_actions")
      .select("id,scheduled_for,status")
      .eq("user_id", user.id)
      .eq("action_type", "workout")
      .gte("scheduled_for", start)
      .lte("scheduled_for", addDays(start, 6)),
    supabase
      .from("scheduled_actions")
      .select("action_type,status")
      .eq("user_id", user.id)
      .eq("scheduled_for", today),
    supabase
      .from("weigh_ins")
      .select("log_date,weight_kg")
      .eq("user_id", user.id)
      .order("log_date", { ascending: true })
      .limit(60),
    supabase
      .from("weekly_checkins")
      .select("id")
      .eq("user_id", user.id)
      .eq("week_start", start)
      .maybeSingle(),
    supabase
      .from("onboarding_profiles")
      .select("height_cm")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("milestones")
      .select("milestone_type")
      .eq("user_id", user.id)
      .eq("seen", false),
    activeDays(ctx),
    getTodayWorkout(ctx),
  ]);

  const rows = (habits.data ?? []) as { habit_type: string; value: number }[];
  const waterMl = rows
    .filter((r) => r.habit_type === "water_ml")
    .reduce((s, r) => s + Number(r.value), 0);
  const steps = Number(rows.find((r) => r.habit_type === "steps")?.value ?? 0);
  const todaysActions = (todayActs.data ?? []) as {
    action_type: string;
    status: ActionStatus;
  }[];
  const workoutDone = todaysActions.some(
    (a) => a.action_type === "workout" && a.status === "completed",
  );
  const checkinDone = todaysActions.some(
    (a) => a.action_type === "checkin" && a.status === "completed",
  );
  const pct = dayScore({ workoutDone, waterMl, steps, checkinDone }, goals);

  const weekActions = (weekActs.data ?? []) as {
    id: string;
    scheduled_for: string;
    status: ActionStatus;
  }[];
  const week = buildWeek(start, today, weekActions);
  const prog = weekProgress(weekActions);
  const streak = streakDays(active, today);

  const w = (weighs.data ?? []) as { log_date: string; weight_kg: number }[];
  const lastWeigh = w.length ? w[w.length - 1] : null;
  const weigh = weighInStatus(lastWeigh?.log_date ?? null, today, goals);
  const daysInactive = profile?.last_active_at
    ? daysBetween(profile.last_active_at.slice(0, 10), today)
    : 0;
  const reminders = homeReminders({
    firstName: name,
    today,
    weigh,
    checkinDoneThisWeek: Boolean(checkin.data),
    daysInactive,
  });
  const bmi =
    ob.data?.height_cm && lastWeigh
      ? calcBmi(Number(lastWeigh.weight_kg), Number(ob.data.height_cm))
      : null;
  const change =
    w.length >= 2
      ? Math.round((Number(w[w.length - 1].weight_kg) - Number(w[0].weight_kg)) * 10) / 10
      : null;
  const date = new Intl.DateTimeFormat("en-CA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: tz,
  }).format(new Date());
  const milestones = ((newMilestones.data ?? []) as { milestone_type: MilestoneType }[])
    .map((m) => MILESTONE_COPY[m.milestone_type])
    .filter(Boolean);
  const showWeighForm = sp.log === "weight";
  const { viewer } = await getViewer();
  const isMember = viewer.entitlement !== "free";
  // "Still want to train today?" appears a few hours after her reminder time if the session is not done.
  const plannedToday = weekActions.find(
    (a) => a.scheduled_for === today && a.status === "planned",
  );
  const nudgeHour = Number(plan.reminder_time.slice(0, 2)) + 4;
  const hourNow = hourIn(new Date(), tz);
  const showStillTrain =
    Boolean(plannedToday) && !workoutDone && hourNow >= nudgeHour && hourNow < 21;

  const tasks = [
    {
      t: workout.title,
      s: workout.subtitle,
      done: workoutDone,
      pts: goals.weights.workout,
    },
    {
      t: "Hydration",
      s: `${(waterMl / 1000).toFixed(2).replace(/\.?0+$/, "")} of ${goals.waterTargetMl / 1000} L`,
      done: waterMl >= goals.waterTargetMl,
      pts: goals.weights.water,
    },
    {
      t: "Steps",
      s: `${steps.toLocaleString("en-CA")} of ${goals.stepGoal.toLocaleString("en-CA")}`,
      done: steps >= goals.stepGoal,
      pts: goals.weights.steps,
    },
    {
      t: "Daily check-in",
      s: "How are you feeling?",
      done: checkinDone,
      pts: goals.weights.checkin,
    },
  ];

  return (
    <>
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-muted">{date}</p>
          <h1 className="font-display text-[19px] text-brand">
            {greeting(hourIn(new Date(), tz))}, {name}
          </h1>
        </div>
        <Link
          href="/notifications"
          aria-label={
            unread.count ? `Notifications, ${unread.count} unread` : "Notifications"
          }
          className="relative grid size-11 shrink-0 place-items-center rounded-full border-2 border-line bg-surface text-brand"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-5 fill-none stroke-current"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M6 16V11a6 6 0 0112 0v5l2 2H4z" />
            <path d="M10 21h4" />
          </svg>
          {unread.count ? (
            <span className="absolute right-2 top-2 size-2.5 rounded-full border-2 border-surface bg-accent" />
          ) : null}
        </Link>
      </header>

      {sp.error === "weight" ? (
        <Flash tone="error">Enter a weight between 35 and 300 kg.</Flash>
      ) : null}

      {reminders.map((r) => (
        <div
          key={r.id}
          className={`flex items-center gap-3 rounded-2xl border p-3 ${r.id === "weekly_checkin" ? "border-line bg-page" : "border-[#ecdca4] bg-[#fbf5e1]"}`}
        >
          <div className="min-w-0 flex-1">
            <b className="block text-xs leading-snug text-brand">{r.title}</b>
            <span className="text-[11px] text-muted">{r.body}</span>
          </div>
          {r.action === "log_weight" ? (
            <Link
              href="/home?log=weight#weight"
              className="inline-flex min-h-11 items-center rounded-button bg-brand px-4 text-xs font-bold text-on-brand"
            >
              {r.actionLabel}
            </Link>
          ) : r.action === "start_checkin" ? (
            <Link
              href="/accountability/checkin"
              className="inline-flex min-h-11 items-center rounded-button bg-brand px-4 text-xs font-bold text-on-brand"
            >
              {r.actionLabel}
            </Link>
          ) : (
            <ActionButton variant="primary" run={completeWorkout}>
              {r.actionLabel}
            </ActionButton>
          )}
        </div>
      ))}

      {showStillTrain && plannedToday ? (
        <Card className="border-[#ecdca4] bg-[#fbf5e1]">
          <h2 className="text-[13px] font-bold text-brand">
            Still want to train today, {name}?
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            Even a short session counts. Or move it, no problem.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {workout.href ? (
              <Link
                href={workout.href}
                className="inline-flex min-h-11 items-center rounded-button bg-brand px-4 text-xs font-bold text-on-brand"
              >
                Start
              </Link>
            ) : (
              <ActionButton variant="primary" run={completeWorkout}>
                Mark done
              </ActionButton>
            )}
            <ActionButton run={recoverWorkout.bind(null, plannedToday.id, "reschedule")}>
              Reschedule
            </ActionButton>
            <ActionButton run={recoverWorkout.bind(null, plannedToday.id, "rest")}>
              Rest
            </ActionButton>
          </div>
        </Card>
      ) : null}

      {milestones.length > 0 ? (
        <Card className="border-0 bg-gradient-to-r from-accent to-[#e3cc7e]">
          <h2 className="text-[15px] font-bold text-on-accent">{milestones[0].title}</h2>
          <p className="text-xs font-medium text-on-accent">{milestones[0].body}</p>
          <form action={dismissMilestones} className="mt-2">
            <Button variant="primary" className="min-h-9">
              Thanks
            </Button>
          </form>
        </Card>
      ) : null}

      {pct >= 100 ? (
        <Card className="border-0 bg-gradient-to-r from-accent to-[#e3cc7e]">
          <h2 className="text-[15px] font-bold text-on-accent">
            All done today, {name}.
          </h2>
          <p className="text-xs font-medium text-on-accent">
            Rest well. Small steady days add up.
          </p>
        </Card>
      ) : null}

      <Card className="grid grid-cols-[132px_minmax(0,1fr)] items-center gap-3">
        <DayRing pct={pct} />
        <ul className="flex flex-col gap-1.5">
          {tasks.map((t) => (
            <li key={t.t} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`grid size-5 shrink-0 place-items-center rounded-full border-2 ${t.done ? "border-success bg-success text-white" : "border-line"}`}
              >
                {t.done ? (
                  <svg
                    viewBox="0 0 24 24"
                    className="size-3 fill-none stroke-current"
                    strokeWidth="3.5"
                  >
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                ) : null}
              </span>
              <span className="min-w-0 flex-1 text-xs font-semibold leading-tight">
                {t.t}
                <small className="block text-[10.5px] font-medium text-muted">
                  {t.done ? "Done" : t.s}
                </small>
              </span>
              <span className="text-[10px] tabular-nums text-muted">{t.pts}%</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="bg-brand text-on-brand">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-accent">
              {workout.label}
            </p>
            <h2 className="mt-1 text-[15px] font-bold text-on-brand">{workout.title}</h2>
            <p className="mt-0.5 text-[10.5px] text-[#b9bddb]">{workout.subtitle}</p>
          </div>
          {workoutDone ? (
            <Pill tone="gold">Done</Pill>
          ) : workout.href ? (
            <Link
              href={workout.href}
              className="inline-flex min-h-11 min-w-20 items-center justify-center rounded-button bg-accent px-4 text-xs font-bold text-on-accent"
            >
              Start
            </Link>
          ) : workout.scheduled ? (
            <ActionButton variant="gold" run={completeWorkout}>
              Mark done
            </ActionButton>
          ) : null}
        </div>
        {!workout.href && !workoutDone && !workout.scheduled ? (
          <Link
            href="/programs"
            className="mt-3 inline-flex min-h-11 items-center rounded-button bg-accent px-4 text-xs font-bold text-on-accent"
          >
            Choose a program
          </Link>
        ) : null}
      </Card>

      <Card>
        <div className="flex items-center gap-3">
          <MiniRing
            pct={waterMl / goals.waterTargetMl}
            label={`Water ${Math.round((waterMl / goals.waterTargetMl) * 100)} percent`}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <h3 className="text-[13px] font-bold text-brand">Water</h3>
              <span className="text-[10.5px] text-muted">
                {(waterMl / 1000).toFixed(2).replace(/\.?0+$/, "") || "0"} /{" "}
                {goals.waterTargetMl / 1000} L
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <ActionButton run={addWater.bind(null, 250)} className="flex-1">
                +250 mL
              </ActionButton>
              <ActionButton run={addWater.bind(null, 500)} className="flex-1">
                +500 mL
              </ActionButton>
              {waterMl > 0 ? (
                <ActionButton
                  variant="link"
                  run={undoWater}
                  ariaLabel="Undo last water entry"
                >
                  Undo
                </ActionButton>
              ) : null}
            </div>
          </div>
        </div>
        <form
          action={setSteps}
          className="mt-3 flex items-end gap-2 border-t border-line pt-3"
        >
          <label className="flex-1 text-xs font-semibold">
            Steps today
            <input
              name="steps"
              type="number"
              inputMode="numeric"
              min={0}
              max={100000}
              defaultValue={steps || ""}
              placeholder="Enter your steps"
              className="mt-1 min-h-11 w-full rounded-2xl border-2 border-line bg-surface px-3 text-sm"
            />
          </label>
          <Button variant="ghost">Save</Button>
        </form>
        <p className="mt-2 text-[10.5px] text-muted">
          Apple Health will fill this in automatically with the iPhone app.
        </p>
      </Card>

      <Card>
        <h3 className="text-[13px] font-bold text-brand">How are you doing today?</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          <ActionButton run={dailyCheckin.bind(null, "strong")}>
            Feeling strong
          </ActionButton>
          <ActionButton run={dailyCheckin.bind(null, "tired")}>Tired</ActionButton>
          <ActionButton run={dailyCheckin.bind(null, "lighter")}>
            Need a lighter day
          </ActionButton>
        </div>
      </Card>

      <div id="weight" className="grid grid-cols-2 gap-2.5">
        <Card>
          <div className="flex items-center justify-between">
            <Cap>Weight</Cap>
            {change !== null ? (
              <Pill tone={change <= 0 ? "success" : "navy"}>
                {change <= 0 ? "↓" : "↑"} {Math.abs(change)} kg
              </Pill>
            ) : null}
          </div>
          <p className="mt-1.5 text-2xl font-extrabold leading-none tracking-tight text-brand tabular-nums">
            {lastWeigh ? Number(lastWeigh.weight_kg).toFixed(1) : "-"}
            <span className="text-xs font-semibold text-muted"> kg</span>
          </p>
          <div className="mt-2 flex gap-1" aria-hidden="true">
            {Array.from({ length: goals.weighInEveryDays }, (_, i) => (
              <i
                key={i}
                className={`h-[5px] flex-1 rounded-full ${i < (weigh.daysSince ?? 0) ? "bg-accent" : "bg-line"}`}
              />
            ))}
          </div>
          <p className="mt-1.5 text-[10.5px] text-muted">
            {weigh.daysSince === null
              ? "Log your first weight"
              : weigh.dueIn > 0
                ? `Next weigh-in in ${weigh.dueIn} day${weigh.dueIn > 1 ? "s" : ""}`
                : "Weigh-in due today"}
          </p>
          <details open={showWeighForm} className="mt-1">
            <summary className="flex min-h-9 cursor-pointer items-center text-[11px] font-bold text-brand underline underline-offset-4">
              Log weight
            </summary>
            <form action={logWeight} className="mt-2 flex flex-col gap-2">
              <label className="text-xs font-semibold">
                Weight (kg)
                <input
                  name="weight"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min={35}
                  max={300}
                  required
                  defaultValue={lastWeigh ? Number(lastWeigh.weight_kg).toFixed(1) : ""}
                  className="mt-1 min-h-11 w-full rounded-2xl border-2 border-line bg-surface px-3 text-sm"
                />
              </label>
              <Button variant="primary">Save weight</Button>
            </form>
          </details>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <Cap>BMI</Cap>
            <form action={toggleBmi}>
              <button className="min-h-9 text-[10px] font-bold text-brand underline underline-offset-4">
                {profile?.hide_bmi ? "Show" : "Hide"}
              </button>
            </form>
          </div>
          {profile?.hide_bmi || !bmi ? (
            <p className="mt-3 text-[11.5px] text-muted">
              {profile?.hide_bmi
                ? "Hidden. You can show it any time."
                : "Log a weight to see this."}
            </p>
          ) : (
            <>
              <p className="mt-1.5 text-2xl font-extrabold leading-none tracking-tight text-brand tabular-nums">
                {bmi}
              </p>
              <span className="mt-2 inline-block">
                <Pill tone="navy">{bmiLabel(bmi)}</Pill>
              </span>
              <p className="mt-2 text-[10.5px] text-muted">
                For information only, not a diagnosis.
              </p>
            </>
          )}
        </Card>
      </div>

      {w.length >= 2 ? (
        <Card>
          <Cap>Weight trend</Cap>
          <div className="mt-1">
            <LineChart
              label="Your weight over time"
              unit=" kg"
              points={w
                .slice(-8)
                .map((p) => ({ x: p.log_date.slice(5), y: Number(p.weight_kg) }))}
            />
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-bold text-brand">This week</h3>
          {streak >= 2 ? <Pill tone="gold">{streak} days in a row</Pill> : null}
        </div>
        <ol className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] text-muted">
          {week.map((d) => (
            <li key={d.date} className="flex flex-col items-center gap-1">
              {DAYS[d.dow]}
              <span
                aria-label={`${d.date}: ${d.state}`}
                className={`grid size-6 place-items-center rounded-full border-2 text-[10px] ${d.state === "done" ? "border-success bg-success text-white" : d.state === "planned" ? "border-accent" : d.state === "missed" ? "border-dashed border-muted" : d.isToday ? "border-brand" : "border-line"}`}
              >
                {d.state === "done" ? "✓" : ""}
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-3 flex justify-between text-[10.5px] text-muted">
          <span>
            {prog.completed} of {prog.planned} workouts
          </span>
          <Link
            href="/accountability"
            className="font-bold text-brand underline underline-offset-4"
          >
            My Week
          </Link>
        </div>
      </Card>

      {!isMember ? (
        <Card className="bg-page">
          <Cap>CK Membership</Cap>
          <h3 className="mt-1 text-[13px] font-bold text-brand">
            Unlock the complete CK experience
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            The full program library and member accountability.
          </p>
          <Link
            href="/membership"
            className="mt-2 inline-flex min-h-11 items-center rounded-button bg-brand px-4 text-xs font-bold text-on-brand"
          >
            See what is included
          </Link>
        </Card>
      ) : null}

      <div className="flex items-center gap-3 rounded-card border-2 border-dashed border-line p-3">
        <div className="min-w-0 flex-1">
          <b className="block text-xs text-brand">Apple Health</b>
          <p className="text-[10.5px] text-muted">
            Connect to fill steps automatically. Arrives with the iPhone app.
          </p>
        </div>
        <Pill tone="navy">Soon</Pill>
      </div>
    </>
  );
}
