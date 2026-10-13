import { addDays, daysBetween, dayOfWeek } from "./dates";
import type { DailyGoals } from "./score";

/** Rules-based accountability (Build Guide §8). No AI. Copy stays supportive, never shaming. */

export type ActionStatus = "planned" | "completed" | "rescheduled" | "skipped";
export interface WorkoutAction {
  scheduled_for: string;
  status: ActionStatus;
}
export type DayState = "done" | "planned" | "missed" | "rescheduled" | "rest";
export interface WeekDay {
  date: string;
  dow: number;
  state: DayState;
  isToday: boolean;
}

export function buildWeek(
  start: string,
  today: string,
  actions: WorkoutAction[],
): WeekDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    const todays = actions.filter((a) => a.scheduled_for === date);
    let state: DayState = "rest";
    if (todays.some((a) => a.status === "completed")) state = "done";
    else if (todays.some((a) => a.status === "planned"))
      state = date < today ? "missed" : "planned";
    else if (todays.some((a) => a.status === "rescheduled")) state = "rescheduled";
    return { date, dow: i, state, isToday: date === today };
  });
}

export function weekProgress(actions: WorkoutAction[]) {
  const counted = actions.filter(
    (a) => a.status === "planned" || a.status === "completed",
  );
  const planned = counted.length;
  const completed = counted.filter((a) => a.status === "completed").length;
  return {
    planned,
    completed,
    consistency: planned === 0 ? 0 : Math.round((completed / planned) * 100),
  };
}

/** Consecutive active days ending today (or yesterday, so an unfinished today does not break it). */
export function streakDays(activeDays: Iterable<string>, today: string): number {
  const set = new Set(activeDays);
  let cursor = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(cursor)) {
    n += 1;
    cursor = addDays(cursor, -1);
  }
  return n;
}

export interface WeighInStatus {
  daysSince: number | null;
  show: boolean;
  dueIn: number;
}

export function weighInStatus(
  lastWeighIn: string | null,
  today: string,
  goals: Pick<DailyGoals, "weighInEveryDays" | "weighInRemindFromDay">,
): WeighInStatus {
  if (!lastWeighIn) return { daysSince: null, show: true, dueIn: 0 };
  const daysSince = daysBetween(lastWeighIn, today);
  return {
    daysSince,
    show: daysSince >= goals.weighInRemindFromDay,
    dueIn: Math.max(0, goals.weighInEveryDays - daysSince),
  };
}

export type RiskState = "active" | "at_risk_3d" | "at_risk_7d" | "at_risk_14d";

/** Inactivity is measured from the last time she opened the app or completed something. */
export function riskState(daysInactive: number, isPaid: boolean): RiskState {
  if (daysInactive >= 14 && isPaid) return "at_risk_14d";
  if (daysInactive >= 7) return "at_risk_7d";
  if (daysInactive >= 3) return "at_risk_3d";
  return "active";
}

export type AttentionKind =
  | "missed_workout"
  | "weigh_in"
  | "weekly_checkin"
  | "restart"
  | "still_train"
  | "payment"
  | "program_ending"
  | "unfinished_onboarding"
  | "trainer_message"
  | "followup"
  | "sharing_choice";

/**
 * One row in the Needs Attention card. Any alert type (workout missed, payment issue, trainer
 * message...) is just another AttentionItem, so the card never needs rebuilding for new alerts.
 */
export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  title: string;
  detail: string;
  severity: "info" | "warning";
  /** A link, or the name of an inline action the UI knows how to run. */
  cta: { label: string; href?: string; action?: "start_workout" | "missed_recovery" };
  /** Extra data for inline actions, such as which scheduled workout was missed. */
  ref?: string;
}

const DOW = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const MAX_ATTENTION = 4;

