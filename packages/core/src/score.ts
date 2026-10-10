/** Today's CK Score. Weights live in app_settings so CK can tune them without a release. */
export interface DailyGoals {
  waterTargetMl: number;
  stepGoal: number;
  weights: {
    workout: number;
    water: number;
    checkin: number;
    steps: number;
    weigh: number;
  };
  weighInEveryDays: number;
  weighInRemindFromDay: number;
}

export const DEFAULT_GOALS: DailyGoals = {
  waterTargetMl: 2500,
  stepGoal: 8000,
  weights: { workout: 40, water: 25, checkin: 15, steps: 10, weigh: 10 },
  weighInEveryDays: 7,
  weighInRemindFromDay: 5,
};

export interface DayInputs {
  /** Is a workout planned today (or already done)? A rest day does not count against her. */
  workoutScheduled: boolean;
  workoutDone: boolean;
  waterMl: number;
  steps: number;
  checkinDone: boolean;
  /** Is a weigh-in due today (or already logged today)? */
  weighScheduled: boolean;
  weighDone: boolean;
}

export type ScoreKey = "workout" | "water" | "checkin" | "steps" | "weigh";
export interface ScoreItem {
  key: ScoreKey;
  weight: number;
  /** 0 to 1 */
  fraction: number;
}

const part = (value: number, target: number) =>
  target <= 0 ? 0 : Math.max(0, Math.min(1, value / target));

/** Only today's relevant actions are scored; their weights are scaled back up to 100%. */
export function scoreItems(
  input: DayInputs,
  goals: DailyGoals = DEFAULT_GOALS,
): ScoreItem[] {
  const w = goals.weights;
  const items: ScoreItem[] = [];
  if (input.workoutScheduled || input.workoutDone)
    items.push({
      key: "workout",
      weight: w.workout,
      fraction: input.workoutDone ? 1 : 0,
    });
  items.push({
    key: "water",
    weight: w.water,
    fraction: part(input.waterMl, goals.waterTargetMl),
  });
  items.push({ key: "checkin", weight: w.checkin, fraction: input.checkinDone ? 1 : 0 });
  items.push({
    key: "steps",
    weight: w.steps,
    fraction: part(input.steps, goals.stepGoal),
  });
  if (input.weighScheduled || input.weighDone)
    items.push({ key: "weigh", weight: w.weigh, fraction: input.weighDone ? 1 : 0 });
  return items;
}

/** 0 to 100. Water and steps count partially; the rest are all or nothing. */
export function ckScore(input: DayInputs, goals: DailyGoals = DEFAULT_GOALS): number {
  const items = scoreItems(input, goals);
  const total = items.reduce((s, i) => s + i.weight, 0);
  if (total <= 0) return 0;
  const got = items.reduce((s, i) => s + i.weight * i.fraction, 0);
  return Math.round((got / total) * 100);
}

/** Merge saved settings over the defaults, ignoring anything invalid. */
export function mergeGoals(saved: unknown): DailyGoals {
  const s = (saved ?? {}) as Partial<DailyGoals>;
  const num = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback;
  const w = (s.weights ?? {}) as Partial<DailyGoals["weights"]>;
  return {
    waterTargetMl: num(s.waterTargetMl, DEFAULT_GOALS.waterTargetMl),
    stepGoal: num(s.stepGoal, DEFAULT_GOALS.stepGoal),
    weighInEveryDays: num(s.weighInEveryDays, DEFAULT_GOALS.weighInEveryDays),
    weighInRemindFromDay: num(s.weighInRemindFromDay, DEFAULT_GOALS.weighInRemindFromDay),
    weights: {
      workout: num(w.workout, DEFAULT_GOALS.weights.workout),
      water: num(w.water, DEFAULT_GOALS.weights.water),
      checkin: num(w.checkin, DEFAULT_GOALS.weights.checkin),
      steps: num(w.steps, DEFAULT_GOALS.weights.steps),
      weigh: num(w.weigh, DEFAULT_GOALS.weights.weigh),
    },
  };
}
