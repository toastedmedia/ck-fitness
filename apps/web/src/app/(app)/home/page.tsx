import type { Metadata } from "next";
import Link from "next/link";
import {
  addDays,
  attentionItems,
  buildWeek,
  asUnits,
  calcBmi,
  displayWeight,
  ckScore,
  daysBetween,
  greeting,
  hourIn,
  MILESTONE_COPY,
  nextMilestone,
  streakDays,
  supportiveLine,
  weekProgress,
  weekStart,
  weighInStatus,
  type ActionStatus,
  type MilestoneType,
} from "@ck/core";
import { Cap, Card, Flash } from "@/components/app/ui";
import { AppleHealthPreview } from "@/components/home/AppleHealthPreview";
import { BMIWidget } from "@/components/home/BMIWidget";
import { CKScore } from "@/components/home/CKScore";
import { DayProvider } from "@/components/home/DayProvider";
import { HomeHeader } from "@/components/home/HomeHeader";
import { MyCommitment } from "@/components/home/MyCommitment";
import { NeedsAttention } from "@/components/home/NeedsAttention";
import { NextMilestone } from "@/components/home/NextMilestone";
import { TodaysWorkout } from "@/components/home/TodaysWorkout";
import { WaterTracker } from "@/components/home/WaterTracker";
import { WeeklyProgress } from "@/components/home/WeeklyProgress";
import { WeightProgress } from "@/components/home/WeightProgress";
import { getContext } from "@/lib/app";
import { activeDays } from "@/lib/milestones";
import { ensurePlan, ensureWeekPlanned } from "@/lib/plan";
import { getTodayWorkout } from "@/lib/programs";
import { flags } from "@/lib/flags";
import { isNativeApp } from "@/lib/native";
import { getViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Home" };

/**
 * Home: a premium coaching view. The page only gathers data; each section is its own small
 * component in src/components/home, so the layout can change without touching the queries.
 */
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
    dailyCheckin,
    ob,
    newMilestones,
    active,
    workout,
    { viewer, membership },
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
      .from("daily_checkins")
      .select("user_id")
      .eq("user_id", user.id)
      .eq("check_date", today)
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
    getViewer(),
  ]);

  // Today's numbers
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
  const checkinDone =
    Boolean(dailyCheckin.data) ||
    todaysActions.some((a) => a.action_type === "checkin" && a.status === "completed");

  // This week
  const weekActions = (weekActs.data ?? []) as {
    id: string;
    scheduled_for: string;
    status: ActionStatus;
  }[];
  const week = buildWeek(start, today, weekActions);
  const prog = weekProgress(weekActions);
  const streak = streakDays(active, today);
  const plannedToday = weekActions.find(
    (a) => a.scheduled_for === today && a.status === "planned",
  );
  const workoutScheduled = Boolean(plannedToday) || workoutDone;
  const target = plan.weekly_target_workouts;

  // Weight
  const w = (weighs.data ?? []) as { log_date: string; weight_kg: number }[];
  const lastWeigh = w.length ? w[w.length - 1] : null;
  const weigh = weighInStatus(lastWeigh?.log_date ?? null, today, goals);
  const weighDone = lastWeigh?.log_date === today;
  const units = asUnits(profile?.units);
  const bmi =
    ob.data?.height_cm && lastWeigh
      ? calcBmi(Number(lastWeigh.weight_kg), Number(ob.data.height_cm))
      : null;
  const change =
    w.length >= 2
      ? Math.round((Number(w[w.length - 1].weight_kg) - Number(w[0].weight_kg)) * 10) / 10
      : null;

  // What needs attention
  const missedDay = [...week].reverse().find((d) => d.state === "missed");
  const missedAction = missedDay
    ? weekActions.find(
        (a) => a.scheduled_for === missedDay.date && a.status === "planned",
      )
    : undefined;
  const daysInactive = profile?.last_active_at
    ? daysBetween(profile.last_active_at.slice(0, 10), today)
    : 0;
  const hourNow = hourIn(new Date(), tz);
  const nudgeHour = Number(plan.reminder_time.slice(0, 2)) + 4;
  const attention = attentionItems({
    firstName: name,
    today,
    weigh,
    weighEveryDays: goals.weighInEveryDays,
    checkinDoneThisWeek: Boolean(checkin.data),
    daysInactive,
    missedWorkout:
      missedAction && missedDay ? { id: missedAction.id, date: missedDay.date } : null,
    stillTrainToday:
      Boolean(plannedToday) && !workoutDone && hourNow >= nudgeHour && hourNow < 21,
    paymentProblem: membership.state === "grace",
    sharingPending: !profile?.sharing_decided_at && !profile?.coach_access_at,
    startWorkoutHref: workout.href,
  });

  // Milestones and copy
  const earned =
    ((newMilestones.data ?? []) as { milestone_type: MilestoneType }[])
      .map((m) => MILESTONE_COPY[m.milestone_type])
      .find(Boolean) ?? null;
  const milestone = nextMilestone({
    program: workout.section
      ? { sectionTitle: workout.section.title, remaining: workout.section.remaining }
      : null,
    week: { target, completed: prog.completed },
    weeklyCheckinDone: Boolean(checkin.data),
    waterRemainingMl: Math.max(0, goals.waterTargetMl - waterMl),
  });
  const date = new Intl.DateTimeFormat("en-CA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: tz,
  }).format(new Date());
  const isMember = viewer.entitlement !== "free";
  const native = await isNativeApp();

  return (
    <>
      <HomeHeader
        date={date}
        greeting={greeting(hourNow)}
        name={name}
        line={supportiveLine({
          score: ckScore(
            {
              workoutScheduled,
              workoutDone,
              waterMl,
              steps,
              checkinDone,
              weighScheduled: weigh.show || weighDone,
              weighDone,
            },
            goals,
          ),
          streak,
          missed: Boolean(missedAction),
          weekDone: target > 0 && prog.completed >= target,
        })}
        unread={unread.count ?? 0}
        initial={(name[0] ?? "?").toUpperCase()}
      />

      {earned ? <NextMilestone text={null} earned={earned} /> : null}

      {sp.error === "weight" ? (
        <Flash tone="error">Enter a weight between 35 and 300 kg.</Flash>
      ) : null}

      <NeedsAttention items={attention} />

      <TodaysWorkout workout={workout} done={workoutDone} restDay={!workoutScheduled} />

      <DayProvider
        initial={{ waterMl, steps, checkinDone }}
        goals={goals}
        workoutScheduled={workoutScheduled}
        workoutDone={workoutDone}
        weighScheduled={weigh.show || weighDone}
        weighDone={weighDone}
      >
        <div className="flex flex-col gap-3">
          <CKScore name={name} />
          <MyCommitment target={target} completed={prog.completed} />
          <WaterTracker />
        </div>
      </DayProvider>

      <WeightProgress
        units={units}
        current={lastWeigh ? displayWeight(Number(lastWeigh.weight_kg), units) : null}
        change={
          change === null
            ? null
            : displayWeight(Math.abs(change), units) * (change < 0 ? -1 : 1)
        }
        points={w.slice(-8).map((p) => ({
          x: p.log_date.slice(5),
          y: displayWeight(Number(p.weight_kg), units),
        }))}
        cycleDays={goals.weighInEveryDays}
        daysSince={weigh.daysSince}
        showForm={sp.log === "weight"}
      />
      <BMIWidget bmi={bmi} hidden={Boolean(profile?.hide_bmi)} />

      <WeeklyProgress
        week={week}
        completed={prog.completed}
        target={target}
        consistency={prog.consistency}
        streak={streak}
      />

      <NextMilestone text={milestone?.text ?? null} earned={null} />

      {!isMember && !native ? (
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

      {flags.community ? (
        <Link
          href="/community"
          className="flex items-center gap-3 rounded-card border border-line bg-surface p-3"
        >
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-on-brand"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-5 fill-none stroke-current"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="9" cy="8" r="3" />
              <path d="M3 20c.5-3.5 3-5 6-5s5.5 1.5 6 5" />
              <circle cx="17" cy="9" r="2.4" />
              <path d="M16 14.2c2.6 0 4.5 1.3 5 4.3" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <b className="block text-[13px] text-brand">CK Community</b>
            <span className="text-[11px] text-muted">
              Share wins, ask questions, cheer each other on.
            </span>
          </span>
          <span aria-hidden="true" className="text-muted">
            ›
          </span>
        </Link>
      ) : null}

      <AppleHealthPreview />
    </>
  );
}
