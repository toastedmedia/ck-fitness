import Link from "next/link";
import { grams } from "@ck/core";
import { Cap, Card } from "@/components/app/ui";
import { Bar } from "@/components/nutrition/Bits";
import type { NutritionSnapshot } from "@/lib/nutrition-summary";

/** Compact Home card. Today's Workout stays the main action; this is deliberately smaller. */
export function HomeNutritionCard({ snap }: { snap: NutritionSnapshot }) {
  if (!snap.hasTarget || !snap.day || !snap.target)
    return (
      <Card>
        <Cap>Today&apos;s nutrition</Cap>
        <p className="mt-1 text-sm font-bold text-brand">Set your daily target</p>
        <Link
          href="/nutrition/setup"
          className="mt-2 inline-flex min-h-11 items-center rounded-button border-2 border-line px-4 text-xs font-bold text-brand"
        >
          Get started
        </Link>
      </Card>
    );
  const { day, target } = snap;
  return (
    <Card>
      <Cap>Today&apos;s nutrition</Cap>
      <p className="mt-1 text-lg font-extrabold text-brand">
        {day.consumed.calories.toLocaleString("en-CA")}
        <span className="text-xs font-bold text-muted">
          {" "}
          / {target.calories.toLocaleString("en-CA")} kcal
        </span>
      </p>
      <Bar pct={day.caloriesPct} label="Calories toward today's target" />
      <p className="mt-2 text-xs">
        Protein <b className="text-brand">{grams(day.consumed.protein)}</b> /{" "}
        {target.protein}g · {snap.mealsToday} meal{snap.mealsToday === 1 ? "" : "s"}{" "}
        logged
      </p>
      <div className="mt-2 flex items-center gap-4">
        <Link
          href="/nutrition/log"
          className="inline-flex min-h-11 items-center rounded-button bg-brand px-4 text-xs font-bold text-on-brand"
        >
          Log meal
        </Link>
        <Link
          href="/nutrition"
          className="text-xs font-bold text-brand underline underline-offset-4"
        >
          View nutrition
        </Link>
      </div>
    </Card>
  );
}

/** "Nutrition this week" inside Accountability. Supportive wording only. */
export function NutritionWeekCard({
  snap,
  workouts,
}: {
  snap: NutritionSnapshot;
  workouts?: { done: number; planned: number };
}) {
  if (!snap.week || !snap.target) return null;
  const w = snap.week;
  const stat = (v: string, l: string) => (
    <div>
      <p className="text-xl font-extrabold text-brand">{v}</p>
      <p className="text-[11px] text-muted">{l}</p>
    </div>
  );
  return (
    <Card>
      <Cap>Your nutrition week</Cap>
      <div className="mt-2 grid grid-cols-2 gap-3">
        {stat(String(w.mealsLogged), "Meals logged")}
        {stat(`${w.daysTracked} / ${w.daysElapsed}`, "Days tracked")}
        {stat(`${w.proteinDaysHit} / ${w.daysElapsed}`, "Protein target reached")}
        {stat(
          w.avgCalories === null ? "-" : `~${w.avgCalories.toLocaleString("en-CA")}`,
          "Average estimated kcal/day",
        )}
        {workouts ? stat(`${workouts.done} / ${workouts.planned}`, "Workouts") : null}
      </div>
      <p className="mt-3 text-xs font-bold text-brand">{w.line}</p>
      <Link
        href="/nutrition"
        className="mt-2 inline-flex min-h-11 items-center text-xs font-bold text-brand underline underline-offset-4"
      >
        Open nutrition
      </Link>
    </Card>
  );
}
