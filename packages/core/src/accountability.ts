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

export interface Reminder {
  id: "weigh_in" | "weekly_checkin" | "restart";
  title: string;
  body: string;
  action: "log_weight" | "start_checkin" | "start_workout";
  actionLabel: string;
}

export function homeReminders(args: {
  firstName: string;
  today: string;
  weigh: WeighInStatus;
  checkinDoneThisWeek: boolean;
  daysInactive: number;
}): Reminder[] {
  const out: Reminder[] = [];
  const { firstName: n, weigh } = args;
  if (args.daysInactive >= 3) {
    out.push({
      id: "restart",
      title: `${n}, pick up where you left off`,
      body: "One short session is a great restart.",
      action: "start_workout",
      actionLabel: "Restart",
    });
  }
  if (weigh.show) {
    out.push({
      id: "weigh_in",
      title:
        weigh.daysSince === null
          ? `${n}, log your first weekly weight`
          : `${n}, it has been ${weigh.daysSince} days since your last weigh-in`,
      body: "Log today's weight to keep your trend going.",
      action: "log_weight",
      actionLabel: "Log",
    });
  }
  if (!args.checkinDoneThisWeek && dayOfWeek(args.today) >= 4) {
    out.push({
      id: "weekly_checkin",
      title: "Your weekly check-in is ready",
      body: "It takes about a minute.",
      action: "start_checkin",
      actionLabel: "Start",
    });
  }
  return out.slice(0, 2);
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
