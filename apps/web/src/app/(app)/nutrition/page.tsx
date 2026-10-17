import type { Metadata } from "next";
import Link from "next/link";
import {
  MEAL_LABELS,
  MEAL_TYPES,
  addDays,
  approxKcal,
  dayProgress,
  grams,
  localTime,
  type MealType,
} from "@ck/core";
import { Cap, Card } from "@/components/app/ui";
import { Bar, LockedNutrition } from "@/components/nutrition/Bits";
import { track } from "@/lib/events";
import {
  PROFILE_COLUMNS,
  nutritionGate,
  type NutritionProfileRow,
} from "@/lib/nutrition";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Nutrition" };

interface Meal {
  id: string;
  meal_type: MealType;
  eaten_at: string;
  description: string | null;
  ai_estimated: boolean;
  photo_path: string | null;
  final_calories: number;
  final_protein_g: number;
  final_carbs_g: number;
  final_fat_g: number;
}

export default async function NutritionPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const sp = await searchParams;
  const { supabase, user, tz, today, allowed, native } = await nutritionGate();
  if (!allowed) return <LockedNutrition native={native} />;
  const date =
    /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") && sp.date! <= today ? sp.date! : today;

  const [{ data: np }, { data: mealRows }] = await Promise.all([
    supabase
      .from("nutrition_profiles")
      .select(PROFILE_COLUMNS)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("meal_logs")
      .select(
        "id,meal_type,eaten_at,description,ai_estimated,photo_path,final_calories,final_protein_g,final_carbs_g,final_fat_g",
      )
      .eq("user_id", user.id)
      .eq("meal_date", date)
      .order("eaten_at"),
  ]);
  const profile = np as NutritionProfileRow | null;
  if (!profile) redirect("/nutrition/setup");
  const meals = (mealRows ?? []) as Meal[];
  const target = {
    calories: profile.daily_calorie_target,
    protein: profile.daily_protein_target,
  };
  const day = dayProgress(
    target,
    meals.map((m) => ({
      calories: m.final_calories,
      protein: Number(m.final_protein_g),
      carbs: Number(m.final_carbs_g),
      fat: Number(m.final_fat_g),
    })),
  );
  // Thumbnails: short-lived links to private photos.
  const paths = meals.map((m) => m.photo_path).filter((p): p is string => Boolean(p));
  const { data: signed } = paths.length
    ? await supabase.storage.from("meal-photos").createSignedUrls(paths, 120)
    : { data: [] };
  const thumb = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  if (date === today) await track(user.id, "nutrition_page_viewed");

  const isToday = date === today;
  const label = isToday
    ? "Today"
    : new Date(`${date}T12:00:00Z`).toLocaleDateString("en-CA", {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      });

  return (
    <>
      <h1 className="sr-only">Nutrition</h1>
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/nutrition?date=${addDays(date, -1)}`}
          aria-label="Previous day"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-button border-2 border-line text-brand"
        >
          ←
        </Link>
        <p className="font-bold text-brand">{label}</p>
        {isToday ? (
          <span className="min-w-11" />
        ) : (
          <Link
            href={`/nutrition?date=${addDays(date, 1)}`}
            aria-label="Next day"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-button border-2 border-line text-brand"
          >
            →
          </Link>
        )}
      </div>

      <Card>
        <Cap>{isToday ? "Today" : label}</Cap>
        <p className="mt-1 text-2xl font-extrabold text-brand">
          {day.consumed.calories.toLocaleString("en-CA")}
          <span className="text-sm font-bold text-muted">
            {" "}
            / {target.calories.toLocaleString("en-CA")} kcal
          </span>
        </p>
        <Bar pct={day.caloriesPct} label="Calories toward today's target" />
        <p className="mt-1 text-xs">
          {day.overCalories
            ? "Today's estimated intake is above your current target."
            : `${day.remainingCalories.toLocaleString("en-CA")} kcal remaining`}
        </p>
        <div className="mt-3">
          <p className="text-sm font-bold text-brand">
            Protein {grams(day.consumed.protein)}
            <span className="font-normal text-muted"> / {target.protein}g</span>
          </p>
          <Bar pct={day.proteinPct} label="Protein toward today's target" />
          <p className="mt-1 text-xs">
            {day.proteinMet ? "Protein goal reached" : `${day.remainingProtein}g to go`}
          </p>
        </div>
        <p className="mt-3 text-xs text-muted">
          Carbs {grams(day.consumed.carbs)} · Fat {grams(day.consumed.fat)} ·{" "}
          {meals.length} meal{meals.length === 1 ? "" : "s"} logged
        </p>
      </Card>

      <Link
        href={`/nutrition/log?date=${date}`}
        className="inline-flex min-h-12 items-center justify-center rounded-button bg-brand px-4 text-sm font-bold text-on-brand"
      >
        + Log meal
      </Link>

      {MEAL_TYPES.map((t) => {
        const list = meals.filter((m) => m.meal_type === t);
        if (list.length === 0 && t === "other") return null;
        return (
          <section key={t} className="flex flex-col gap-2">
            <Cap>{t === "snack" ? "Snacks" : MEAL_LABELS[t]}</Cap>
            {list.length === 0 ? (
              <p className="text-xs text-muted">Nothing logged.</p>
            ) : (
              list.map((m) => {
                const img = m.photo_path ? thumb.get(m.photo_path) : null;
                return (
                  <Link key={m.id} href={`/nutrition/meal/${m.id}`}>
                    <Card className="flex items-center gap-3">
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={img}
                          alt=""
                          className="size-16 shrink-0 rounded-xl object-cover"
                        />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-brand">
                          {m.description || MEAL_LABELS[m.meal_type]}
                        </p>
                        <p className="text-[11px] text-muted">
                          {MEAL_LABELS[m.meal_type]} · {localTime(m.eaten_at, tz)}
                        </p>
                        <p className="text-xs">
                          {m.ai_estimated
                            ? approxKcal(m.final_calories)
                            : `${m.final_calories} kcal`}{" "}
                          · {grams(Number(m.final_protein_g))} protein
                        </p>
                      </div>
                    </Card>
                  </Link>
                );
              })
            )}
          </section>
        );
      })}

      <div className="flex flex-wrap gap-4 text-xs font-bold text-brand">
        <Link href="/accountability/diet" className="underline underline-offset-4">
          Meal plan
        </Link>
        <Link href="/nutrition/history" className="underline underline-offset-4">
          History
        </Link>
        <Link href="/nutrition/setup" className="underline underline-offset-4">
          Change my targets
        </Link>
      </div>
      <p className="text-center text-[11px] text-muted">
        Estimates only, for building habits. Not medical advice.
      </p>
    </>
  );
}
