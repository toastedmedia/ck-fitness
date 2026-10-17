import type { Metadata } from "next";
import {
  GOAL_LABELS,
  NUTRITION_GOALS,
  asUnits,
  displayLength,
  displayWeight,
  estimateTargets,
  isActivity,
  isNutritionGoal,
  lengthToCm,
  lengthUnit,
  weightToKg,
  weightUnit,
} from "@ck/core";
import { Button, Cap, Card, Flash } from "@/components/app/ui";
import { LockedNutrition } from "@/components/nutrition/Bits";
import {
  PROFILE_COLUMNS,
  nutritionGate,
  type NutritionProfileRow,
} from "@/lib/nutrition";
import { saveTargets, setNutritionSharing } from "../actions";

export const metadata: Metadata = { title: "Nutrition targets" };

const ACTIVITY_LABELS = [
  ["mostly_seated", "Mostly seated"],
  ["lightly_active", "Lightly active"],
  ["active", "Active"],
  ["very_active", "Very active"],
] as const;

const input =
  "mt-1 min-h-11 w-full rounded-2xl border-2 border-line bg-surface px-3 text-sm font-normal";

const ERRORS: Record<string, string> = {
  answers: "Choose your goal and activity level.",
  estimate:
    "We could not work out an estimate from those numbers. Check them or set your own target.",
  save: "We could not save your target. Please try again.",
};

