"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  asUnits,
  cleanItem,
  estimateTargets,
  isActivity,
  isMealType,
  isNutritionGoal,
  itemsTotal,
  localToUtc,
  mealDay,
  validMealDate,
  validateTargets,
  weightToKg,
  lengthToCm,
  type MealItemInput,
} from "@ck/core";
import { track } from "@/lib/events";
import { nutritionGate } from "@/lib/nutrition";

const text = (f: FormData, k: string, max = 500) =>
  String(f.get(k) ?? "")
    .trim()
    .slice(0, max);

async function gate() {
  const ctx = await nutritionGate();
  if (!ctx.allowed) redirect("/nutrition");
  return ctx;
}

/** Saves the member's daily targets. "estimated" recomputes the estimate on the server from her answers. */
export async function saveTargets(formData: FormData): Promise<void> {
  const { supabase, user, profile } = await gate();
  const mode = text(formData, "mode");
  const goal = text(formData, "goal");
  const activity = text(formData, "activity");
  const back = (q: string) => redirect(`/nutrition/setup?${q}`);
  if (!isNutritionGoal(goal) || !isActivity(activity)) back("error=answers");

  let calories: number;
  let protein: number;
  let source: "estimated" | "member" = "member";
  if (mode === "estimated") {
    const units = asUnits(profile?.units);
    const est = estimateTargets({
      sex: text(formData, "sex"),
      age: Number(text(formData, "age")),
      weightKg: weightToKg(Number(text(formData, "weight")), units),
      heightCm: lengthToCm(Number(text(formData, "height")), units),
      activity: activity as never,
      goal: goal as never,
    });
    if (!est) back("error=estimate");
    calories = est!.calories;
    protein = est!.protein;
    source = "estimated";
  } else {
    const v = validateTargets({
      calories: formData.get("calories"),
      protein: formData.get("protein"),
    });
    if (!v.ok) back(`error=${encodeURIComponent(v.error)}`);
    calories = v.ok ? v.value.calories : 0;
    protein = v.ok ? v.value.protein : 0;
  }
  const { error } = await supabase.from("nutrition_profiles").upsert(
    {
      user_id: user.id,
      daily_calorie_target: calories,
      daily_protein_target: protein,
      target_source: source,
      activity_level: activity,
      goal_type: goal,
    },
    { onConflict: "user_id" },
  );
  if (error) back("error=save");
  await track(user.id, "nutrition_setup_completed", { source });
  revalidatePath("/nutrition");
  redirect("/nutrition");
}

/** Saves a meal (new or edited) with its food items. Totals are always recomputed here. */
export async function saveMeal(formData: FormData): Promise<void> {
  const { supabase, user, tz, today } = await gate();
  const id = text(formData, "id");
  const mealType = text(formData, "meal_type");
  const date = text(formData, "date");
  const time = text(formData, "time");
  const back = (q: string) => redirect(`/nutrition/${id ? `meal/${id}` : "log"}?${q}`);
  if (!isMealType(mealType)) back("error=type");
  if (!validMealDate(date, today)) back("error=date");
  const at = localToUtc(date, time || "12:00", tz);
  if (!at) back("error=date");

  let raw: unknown;
  try {
    raw = JSON.parse(text(formData, "items", 40_000));
  } catch {
    raw = [];
  }
  const items: (MealItemInput & { ai?: Record<string, number> })[] = [];
  for (const r of Array.isArray(raw) ? raw.slice(0, 30) : []) {
    const item = cleanItem(r as Record<string, unknown>);
    if (!item) continue;
    const ai = (r as { ai?: Record<string, unknown> }).ai;
    items.push({
      ...item,
      ai: ai
        ? {
            calories: Number(ai.calories) || 0,
            protein: Number(ai.protein) || 0,
            carbs: Number(ai.carbs) || 0,
            fat: Number(ai.fat) || 0,
          }
        : undefined,
    });
  }
  if (items.length === 0) back("error=items");
  const total = itemsTotal(items);
  const aiEstimated = text(formData, "ai") === "1";
  const aiItems = items.filter((i) => i.ai);
  const aiTotal = aiItems.length
    ? itemsTotal(
        aiItems.map(
          (i) =>
            i.ai as { calories: number; protein: number; carbs: number; fat: number },
        ),
      )
    : null;

  const photoPath = text(formData, "photo_path");
  const ownPhoto = photoPath.startsWith(`${user.id}/`) ? photoPath : null;
  const row = {
    meal_date: mealDay(at!, tz),
    eaten_at: at!.toISOString(),
    meal_type: mealType,
    description: text(formData, "description", 500) || null,
    ai_estimated: aiEstimated,
    estimated_calories: aiTotal?.calories ?? null,
    estimated_protein_g: aiTotal?.protein ?? null,
    estimated_carbs_g: aiTotal?.carbs ?? null,
    estimated_fat_g: aiTotal?.fat ?? null,
    final_calories: total.calories,
    final_protein_g: total.protein,
    final_carbs_g: total.carbs,
    final_fat_g: total.fat,
    ai_model: text(formData, "ai_model", 80) || null,
    ai_notes: text(formData, "ai_notes", 600) || null,
    share_with_coach: formData.get("share") === "on",
  };

  let mealId = id;
  if (id) {
    const { data: own } = await supabase
      .from("meal_logs")
      .select("id,photo_path")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!own) redirect("/nutrition");
    const { error } = await supabase.from("meal_logs").update(row).eq("id", id);
    if (error) back("error=save");
    await supabase.from("meal_items").delete().eq("meal_log_id", id);
  } else {
    const { data, error } = await supabase
      .from("meal_logs")
      .insert({ ...row, user_id: user.id, photo_path: ownPhoto })
      .select("id")
      .single();
    if (error || !data) back("error=save");
    mealId = data!.id;
  }
  const { error: itemError } = await supabase.from("meal_items").insert(
    items.map((i, n) => ({
      meal_log_id: mealId,
      user_id: user.id,
      name: i.name,
      quantity: i.quantity,
      serving_description: i.serving || null,
      ai_calories: i.ai?.calories ?? null,
      ai_protein_g: i.ai?.protein ?? null,
      ai_carbs_g: i.ai?.carbs ?? null,
      ai_fat_g: i.ai?.fat ?? null,
      final_calories: i.calories,
      final_protein_g: i.protein,
      final_carbs_g: i.carbs,
      final_fat_g: i.fat,
      confidence: i.confidence,
      sort_order: n,
    })),
  );
  if (itemError) back("error=save");
  await track(
    user.id,
    id ? "meal_edited" : aiEstimated ? "meal_confirmed" : "meal_manual_added",
  );
  revalidatePath("/nutrition");
  redirect(`/nutrition?date=${row.meal_date}`);
}

/** Deletes a meal, its items and its photo (when no other meal uses it). */
export async function deleteMeal(id: string): Promise<void> {
  const { supabase, user } = await gate();
  const { data: meal } = await supabase
    .from("meal_logs")
    .select("id,photo_path,meal_date")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!meal) redirect("/nutrition");
  await supabase.from("meal_logs").delete().eq("id", id);
  if (meal.photo_path) {
    const { count } = await supabase
      .from("meal_logs")
      .select("*", { count: "exact", head: true })
      .eq("photo_path", meal.photo_path);
    if (!count) await supabase.storage.from("meal-photos").remove([meal.photo_path]);
  }
  await track(user.id, "meal_deleted");
  revalidatePath("/nutrition");
  redirect(`/nutrition?date=${meal.meal_date}`);
}
