import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { distinctRecent, localTime, mealTypeForHour, validMealDate } from "@ck/core";
import { Flash } from "@/components/app/ui";
import { LockedNutrition } from "@/components/nutrition/Bits";
import { ScanFlow } from "@/components/nutrition/ScanFlow";
import { nutritionGate } from "@/lib/nutrition";
import { aiConfigured } from "@/lib/nutrition-ai";

export const maxDuration = 60;
export const metadata: Metadata = { title: "Log meal" };

const ERRORS: Record<string, string> = {
  type: "Choose a meal type.",
  date: "Choose a valid date.",
  items: "Add at least one food with a name.",
  save: "We could not save that meal. Please try again.",
};

export default async function LogMealPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const { supabase, tz, today, allowed, native, user } = await nutritionGate();
  if (!allowed) return <LockedNutrition native={native} />;
  const { data: np } = await supabase
    .from("nutrition_profiles")
    .select("ai_consent_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!np) redirect("/nutrition/setup");
  const { data: past } = await supabase
    .from("meal_logs")
    .select(
      "id,eaten_at,meal_items(name,serving_description,final_calories,final_protein_g,final_carbs_g,final_fat_g,confidence,sort_order)",
    )
    .eq("user_id", user.id)
    .order("eaten_at", { ascending: false })
    .limit(40);
  const recent = distinctRecent(
    (past ?? []).map((m) => ({
      id: m.id as string,
      items: (
        (m.meal_items ?? []) as {
          name: string;
          serving_description: string | null;
          final_calories: number;
          final_protein_g: number;
          final_carbs_g: number;
          final_fat_g: number;
          confidence: string | null;
          sort_order: number;
        }[]
      )
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((i) => ({
          name: i.name,
          serving: i.serving_description ?? "",
          calories: String(i.final_calories),
          protein: String(Number(i.final_protein_g)),
          carbs: String(Number(i.final_carbs_g)),
          fat: String(Number(i.final_fat_g)),
          confidence: i.confidence,
        })),
    })),
  ).map((m) => ({
    id: m.id,
    items: m.items,
    label: `${m.items.map((i) => i.name).join(", ")} · ${m.items.reduce((n, i) => n + Number(i.calories), 0)} kcal`,
  }));
  const now = new Date();
  const date = sp.date && validMealDate(sp.date, today) ? sp.date : today;
  const time = localTime(now, tz);
  return (
    <>
      <h1 className="sr-only">Log meal</h1>
      {sp.error ? <Flash tone="error">{ERRORS[sp.error] ?? ERRORS.save}</Flash> : null}
      <ScanFlow
        userId={user.id}
        aiAvailable={aiConfigured()}
        aiConsent={Boolean(np.ai_consent_at)}
        recent={recent}
        base={{
          mealType: mealTypeForHour(Number(time.slice(0, 2))),
          date,
          time,
          description: "",
        }}
      />
    </>
  );
}