export default async function NutritionSetupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const { supabase, user, profile, allowed, native } = await nutritionGate();
  if (!allowed) return <LockedNutrition native={native} />;
  const units = asUnits(profile?.units);

  const [{ data: np }, { data: ob }, { data: prof }, { data: lastWeigh }] =
    await Promise.all([
      supabase
        .from("nutrition_profiles")
        .select(PROFILE_COLUMNS)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("onboarding_profiles")
        .select("height_cm,starting_weight_kg,activity_range,nutrition_preference")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("birth_date,gender_preference")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("weigh_ins")
        .select("weight_kg")
        .eq("user_id", user.id)
        .order("log_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
  const existing = np as NutritionProfileRow | null;

  // Reuse what she already told us; she can change any of it here.
  const weightKg = Number(lastWeigh?.weight_kg ?? ob?.starting_weight_kg ?? 0) || null;
  const heightCm = Number(ob?.height_cm ?? 0) || null;
  const age = prof?.birth_date
    ? Math.floor((Date.now() - new Date(prof.birth_date).getTime()) / 31_557_600_000)
    : null;
  const goal = isNutritionGoal(sp.goal)
    ? sp.goal
    : ((existing?.goal_type as never) ?? "maintain");
  const activity = isActivity(sp.activity)
    ? sp.activity
    : isActivity(existing?.activity_level)
      ? existing.activity_level
      : isActivity(ob?.activity_range)
        ? ob.activity_range
        : "lightly_active";
  const weightShown =
    sp.weight ?? (weightKg ? String(displayWeight(weightKg, units)) : "");
  const heightShown =
    sp.height ?? (heightCm ? String(displayLength(heightCm, units)) : "");
  const ageShown = sp.age ?? (age ? String(age) : "");
  const sex = prof?.gender_preference ?? "";

  const est = estimateTargets({
    sex,
    age: Number(ageShown),
    weightKg: weightToKg(Number(weightShown), units),
    heightCm: lengthToCm(Number(heightShown), units),
    activity,
    goal,
  });

  return (
    <>
      <h1 className="sr-only">Nutrition targets</h1>
      {sp.saved === "sharing" ? <Flash>Sharing choice saved.</Flash> : null}
      {sp.error ? (
        <Flash tone="error">{ERRORS[sp.error] ?? decodeURIComponent(sp.error)}</Flash>
      ) : null}
      {existing ? (
        <Card>
          <Cap>Your current target</Cap>
          <p className="mt-1 text-lg font-extrabold text-brand">
            {existing.daily_calorie_target.toLocaleString("en-CA")} kcal ·{" "}
            {existing.daily_protein_target}g protein
          </p>
          <p className="text-[11px] text-muted">
            Set by {existing.target_source === "coach" ? "your CK coach" : "you"}.
          </p>
        </Card>
      ) : null}

      <Card>
        <Cap>About you</Cap>
        <form className="mt-2 grid grid-cols-2 gap-2" method="get">
          <label className="text-xs font-bold text-brand">
            Goal
            <select name="goal" defaultValue={goal} className={input}>
              {NUTRITION_GOALS.map((g) => (
                <option key={g} value={g}>
                  {GOAL_LABELS[g]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold text-brand">
            Activity
            <select name="activity" defaultValue={activity} className={input}>
              {ACTIVITY_LABELS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold text-brand">
            Weight ({weightUnit(units)})
            <input
              name="weight"
              inputMode="decimal"
              defaultValue={weightShown}
              className={input}
            />
          </label>
          <label className="text-xs font-bold text-brand">
            Height ({lengthUnit(units)})
            <input
              name="height"
              inputMode="decimal"
              defaultValue={heightShown}
              className={input}
            />
          </label>
          <label className="col-span-2 text-xs font-bold text-brand">
            Age
            <input
              name="age"
              inputMode="numeric"
              defaultValue={ageShown}
              className={input}
            />
          </label>
          {ob?.nutrition_preference ? (
            <p className="col-span-2 text-[11px] text-muted">
              Food preference from sign-up:{" "}
              {String(ob.nutrition_preference).replace(/_/g, " ")}.
            </p>
          ) : null}
          <Button variant="ghost" className="col-span-2">
            Update estimate
          </Button>
        </form>
      </Card>

      <form action={saveTargets} className="flex flex-col gap-3">
        <input type="hidden" name="goal" value={goal} />
        <input type="hidden" name="activity" value={activity} />
        <input type="hidden" name="weight" value={weightShown} />
        <input type="hidden" name="height" value={heightShown} />
        <input type="hidden" name="age" value={ageShown} />
        <input type="hidden" name="sex" value={sex} />
        {est ? (
          <Card className="bg-page">
            <Cap>Estimated starting target</Cap>
            <p className="mt-1 text-2xl font-extrabold text-brand">
              {est.calories.toLocaleString("en-CA")} kcal/day
            </p>
            <p className="text-sm font-bold text-brand">{est.protein}g protein/day</p>
            <p className="mt-2 text-[11px] text-muted">
              This is an estimated starting point based on the information you provided.
              You or your CK coach can adjust it. It is not medical advice.
            </p>
            <Button name="mode" value="estimated" className="mt-3 w-full">
              Use this target
            </Button>
          </Card>
        ) : (
          <Card className="bg-page">
            <p className="text-xs">
              Add your weight, height and age above to get an estimated starting target,
              or set your own below.
            </p>
          </Card>
        )}
        <Card>
          <Cap>Adjust target</Cap>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-xs font-bold text-brand">
              Calories (kcal/day)
              <input
                name="calories"
                inputMode="numeric"
                defaultValue={existing?.daily_calorie_target ?? est?.calories ?? ""}
                className={input}
              />
            </label>
            <label className="text-xs font-bold text-brand">
              Protein (g/day)
              <input
                name="protein"
                inputMode="numeric"
                defaultValue={existing?.daily_protein_target ?? est?.protein ?? ""}
                className={input}
              />
            </label>
          </div>
          <Button name="mode" value="member" variant="ghost" className="mt-3 w-full">
            Save my own target
          </Button>
        </Card>
      </form>
      {existing ? (
        <Card>
          <Cap>Sharing with your coach</Cap>
          <form action={setNutritionSharing} className="mt-2 flex flex-col gap-2">
            <label className="flex min-h-11 items-start gap-2 text-xs">
              <input
                type="checkbox"
                name="share"
                defaultChecked={existing.share_with_coach}
                className="mt-0.5 size-5 shrink-0 accent-brand"
              />
              <span>
                <b className="text-brand">Share my nutrition logs with my CK coach</b>
                <br />
                When this is on, your CK coach may view your meal logs, estimated
                nutrition and meal photos to support your coaching. This also needs your
                general coach sharing on in Profile. You can turn it off any time.
              </span>
            </label>
            <Button variant="ghost">Save</Button>
          </form>
        </Card>
      ) : null}
    </>
  );
}
