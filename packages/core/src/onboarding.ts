/**
 * Onboarding rules (Build Guide §7.3). Pure functions shared by server and tests.
 * Adults 18+ only for the first public launch.
 */
export const GOALS = [
  "fat_loss",
  "strength",
  "mobility",
  "core_pelvic",
  "general_fitness",
  "performance",
] as const;
export const LEVELS = ["beginner", "intermediate", "advanced"] as const;
export const LOCATIONS = ["home", "gym", "both"] as const;
export const EQUIPMENT = [
  "none",
  "mat",
  "bands",
  "dumbbells",
  "kettlebell",
  "full_gym",
] as const;
export const NUTRITION = ["vegetarian", "non_vegetarian", "other"] as const;
export const ACTIVITY = [
  "mostly_seated",
  "lightly_active",
  "active",
  "very_active",
] as const;
export const SLEEP = ["under_5", "5_to_6", "6_to_7", "7_to_8", "over_8"] as const;
export const GENDER = ["female", "male", "non_binary", "prefer_not_to_say"] as const;
export const MIN_AGE = 18;

export type Errors = Record<string, string>;
export type Result<T> = { ok: true; value: T } | { ok: false; errors: Errors };

export interface AboutInput {
  firstName: string;
  lastName: string;
  birthDate: string; // YYYY-MM-DD
  gender: (typeof GENDER)[number];
  heightCm: number;
  weightKg: number;
}
export interface GoalInput {
  primaryGoal: (typeof GOALS)[number];
  secondaryGoals: (typeof GOALS)[number][];
}
export interface TrainingInput {
  level: (typeof LEVELS)[number];
  location: (typeof LOCATIONS)[number];
  equipment: (typeof EQUIPMENT)[number][];
  preferredDays: number[]; // 0 = Monday ... 6 = Sunday
  reminderTime: string; // HH:MM
}
export interface LifestyleInput {
  nutrition: (typeof NUTRITION)[number];
  activity: (typeof ACTIVITY)[number];
  sleep: (typeof SLEEP)[number];
  constraints: string;
}
export interface SafetyInput {
  limitations: string;
  pregnancyContext: "yes" | "no" | "prefer_not_to_say";
  startingReason: string;
  weeklyCommitment: number;
  acknowledged: boolean;
}

export function ageFromBirthDate(birthDate: string, now: Date = new Date()): number {
  const [y, m, d] = birthDate.split("-").map(Number);
  let age = now.getUTCFullYear() - y;
  const hadBirthday =
    now.getUTCMonth() + 1 > m || (now.getUTCMonth() + 1 === m && now.getUTCDate() >= d);
  if (!hadBirthday) age -= 1;
  return age;
}

/** Informational only. Never presented as a diagnosis. */
export function calcBmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

export function bmiLabel(bmi: number): string {
  if (bmi < 18.5) return "Below typical range";
  if (bmi < 25) return "Typical range";
  if (bmi < 30) return "Above typical range";
  return "Well above typical range";
}

const isOneOf = <T extends readonly string[]>(list: T, v: unknown): v is T[number] =>
  typeof v === "string" && (list as readonly string[]).includes(v);
const text = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
const validDate = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

export function validateAbout(
  raw: Record<string, unknown>,
  now = new Date(),
): Result<AboutInput> {
  const errors: Errors = {};
  const firstName = text(raw.firstName, 60);
  const lastName = text(raw.lastName, 60);
  const birthDate = text(raw.birthDate, 10);
  const heightCm = Number(raw.heightCm);
  const weightKg = Number(raw.weightKg);
  if (!firstName) errors.firstName = "Please enter your first name.";
  if (!lastName) errors.lastName = "Please enter your last name.";
  if (!validDate(birthDate)) errors.birthDate = "Please enter your date of birth.";
  else if (ageFromBirthDate(birthDate, now) < MIN_AGE)
    errors.birthDate = "CK Fitness is for adults aged 18 and over.";
  else if (ageFromBirthDate(birthDate, now) > 110)
    errors.birthDate = "Please check your date of birth.";
  if (!isOneOf(GENDER, raw.gender)) errors.gender = "Please choose an option.";
  if (!(heightCm >= 120 && heightCm <= 230))
    errors.heightCm = "Enter your height in centimetres (120 to 230).";
  if (!(weightKg >= 35 && weightKg <= 300))
    errors.weightKg = "Enter your weight in kilograms (35 to 300).";
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      firstName,
      lastName,
      birthDate,
      gender: raw.gender as AboutInput["gender"],
      heightCm,
      weightKg,
    },
  };
}

