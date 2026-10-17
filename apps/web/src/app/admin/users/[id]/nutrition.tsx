/* eslint-disable @next/next/no-img-element */
import {
  MEAL_LABELS,
  addDays,
  approxKcal,
  dayKey,
  dayProgress,
  grams,
  groupByDay,
  localTime,
  type MealType,
} from "@ck/core";
import { ABtn, Panel, Status, Tile, aInput } from "@/components/admin/ui";
import { audit } from "@/lib/admin";
import { QuickMessage } from "@/components/admin/QuickMessage";
import { adjustNutritionTarget } from "../../actions";
import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";

/**
 * Nutrition for the coach. Everything is read with the staff member's OWN session, so the database
 * rules (coach sharing + nutrition sharing, per meal) decide what appears; nothing is read with
 * elevated rights. Every meal opened is recorded in the audit log.
 */
export async function NutritionTab({
  supabase,
  me,
  id,
  tz,
  firstName,
  mealId,
}: {
  supabase: SupabaseClient;
  me: { id: string };
  id: string;
  tz: string;
  firstName: string;
  mealId?: string;
}) {
  const { data: np } = await supabase
    .from("nutrition_profiles")
    .select("daily_calorie_target,daily_protein_target,target_source,goal_type")
    .eq("user_id", id)
    .maybeSingle();
  if (!np)
    return (
      <Panel title="Nutrition">
        <p className="text-sm">
          Nothing to show. {firstName} has not set up Nutrition yet, or has switched off
          sharing nutrition logs with the coach.
        </p>
      </Panel>
    );
  const today = dayKey(new Date(), tz);
  const since = addDays(today, -6);
  const { data: meals } = await supabase
    .from("meal_logs")
    .select(
      "id,meal_date,eaten_at,meal_type,description,ai_estimated,final_calories,final_protein_g,final_carbs_g,final_fat_g",
    )
    .eq("user_id", id)
    .gte("meal_date", since)
    .order("eaten_at", { ascending: false });
  const rows = (meals ?? []).map((m) => ({
    ...m,
    calories: m.final_calories as number,
    protein: Number(m.final_protein_g),
    carbs: Number(m.final_carbs_g),
    fat: Number(m.final_fat_g),
  }));
  const target = { calories: np.daily_calorie_target, protein: np.daily_protein_target };
  const todayProgress = dayProgress(
    target,
    rows.filter((r) => r.meal_date === today),
  );
  const days = groupByDay(rows);
  const avg = days.length
    ? Math.round(days.reduce((n, d) => n + d.totals.calories, 0) / days.length)
    : null;
  const proteinDays = days.filter((d) => d.totals.protein >= target.protein).length;

  let detail: React.ReactNode = null;
  if (mealId) {
    const { data: meal } = await supabase
      .from("meal_logs")
      .select("*")
      .eq("id", mealId)
      .eq("user_id", id)
      .maybeSingle();
    if (meal) {
      await audit(supabase, me.id, "nutrition.meal_view", id, { meal: mealId });
      const [{ data: items }, signed] = await Promise.all([
        supabase
          .from("meal_items")
          .select("*")
          .eq("meal_log_id", mealId)
          .order("sort_order"),
        meal.photo_path
          ? supabase.storage.from("meal-photos").createSignedUrl(meal.photo_path, 120)
          : Promise.resolve({ data: null }),
      ]);
      detail = (
        <Panel
          title={`Meal: ${MEAL_LABELS[meal.meal_type as MealType]} · ${meal.meal_date} ${localTime(meal.eaten_at, tz)}`}
        >
          {signed.data?.signedUrl ? (
            <img
              src={signed.data.signedUrl}
              alt="Meal photo"
              className="mb-3 max-h-72 rounded-card"
            />
          ) : null}
          <p className="text-sm">
            Confirmed by the member:{" "}
            <b>
              {meal.ai_estimated
                ? approxKcal(meal.final_calories)
                : `${meal.final_calories} kcal`}
            </b>
            , protein {grams(Number(meal.final_protein_g))}, carbs{" "}
            {grams(Number(meal.final_carbs_g))}, fat {grams(Number(meal.final_fat_g))}
          </p>
          {meal.ai_estimated && meal.estimated_calories !== null ? (
            <p className="text-xs text-muted">
              AI estimate was ~{meal.estimated_calories} kcal ({meal.ai_model ?? "AI"}).
            </p>
          ) : null}
          {meal.description ? (
            <p className="mt-1 text-sm">Note: {meal.description}</p>
          ) : null}
          <div className="mt-2">
            <p className="text-xs font-bold text-brand">Reply about this meal</p>
            <QuickMessage userId={id} back="client" />
          </div>
          <ul className="mt-2 divide-y divide-line text-sm">
            {(items ?? []).map((i) => (
              <li key={i.id} className="py-2">
                <b>{i.name}</b>
                {i.serving_description ? ` · ${i.serving_description}` : ""}
                <span className="block text-xs text-muted">
                  {i.final_calories} kcal · P {Number(i.final_protein_g)}g · C{" "}
                  {Number(i.final_carbs_g)}g · F {Number(i.final_fat_g)}g
                  {i.ai_calories !== null && i.ai_calories !== i.final_calories
                    ? ` (AI said ${i.ai_calories} kcal)`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      );
    }
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile value={`${np.daily_calorie_target}`} label="Daily kcal target" />
        <Tile value={`${np.daily_protein_target}g`} label="Daily protein target" />
        <Tile value={`~${todayProgress.consumed.calories}`} label="Today (est. kcal)" />
        <Tile
          value={`${grams(todayProgress.consumed.protein)}`}
          label="Today's protein"
        />
        <Tile value={avg === null ? "-" : `~${avg}`} label="7-day average kcal" />
        <Tile value={`${proteinDays} / 7`} label="Protein target days" />
        <Tile value={rows.length} label="Meals (7 days)" />
        <Tile value={days.length} label="Days tracked (7)" />
      </div>
      {detail}
      <Panel title="Adjust targets">
        <form
          action={adjustNutritionTarget.bind(null, id)}
          className="flex flex-wrap items-end gap-2"
        >
          <label className="text-xs font-bold text-brand">
            Calories
            <input
              name="calories"
              defaultValue={np.daily_calorie_target}
              inputMode="numeric"
              className={`${aInput} mt-1 w-32 font-normal`}
            />
          </label>
          <label className="text-xs font-bold text-brand">
            Protein (g)
            <input
              name="protein"
              defaultValue={np.daily_protein_target}
              inputMode="numeric"
              className={`${aInput} mt-1 w-32 font-normal`}
            />
          </label>
          <ABtn variant="primary">Save target</ABtn>
        </form>
        <p className="mt-2 text-xs text-muted">
          Set by{" "}
          {np.target_source === "coach"
            ? "a coach"
            : np.target_source === "estimated"
              ? "the app estimate"
              : "the member"}
          . The member is told when a coach changes it. Keep changes conservative.
        </p>
      </Panel>
      <Panel title="Latest meals">
        {rows.length === 0 ? (
          <p className="text-sm text-muted">No meals logged in the last 7 days.</p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.slice(0, 12).map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
              >
                <span>
                  <Status tone="mute">{MEAL_LABELS[m.meal_type as MealType]}</Status>{" "}
                  {m.description || "Meal"}{" "}
                  <span className="text-xs text-muted">
                    {m.meal_date} {localTime(m.eaten_at, tz)}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-xs">
                    {m.final_calories} kcal · {grams(m.protein)} protein
                  </span>
                  <Link
                    className="font-bold text-brand underline"
                    href={`/admin/users/${id}?tab=nutrition&meal=${m.id}`}
                  >
                    Open
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
