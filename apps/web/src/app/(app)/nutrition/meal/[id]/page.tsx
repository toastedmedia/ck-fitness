import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { localTime } from "@ck/core";
import { Button, Flash } from "@/components/app/ui";
import { LockedNutrition } from "@/components/nutrition/Bits";
import { MealEditor, type EditorItem } from "@/components/nutrition/MealEditor";
import { nutritionGate } from "@/lib/nutrition";
import { deleteMeal, saveMeal } from "../../actions";

export const metadata: Metadata = { title: "Meal" };

export default async function MealPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, user, tz, allowed, native } = await nutritionGate();
  if (!allowed) return <LockedNutrition native={native} />;
  const { data: meal } = await supabase
    .from("meal_logs")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!meal) notFound();
  const { data: rows } = await supabase
    .from("meal_items")
    .select("*")
    .eq("meal_log_id", id)
    .order("sort_order");
  const items: EditorItem[] = (rows ?? []).map((r) => ({
    name: r.name,
    serving: r.serving_description ?? "",
    calories: String(r.final_calories),
    protein: String(Number(r.final_protein_g)),
    carbs: String(Number(r.final_carbs_g)),
    fat: String(Number(r.final_fat_g)),
    confidence: r.confidence,
    ai:
      r.ai_calories !== null
        ? {
            calories: r.ai_calories,
            protein: Number(r.ai_protein_g),
            carbs: Number(r.ai_carbs_g),
            fat: Number(r.ai_fat_g),
          }
        : undefined,
  }));
  const { data: signed } = meal.photo_path
    ? await supabase.storage.from("meal-photos").createSignedUrl(meal.photo_path, 120)
    : { data: null };
  return (
    <>
      <h1 className="sr-only">Meal</h1>
      {sp.error ? (
        <Flash tone="error">We could not save that. Please try again.</Flash>
      ) : null}
      <MealEditor
        action={saveMeal}
        confirmLabel="Save changes"
        initial={{
          id,
          mealType: meal.meal_type,
          date: meal.meal_date,
          time: localTime(meal.eaten_at, tz),
          description: meal.description ?? "",
          items,
          photoPath: meal.photo_path ?? undefined,
          photoUrl: signed?.signedUrl ?? null,
          aiEstimated: meal.ai_estimated,
          aiModel: meal.ai_model ?? undefined,
          aiNotes: meal.ai_notes ?? undefined,
          share: meal.share_with_coach,
        }}
      />
      <form action={deleteMeal.bind(null, id)}>
        <Button variant="ghost" className="w-full border-danger text-danger">
          Delete this meal
        </Button>
      </form>
    </>
  );
}
