/**
 * CK Nutrition rules. Pure functions (no I/O) so the server, the pages and the tests share one definition.
 * Everything here is an ESTIMATE for habit-building, never medical advice.
 */
import { addDays, dayKey, daysBetween } from "./dates";

export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack", "other"] as const;
export type MealType = (typeof MEAL_TYPES)[number];
export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
  other: "Other",
};
export const isMealType = (v: unknown): v is MealType =>
  MEAL_TYPES.includes(v as MealType);

export const NUTRITION_GOALS = ["fat_loss", "maintain", "gain"] as const;
export type NutritionGoal = (typeof NUTRITION_GOALS)[number];
export const GOAL_LABELS: Record<NutritionGoal, string> = {
  fat_loss: "Fat loss",
  maintain: "Maintain",
  gain: "Build muscle / gain",
};
export const isNutritionGoal = (v: unknown): v is NutritionGoal =>
  NUTRITION_GOALS.includes(v as NutritionGoal);

export const ESTIMATE_DISCLAIMER =
  "AI estimates can vary based on portion size, ingredients, oils and preparation.";
export const ESTIMATE_FROM_PHOTO =
  "Estimated from your photo. Portions, oils, sauces and preparation can change the actual nutrition.";

/** AI meal scans a member may run per day. Manual logging is unlimited. */
export const SCAN_LIMIT_PER_DAY = 10;
export const canScan = (usedToday: number, limit = SCAN_LIMIT_PER_DAY) =>
  usedToday < limit;

const round = (n: number) => Math.round(n);
const round1 = (n: number) => Math.round(n * 10) / 10;

/** "~810 kcal": always approximate. */
export const approxKcal = (kcal: number) =>
  `~${round(kcal).toLocaleString("en-CA")} kcal`;
export const grams = (g: number) => `${round(g)}g`;

export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}
export const ZERO_MACROS: Macros = { calories: 0, protein: 0, carbs: 0, fat: 0 };

export function sumMacros(rows: Partial<Macros>[]): Macros {
  const t = { ...ZERO_MACROS };
  for (const r of rows) {
    t.calories += Number(r.calories) || 0;
    t.protein += Number(r.protein) || 0;
    t.carbs += Number(r.carbs) || 0;
    t.fat += Number(r.fat) || 0;
  }
  return {
    calories: round(t.calories),
    protein: round1(t.protein),
    carbs: round1(t.carbs),
    fat: round1(t.fat),
  };
}

export interface Targets {
  calories: number;
  protein: number;
  carbs?: number | null;
  fat?: number | null;
}

export interface DayProgress {
  consumed: Macros;
  remainingCalories: number;
  remainingProtein: number;
  caloriesPct: number;
  proteinPct: number;
  overCalories: boolean;
  proteinMet: boolean;
}

/** Consumed vs target. Remaining never goes below zero; "over" is flagged separately and neutrally. */
export function dayProgress(target: Targets, meals: Partial<Macros>[]): DayProgress {
  const consumed = sumMacros(meals);
  return {
    consumed,
    remainingCalories: Math.max(0, round(target.calories - consumed.calories)),
    remainingProtein: Math.max(0, round(target.protein - consumed.protein)),
    caloriesPct: Math.min(100, Math.round((consumed.calories / target.calories) * 100)),
    proteinPct: Math.min(100, Math.round((consumed.protein / target.protein) * 100)),
    overCalories: consumed.calories > target.calories,
    proteinMet: consumed.protein >= target.protein,
  };
}

/** Suggested meal type from the member's local hour. She can always change it. */
export function mealTypeForHour(hour: number): MealType {
  if (hour >= 4 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 16) return "lunch";
  if (hour >= 16 && hour < 21) return "dinner";
  return "snack";
}

/** The nutrition day a meal belongs to: the member's LOCAL calendar day (resets at her midnight). */
export const mealDay = (eatenAt: Date | string, tz: string) =>
  dayKey(typeof eatenAt === "string" ? new Date(eatenAt) : eatenAt, tz);

/* ------------------------------------------------------------ starting target */
export type ActivityKey = "mostly_seated" | "lightly_active" | "active" | "very_active";
const ACTIVITY_FACTOR: Record<ActivityKey, number> = {
  mostly_seated: 1.2,
  lightly_active: 1.375,
  active: 1.55,
  very_active: 1.725,
};
export const isActivity = (v: unknown): v is ActivityKey =>
  typeof v === "string" && v in ACTIVITY_FACTOR;

