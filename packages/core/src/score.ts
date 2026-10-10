/** The "your day" ring. Weights live in app_settings so CK can tune them without a release. */
export interface DailyGoals {
  waterTargetMl: number;
  stepGoal: number;
  weights: { workout: number; water: number; steps: number; checkin: number };
  weighInEveryDays: number;
  weighInRemindFromDay: number;
}

export const DEFAULT_GOALS: DailyGoals = {
  waterTargetMl: 2500,
  stepGoal: 8000,
  weights: { workout: 40, water: 30, steps: 20, checkin: 10 },
  weighInEveryDays: 7,
  weighInRemindFromDay: 5,
};

export interface DayInputs {
  workoutDone: boolean;
  waterMl: number;
  steps: number;
  checkinDone: boolean;
}

const part = (value: number, target: number) =>
  target <= 0 ? 0 : Math.max(0, Math.min(1, value / target));

/** 0 to 100. Water and steps count partially; workout and check-in are all or nothing. */
export function dayScore(input: DayInputs, goals: DailyGoals = DEFAULT_GOALS): number {
  const w = goals.weights;
  const total = w.workout + w.water + w.steps + w.checkin;
  const raw =
    (input.workoutDone ? w.workout : 0) +
    w.water * part(input.waterMl, goals.waterTargetMl) +
    w.steps * part(input.steps, goals.stepGoal) +
    (input.checkinDone ? w.checkin : 0);
  return total <= 0 ? 0 : Math.round((raw / total) * 100);
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
      steps: num(w.steps, DEFAULT_GOALS.weights.steps),
      checkin: num(w.checkin, DEFAULT_GOALS.weights.checkin),
    },
  };
}
