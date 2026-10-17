import "server-only";
import {
  dayProgress,
  groupByDay,
  nutritionWeek,
  weekStart,
  type DayProgress,
  type WeekSummary,
} from "@ck/core";
import type { AppContext } from "@/lib/app";
import { nutritionAccess } from "@/lib/nutrition";

export interface NutritionSnapshot {
  hasTarget: boolean;
  target: { calories: number; protein: number } | null;
  day: DayProgress | null;
  mealsToday: number;
  week: WeekSummary | null;
}

/**
 * What Home and Accountability show. Returns null (and runs no queries) while the feature is off or
 * for free members, so existing screens stay exactly as they are.
 */
export async function nutritionSnapshot(
  ctx: AppContext,
): Promise<NutritionSnapshot | null> {
  const access = await nutritionAccess(ctx);
  if (!access.on || !access.allowed) return null;
  const { supabase, user, today } = ctx;
  const start = weekStart(today);
  const [{ data: np }, { data: meals }] = await Promise.all([
    supabase
      .from("nutrition_profiles")
      .select("daily_calorie_target,daily_protein_target")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("meal_logs")
      .select("meal_date,final_calories,final_protein_g,final_carbs_g,final_fat_g")
      .eq("user_id", user.id)
      .gte("meal_date", start)
      .lte("meal_date", today),
  ]);
  if (!np)
    return { hasTarget: false, target: null, day: null, mealsToday: 0, week: null };
  const target = { calories: np.daily_calorie_target, protein: np.daily_protein_target };
  const rows = (meals ?? []).map((m) => ({
    meal_date: m.meal_date as string,
    calories: m.final_calories as number,
    protein: Number(m.final_protein_g),
    carbs: Number(m.final_carbs_g),
    fat: Number(m.final_fat_g),
  }));
  const todayRows = rows.filter((r) => r.meal_date === today);
  return {
    hasTarget: true,
    target,
    day: dayProgress(target, todayRows),
    mealsToday: todayRows.length,
    week: nutritionWeek(groupByDay(rows), target, start, today),
  };
}