export interface TargetInput {
  sex: string | null | undefined;
  age: number;
  weightKg: number;
  heightCm: number;
  activity: ActivityKey;
  goal: NutritionGoal;
}

export const TARGET_LIMITS = { calories: [1000, 6000], protein: [20, 400] } as const;
const MIN_ESTIMATED_CALORIES = 1400;
const MAX_ESTIMATED_CALORIES = 4000;

/**
 * A conservative starting estimate (Mifflin-St Jeor): a gentle 15% reduction for fat loss, +10% for gain,
 * never below 1,400 kcal. Returns null when inputs are missing or implausible. Not a prescription.
 */
export function estimateTargets(
  i: TargetInput,
): { calories: number; protein: number } | null {
  if (
    !(i.age >= 18 && i.age <= 90) ||
    !(i.weightKg >= 35 && i.weightKg <= 300) ||
    !(i.heightCm >= 120 && i.heightCm <= 230) ||
    !isActivity(i.activity) ||
    !isNutritionGoal(i.goal)
  )
    return null;
  const base = 10 * i.weightKg + 6.25 * i.heightCm - 5 * i.age;
  const bmr = i.sex === "male" ? base + 5 : i.sex === "female" ? base - 161 : base - 78;
  const maintenance = bmr * ACTIVITY_FACTOR[i.activity];
  const factor = i.goal === "fat_loss" ? 0.85 : i.goal === "gain" ? 1.1 : 1;
  const calories = Math.min(
    MAX_ESTIMATED_CALORIES,
    Math.max(MIN_ESTIMATED_CALORIES, Math.round((maintenance * factor) / 50) * 50),
  );
  const perKg = i.goal === "gain" ? 1.8 : i.goal === "fat_loss" ? 1.6 : 1.4;
  const cap = Math.floor((calories * 0.35) / 4);
  const protein =
    Math.round(Math.min(220, cap, Math.max(50, i.weightKg * perKg)) / 5) * 5;
  return { calories, protein };
}

export function validateTargets(
  raw: Record<string, unknown>,
):
  | { ok: true; value: { calories: number; protein: number } }
  | { ok: false; error: string } {
  const calories = Math.round(Number(raw.calories));
  const protein = Math.round(Number(raw.protein));
  const [cMin, cMax] = TARGET_LIMITS.calories;
  const [pMin, pMax] = TARGET_LIMITS.protein;
  if (!Number.isFinite(calories) || calories < cMin || calories > cMax)
    return { ok: false, error: `Calories should be between ${cMin} and ${cMax}.` };
  if (!Number.isFinite(protein) || protein < pMin || protein > pMax)
    return { ok: false, error: `Protein should be between ${pMin} and ${pMax} g.` };
  return { ok: true, value: { calories, protein } };
}

/* --------------------------------------------------------------- meal entry */
export interface MealItemInput {
  name: string;
  quantity: number | null;
  serving: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: "low" | "medium" | "high" | null;
}

const clamp = (v: unknown, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
};

/** Cleans one food row typed or edited by the member (values are bounded, never trusted). */
export function cleanItem(raw: Record<string, unknown>): MealItemInput | null {
  const name = String(raw.name ?? "")
    .trim()
    .slice(0, 120);
  if (!name) return null;
  const q = Number(raw.quantity);
  const conf = String(raw.confidence ?? "");
  return {
    name,
    quantity: Number.isFinite(q) && q > 0 ? Math.min(9999, q) : null,
    serving: String(raw.serving ?? "")
      .trim()
      .slice(0, 160),
    calories: Math.round(clamp(raw.calories, 5000)),
    protein: round1(clamp(raw.protein, 500)),
    carbs: round1(clamp(raw.carbs, 800)),
    fat: round1(clamp(raw.fat, 500)),
    confidence: conf === "low" || conf === "medium" || conf === "high" ? conf : null,
  };
}

export const itemsTotal = (
  items: Pick<MealItemInput, "calories" | "protein" | "carbs" | "fat">[],
) => sumMacros(items);

/** A meal date may not be in the future (beyond tomorrow, for time-zone slack) nor older than a year. */
export function validMealDate(date: string, today: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    date <= addDays(today, 1) &&
    date >= addDays(today, -366)
  );
}

/* --------------------------------------------------------------- AI response */
export interface AiMeal {
  items: MealItemInput[];
  totals: Macros;
  notes: string[];
}

