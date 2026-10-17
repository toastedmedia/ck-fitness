import type { Metadata } from "next";
import Link from "next/link";
import { addDays, approxKcal, grams, groupByDay } from "@ck/core";
import { Card } from "@/components/app/ui";
import { LockedNutrition } from "@/components/nutrition/Bits";
import { nutritionGate } from "@/lib/nutrition";

export const metadata: Metadata = { title: "Nutrition history" };

export default async function NutritionHistoryPage() {
  const { supabase, user, today, allowed, native } = await nutritionGate();
  if (!allowed) return <LockedNutrition native={native} />;
  const { data } = await supabase
    .from("meal_logs")
    .select("meal_date,final_calories,final_protein_g,final_carbs_g,final_fat_g")
    .eq("user_id", user.id)
    .gte("meal_date", addDays(today, -60))
    .order("meal_date", { ascending: false });
  const days = groupByDay(
    (data ?? []).map((m) => ({
      meal_date: m.meal_date as string,
      calories: m.final_calories,
      protein: Number(m.final_protein_g),
      carbs: Number(m.final_carbs_g),
      fat: Number(m.final_fat_g),
    })),
  );
  return (
    <>
      <h1 className="sr-only">Nutrition history</h1>
      <form method="get" action="/nutrition" className="flex items-end gap-2">
        <label className="flex-1 text-xs font-bold text-brand">
          Jump to a date
          <input
            type="date"
            name="date"
            max={today}
            defaultValue={today}
            className="mt-1 min-h-11 w-full rounded-2xl border-2 border-line bg-surface px-3 text-sm font-normal"
          />
        </label>
        <button className="min-h-11 rounded-button border-2 border-line px-4 text-xs font-bold text-brand">
          Open
        </button>
      </form>
      {days.length === 0 ? (
        <Card>
          <p className="text-sm">
            No meals logged yet. One photo is enough to get started.
          </p>
        </Card>
      ) : (
        days.map((d) => (
          <Link key={d.date} href={`/nutrition?date=${d.date}`}>
            <Card className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-brand">
                  {new Date(`${d.date}T12:00:00Z`).toLocaleDateString("en-CA", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    timeZone: "UTC",
                  })}
                </p>
                <p className="text-[11px] text-muted">
                  {d.meals} meal{d.meals === 1 ? "" : "s"}
                </p>
              </div>
              <p className="text-right text-xs">
                <b className="text-brand">{approxKcal(d.totals.calories)}</b>
                <br />
                {grams(d.totals.protein)} protein
              </p>
            </Card>
          </Link>
        ))
      )}
    </>
  );
}