export function validateGoal(raw: Record<string, unknown>): Result<GoalInput> {
  const errors: Errors = {};
  if (!isOneOf(GOALS, raw.primaryGoal))
    errors.primaryGoal = "Please choose your main goal.";
  const secondary = Array.isArray(raw.secondaryGoals) ? raw.secondaryGoals : [];
  const secondaryGoals = secondary.filter((g): g is GoalInput["primaryGoal"] =>
    isOneOf(GOALS, g),
  );
  if (Object.keys(errors).length) return { ok: false, errors };
  const primaryGoal = raw.primaryGoal as GoalInput["primaryGoal"];
  return {
    ok: true,
    value: {
      primaryGoal,
      secondaryGoals: secondaryGoals.filter((g) => g !== primaryGoal).slice(0, 2),
    },
  };
}

export function validateTraining(raw: Record<string, unknown>): Result<TrainingInput> {
  const errors: Errors = {};
  if (!isOneOf(LEVELS, raw.level)) errors.level = "Please choose your level.";
  if (!isOneOf(LOCATIONS, raw.location))
    errors.location = "Please choose where you train.";
  const equipment = (Array.isArray(raw.equipment) ? raw.equipment : []).filter(
    (e): e is TrainingInput["equipment"][number] => isOneOf(EQUIPMENT, e),
  );
  const preferredDays = [
    ...new Set((Array.isArray(raw.preferredDays) ? raw.preferredDays : []).map(Number)),
  ]
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    .sort();
  if (preferredDays.length < 1) errors.preferredDays = "Pick at least one training day.";
  const reminderTime = text(raw.reminderTime, 5);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(reminderTime))
    errors.reminderTime = "Choose a reminder time.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      level: raw.level as TrainingInput["level"],
      location: raw.location as TrainingInput["location"],
      equipment: equipment.length ? equipment : ["none"],
      preferredDays,
      reminderTime,
    },
  };
}

export function validateLifestyle(raw: Record<string, unknown>): Result<LifestyleInput> {
  const errors: Errors = {};
  if (!isOneOf(NUTRITION, raw.nutrition)) errors.nutrition = "Please choose an option.";
  if (!isOneOf(ACTIVITY, raw.activity)) errors.activity = "Please choose an option.";
  if (!isOneOf(SLEEP, raw.sleep)) errors.sleep = "Please choose an option.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      nutrition: raw.nutrition as LifestyleInput["nutrition"],
      activity: raw.activity as LifestyleInput["activity"],
      sleep: raw.sleep as LifestyleInput["sleep"],
      constraints: text(raw.constraints, 500),
    },
  };
}

export function validateSafety(raw: Record<string, unknown>): Result<SafetyInput> {
  const errors: Errors = {};
  const weeklyCommitment = Number(raw.weeklyCommitment);
  if (!(
    Number.isInteger(weeklyCommitment) &&
    weeklyCommitment >= 1 &&
    weeklyCommitment <= 7
  ))
    errors.weeklyCommitment = "Choose how many days you want to train each week.";
  const pregnancy = raw.pregnancyContext;
  if (pregnancy !== "yes" && pregnancy !== "no" && pregnancy !== "prefer_not_to_say")
    errors.pregnancyContext = "Please choose an option.";
  if (raw.acknowledged !== true) errors.acknowledged = "Please confirm to continue.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      limitations: text(raw.limitations, 500),
      pregnancyContext: pregnancy as SafetyInput["pregnancyContext"],
      startingReason: text(raw.startingReason, 500),
      weeklyCommitment,
      acknowledged: true,
    },
  };
}

/** True when answers suggest showing safety guidance instead of intensity claims. */
export function needsSafetyGuidance(
  s: Pick<SafetyInput, "limitations" | "pregnancyContext">,
): boolean {
  return s.limitations.length > 0 || s.pregnancyContext === "yes";
}