/** The model sometimes wraps JSON in a code fence. Pull the object out. */
export function extractJson(text: string): unknown {
  const t = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Validates what the AI returned. Never trusts its totals: they are recomputed from the items.
 * Anything malformed is rejected so a broken result is never saved.
 */
export function parseAiMeal(
  raw: unknown,
): { ok: true; value: AiMeal } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "No result." };
  const o = raw as { items?: unknown; notes?: unknown };
  if (!Array.isArray(o.items) || o.items.length === 0 || o.items.length > 20)
    return { ok: false, error: "No foods found." };
  const items: MealItemInput[] = [];
  for (const r of o.items) {
    if (!r || typeof r !== "object") return { ok: false, error: "Bad item." };
    const x = r as Record<string, unknown>;
    const item = cleanItem({
      name: x.name,
      quantity: x.quantity,
      serving: x.serving_description,
      calories: x.estimated_calories,
      protein: x.estimated_protein_g,
      carbs: x.estimated_carbs_g,
      fat: x.estimated_fat_g,
      confidence: x.confidence ?? "medium",
    });
    if (!item) return { ok: false, error: "Item without a name." };
    if (!Number.isFinite(Number(x.estimated_calories)))
      return { ok: false, error: "Item without calories." };
    items.push(item);
  }
  const notes = Array.isArray(o.notes)
    ? o.notes
        .filter((n): n is string => typeof n === "string")
        .map((n) => n.trim().slice(0, 200))
        .filter(Boolean)
        .slice(0, 5)
    : [];
  return { ok: true, value: { items, totals: itemsTotal(items), notes } };
}

/** "2026-10-16" + "13:22" in the member's time zone, as a UTC instant. */
export function localToUtc(date: string, time: string, tz: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const guess = new Date(`${date}T${time}:00Z`);
  if (Number.isNaN(guess.getTime())) return null;
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(guess)
      .map((x) => [x.type, x.value]),
  );
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return new Date(guess.getTime() + (guess.getTime() - asUtc));
}