/** Highest priority first. Returns an empty list when nothing needs her attention. */
export function attentionItems(args: {
  firstName: string;
  today: string;
  weigh: WeighInStatus;
  weighEveryDays: number;
  checkinDoneThisWeek: boolean;
  daysInactive: number;
  /** Most recent planned workout that passed without being done. */
  missedWorkout?: { id: string; date: string } | null;
  /** A session is planned for today, not done, and her usual time has passed. */
  stillTrainToday?: boolean;
  paymentProblem?: boolean;
  /** Existing member who has not yet chosen whether to share her records with her coach. */
  sharingPending?: boolean;
  startWorkoutHref?: string | null;
}): AttentionItem[] {
  const out: AttentionItem[] = [];
  if (args.paymentProblem) {
    out.push({
      id: "payment",
      kind: "payment",
      severity: "warning",
      title: "Update your payment method",
      detail: "We could not take your last payment.",
      cta: { label: "Fix", href: "/membership" },
    });
  }
  if (args.sharingPending) {
    out.push({
      id: "sharing_choice",
      kind: "sharing_choice",
      severity: "info",
      title: "Share your progress with your coach?",
      detail: "Your coach can only see your answers and check-ins if you agree.",
      cta: { label: "Choose", href: "/profile#sharing" },
    });
  }
  if (args.missedWorkout) {
    const yesterday = daysBetween(args.missedWorkout.date, args.today) === 1;
    out.push({
      id: `missed:${args.missedWorkout.id}`,
      kind: "missed_workout",
      severity: "info",
      ref: args.missedWorkout.id,
      title: yesterday
        ? "Missed yesterday's workout?"
        : `Missed ${DOW[dayOfWeek(args.missedWorkout.date)]}'s workout?`,
      detail: "Yesterday didn't happen. Let's get you back on track.",
      cta: { label: "Choose", action: "missed_recovery" },
    });
  } else if (args.stillTrainToday) {
    out.push({
      id: "still_train",
      kind: "still_train",
      severity: "info",
      title: "Still want to train today?",
      detail: "Even a short session counts.",
      cta: {
        label: "Start",
        href: args.startWorkoutHref ?? undefined,
        action: args.startWorkoutHref ? undefined : "start_workout",
      },
    });
  } else if (args.daysInactive >= 3) {
    out.push({
      id: "restart",
      kind: "restart",
      severity: "info",
      title: "Pick up where you left off",
      detail: "One short session is a great restart.",
      cta: { label: "Restart", href: "/programs" },
    });
  }
  if (args.weigh.show) {
    const overdueBy =
      args.weigh.daysSince !== null ? args.weigh.daysSince - args.weighEveryDays : 0;
    out.push({
      id: "weigh_in",
      kind: "weigh_in",
      severity: overdueBy > 0 ? "warning" : "info",
      title: "Log weight",
      detail:
        args.weigh.daysSince === null
          ? "Your first weekly weigh-in"
          : overdueBy > 0
            ? `Overdue by ${overdueBy} day${overdueBy === 1 ? "" : "s"}`
            : args.weigh.dueIn > 0
              ? `Due in ${args.weigh.dueIn} day${args.weigh.dueIn === 1 ? "" : "s"}`
              : "Due today",
      cta: { label: "Log", href: "/home?log=weight#weight" },
    });
  }
  if (!args.checkinDoneThisWeek && dayOfWeek(args.today) >= 4) {
    out.push({
      id: "weekly_checkin",
      kind: "weekly_checkin",
      severity: "info",
      title: "Weekly check-in",
      detail: "Ready · Takes about 1 minute",
      cta: { label: "Start", href: "/accountability/checkin" },
    });
  }
  return out.slice(0, MAX_ATTENTION);
}

export interface NextMilestoneInput {
  /** Remaining lessons in her current program week or phase, if she is in a program. */
  program?: { sectionTitle: string; remaining: number } | null;
  week: { target: number; completed: number };
  weeklyCheckinDone: boolean;
  waterRemainingMl: number;
}

/** One primary milestone at a time: program, weekly target, accountability, then hydration. */
export function nextMilestone(
  i: NextMilestoneInput,
): { text: string; kind: "program" | "week" | "accountability" | "water" } | null {
  if (i.program && i.program.remaining > 0) {
    const n = i.program.remaining;
    return {
      kind: "program",
      text:
        n === 1
          ? `1 workout away from completing ${i.program.sectionTitle}.`
          : `Complete ${n} more workouts to finish ${i.program.sectionTitle}.`,
    };
  }
  const left = i.week.target - i.week.completed;
  if (left > 0)
    return {
      kind: "week",
      text:
        left === 1
          ? "1 workout away from this week's commitment."
          : `Complete ${left} more workouts to hit this week's commitment.`,
    };
  if (!i.weeklyCheckinDone)
    return {
      kind: "accountability",
      text: "Do your weekly check-in to close out the week.",
    };
  if (i.waterRemainingMl > 0)
    return {
      kind: "water",
      text: `${Math.round(i.waterRemainingMl / 50) * 50} mL more water to hit today's goal.`,
    };
  return null;
}

/** A short, supportive line under the greeting. Never guilt-based. */
export function supportiveLine(s: {
  score: number;
  streak: number;
  missed: boolean;
  weekDone: boolean;
}): string {
  if (s.score >= 100) return "Today is done. Well played.";
  if (s.weekDone) return "You've met your weekly commitment. Lovely work.";
  if (s.missed) return "A fresh start is always available.";
  if (s.streak >= 3) return "Let's keep the momentum going.";
  return "One step at a time. You've got this.";
}

export type MilestoneType =
  | "first_workout"
  | "three_workouts"
  | "seven_day_streak"
  | "first_completed_week"
  | "first_program_module";

export const MILESTONE_COPY: Record<MilestoneType, { title: string; body: string }> = {
  first_workout: { title: "First workout done", body: "The hardest one is behind you." },
  three_workouts: { title: "Three workouts done", body: "You are building a rhythm." },
  seven_day_streak: { title: "Seven days in a row", body: "Seven days of showing up." },
  first_completed_week: {
    title: "Your first full week",
    body: "Every planned session, done.",
  },
  first_program_module: {
    title: "First program step finished",
    body: "You are on your way.",
  },
};

export function milestonesEarned(stats: {
  completedWorkouts: number;
  streak: number;
  fullWeeks: number;
  programLessons: number;
}): MilestoneType[] {
  const out: MilestoneType[] = [];
  if (stats.completedWorkouts >= 1) out.push("first_workout");
  if (stats.completedWorkouts >= 3) out.push("three_workouts");
  if (stats.streak >= 7) out.push("seven_day_streak");
  if (stats.fullWeeks >= 1) out.push("first_completed_week");
  if (stats.programLessons >= 1) out.push("first_program_module");
  return out;
}