/** Local clock time ("13:22") of an instant in the member's time zone. */
export function localTime(at: Date | string, tz: string): string {
  const d = typeof at === "string" ? new Date(at) : at;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** Totals per day, newest first. Used by history and the weekly summary. */
export function groupByDay(
  meals: (Partial<Macros> & { meal_date: string })[],
): { date: string; totals: Macros; meals: number }[] {
  const by = new Map<string, Partial<Macros>[]>();
  for (const m of meals) by.set(m.meal_date, [...(by.get(m.meal_date) ?? []), m]);
  return [...by.entries()]
    .map(([date, rows]) => ({ date, totals: sumMacros(rows), meals: rows.length }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/* ------------------------------------------------------------- weekly summary */
export interface WeekSummary {
  mealsLogged: number;
  daysTracked: number;
  daysElapsed: number;
  proteinDaysHit: number;
  avgCalories: number | null;
  line: string;
}

/** This week so far (Monday to today), from per-day totals. Supportive wording only. */
export function nutritionWeek(
  days: { date: string; totals: Macros; meals: number }[],
  target: Targets,
  weekStartKey: string,
  today: string,
): WeekSummary {
  const inWeek = days.filter(
    (d) => d.date >= weekStartKey && d.date <= today && d.meals > 0,
  );
  const daysElapsed = Math.min(7, daysBetween(weekStartKey, today) + 1);
  const mealsLogged = inWeek.reduce((n, d) => n + d.meals, 0);
  const proteinDaysHit = inWeek.filter((d) => d.totals.protein >= target.protein).length;
  const avgCalories = inWeek.length
    ? Math.round(inWeek.reduce((n, d) => n + d.totals.calories, 0) / inWeek.length)
    : null;
  const line =
    inWeek.length >= 3 && inWeek.length >= Math.ceil(daysElapsed * 0.7)
      ? "Strong consistency this week."
      : inWeek.length > 0
        ? "Every logged meal helps. Keep going."
        : "One photo is enough to get started.";
  return {
    mealsLogged,
    daysTracked: inWeek.length,
    daysElapsed,
    proteinDaysHit,
    avgCalories,
    line,
  };
}

/* -------------------------------------------------------------------- nudges */
export interface NudgeConfig {
  /** Local hour after which "nothing logged yet" may be sent. */
  noMealHour: number;
  /** Local hour after which a protein reminder may be sent. */
  proteinCheckHour: number;
  /** Send the protein reminder when protein is below this % of the target. */
  proteinShortPct: number;
  /** Days without a meal (after using the feature) before a gentle restart note. */
  idleDays: number;
}
export const DEFAULT_NUDGE_CONFIG: NudgeConfig = {
  noMealHour: 13,
  proteinCheckHour: 17,
  proteinShortPct: 60,
  idleDays: 3,
};

/** Admin-editable overrides (app_settings "nutrition_nudges"), bounded so a typo cannot cause spam. */
export function mergeNudgeConfig(v: unknown): NudgeConfig {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const pick = (k: keyof NudgeConfig, min: number, max: number) => {
    const n = Number(o[k]);
    return Number.isFinite(n) && n >= min && n <= max
      ? Math.round(n)
      : DEFAULT_NUDGE_CONFIG[k];
  };
  return {
    noMealHour: pick("noMealHour", 8, 19),
    proteinCheckHour: pick("proteinCheckHour", 12, 20),
    proteinShortPct: pick("proteinShortPct", 10, 95),
    idleDays: pick("idleDays", 2, 14),
  };
}

export interface NudgeInput {
  hour: number;
  today: string;
  mealsToday: number;
  proteinToday: number;
  proteinTarget: number;
  /** Local day of her most recent meal before today, if she has ever logged one. */
  lastMealDay: string | null;
  config?: NudgeConfig;
}
export type Nudge = { kind: "idle" | "no_meal" | "protein"; title: string; body: string };

/**
 * At most one rule-based nudge, never shaming, never about going over a target.
 * The caller sends at most one nutrition nudge per member per day.
 */
export function nutritionNudge(i: NudgeInput): Nudge | null {
  const c = i.config ?? DEFAULT_NUDGE_CONFIG;
  if (i.mealsToday === 0 && i.lastMealDay && i.hour >= 10 && i.hour < 20) {
    if (daysBetween(i.lastMealDay, i.today) >= c.idleDays)
      return {
        kind: "idle",
        title: "Pick up where you left off",
        body: "Haven't logged a meal lately? One photo is enough. You don't need to track perfectly.",
      };
  }
  if (i.mealsToday === 0 && i.hour >= c.noMealHour && i.hour < 20)
    return {
      kind: "no_meal",
      title: "Nothing logged yet today",
      body: "Nothing logged yet today. One photo is enough to get started.",
    };
  if (
    i.mealsToday > 0 &&
    i.hour >= c.proteinCheckHour &&
    i.hour < 21 &&
    i.proteinToday < (i.proteinTarget * c.proteinShortPct) / 100
  ) {
    const short = Math.max(5, Math.round((i.proteinTarget - i.proteinToday) / 5) * 5);
    return {
      kind: "protein",
      title: "Protein check-in",
      body: `You're still about ${short}g short of today's protein goal.`,
    };
  }
  return null;
}

/* ------------------------------------------------------------ tester access */
/** Members who see Nutrition before it is switched on for everyone: only those the owners list in Admin -> Settings. */
export const DEFAULT_NUTRITION_TESTERS: string[] = [];

/** Reads the admin-edited list (a JSON array, or one email per line) and adds the defaults. */
export function parseTesters(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\s,;]+/)
      : [];
  const emails = [...DEFAULT_NUTRITION_TESTERS, ...raw]
    .map((e) => String(e).trim().toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  return [...new Set(emails)];
}

export const isTester = (email: string | null | undefined, testers: string[]) =>
  Boolean(email) && testers.includes(String(email).trim().toLowerCase());

export const AI_CONSENT_TEXT =
  "To estimate your meal, the photo and any note you add are sent securely to OpenAI, a third-party AI service, only to create the estimate. We do not send your name or email.";

/* ------------------------------------------------------------ streaks, recents */
/**
 * Days in a row with at least one meal logged. Today not logged yet does not break the streak
 * (it counts back from yesterday), so the number never drops before the day is over.
 */
export function loggingStreak(dates: string[], today: string): number {
  const set = new Set(dates);
  let day = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

/** Newest first, one entry per distinct set of foods, so "log again" shows each usual meal once. */
export function distinctRecent<T extends { items: { name: string }[] }>(
  meals: T[],
  max = 6,
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const m of meals) {
    const key = m.items
      .map((i) => i.name.trim().toLowerCase())
      .sort()
      .join("|");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(m);
    if (out.length >= max) break;
  }
  return out;
}

/** Scales a food row's numbers (portion slider). */
export function scaleItem<
  T extends { calories: number; protein: number; carbs: number; fat: number },
>(item: T, factor: number): T {
  const f = Number.isFinite(factor) && factor > 0 && factor <= 5 ? factor : 1;
  return {
    ...item,
    calories: Math.round(item.calories * f),
    protein: round1(item.protein * f),
    carbs: round1(item.carbs * f),
    fat: round1(item.fat * f),
  };
}
