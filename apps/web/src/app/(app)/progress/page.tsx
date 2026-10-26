import type { Metadata } from "next";
import Link from "next/link";
import {
  addDays,
  bmiLabel,
  bmiTypicalRangeKg,
  calcBmi,
  weekStart,
  asUnits,
  displayLength,
  displayWeight,
  lengthUnit,
  weightUnit,
} from "@ck/core";
import { BarChart, LineChart } from "@/components/app/charts";
import { Button, Cap, Card, Flash } from "@/components/app/ui";
import { MealPlanCard } from "@/components/home/MealPlanCard";
import { getContext } from "@/lib/app";
import { flags } from "@/lib/flags";
import { logMeasurements, toggleBmi } from "../actions";

export const metadata: Metadata = { title: "Progress" };

const num = (v: string, label: string) => (
  <label className="text-xs font-semibold">
    {label}
    <input
      name={v}
      type="number"
      inputMode="decimal"
      step="0.1"
      min={1}
      max={299}
      className="mt-1 min-h-11 w-full rounded-2xl border-2 border-line bg-surface px-3 text-sm"
    />
  </label>
);

export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const { supabase, user, today, goals, profile } = await getContext();
  const units = asUnits(profile?.units);
  const since = addDays(weekStart(today), -28);
  const { data: ob } = await supabase
    .from("onboarding_profiles")
    .select("height_cm")
    .eq("user_id", user.id)
    .maybeSingle();
  const [weighs, meas, acts, water, checkins] = await Promise.all([
    supabase
      .from("weigh_ins")
      .select("log_date,weight_kg")
      .eq("user_id", user.id)
      .order("log_date")
      .limit(90),
    supabase
      .from("body_measurements")
      .select("*")
      .eq("user_id", user.id)
      .order("log_date", { ascending: false })
      .limit(2),
    supabase
      .from("scheduled_actions")
      .select("scheduled_for")
      .eq("user_id", user.id)
      .eq("action_type", "workout")
      .eq("status", "completed")
      .gte("scheduled_for", since),
    supabase
      .from("habit_logs")
      .select("log_date,value")
      .eq("user_id", user.id)
      .eq("habit_type", "water_ml")
      .gte("log_date", addDays(today, -6)),
    supabase
      .from("weekly_checkins")
      .select(
        "week_start,planned_workouts,completed_workouts,energy,sleep,soreness,confidence",
      )
      .eq("user_id", user.id)
      .order("week_start", { ascending: false })
      .limit(6),
  ]);

  const w = (weighs.data ?? []) as { log_date: string; weight_kg: number }[];
  const counts = new Map<string, number>();
  for (const a of (acts.data ?? []) as { scheduled_for: string }[]) {
    const k = weekStart(a.scheduled_for);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const thisWeek = weekStart(today);
  const bars = Array.from({ length: 5 }, (_, i) => {
    const k = addDays(thisWeek, (i - 4) * 7);
    return { x: k.slice(5), y: counts.get(k) ?? 0, highlight: k === thisWeek };
  });
  const perDay = new Map<string, number>();
  for (const r of (water.data ?? []) as { log_date: string; value: number }[])
    perDay.set(r.log_date, (perDay.get(r.log_date) ?? 0) + Number(r.value));
  const waterDays = [...perDay.values()].filter((v) => v >= goals.waterTargetMl).length;
  const [latest, previous] = (meas.data ?? []) as Record<
    string,
    number | string | null
  >[];
  const rows: [string, string][] = [
    ["Waist", "waist_cm"],
    ["Hips", "hips_cm"],
    ["Bust", "bust_cm"],
    ["Thigh", "thigh_cm"],
    ["Arm", "arm_cm"],
  ];

  const height = Number(ob?.height_cm ?? 0) || null;
  const lastW = w.length ? Number(w[w.length - 1].weight_kg) : null;
  const bmi = height && lastW ? calcBmi(lastW, height) : null;
  const typical = bmiTypicalRangeKg(height ?? 170);

  return (
    <>
      <h1 className="sr-only">Progress</h1>
      {sp.saved ? <Flash>Saved. Nice work.</Flash> : null}
      {sp.error ? <Flash tone="error">Enter at least one measurement.</Flash> : null}

      <Card>
        <Cap>Weight</Cap>
        <div className="mt-1">
          <LineChart
            label="Your weight over time"
            unit={` ${weightUnit(units)}`}
            points={w.slice(-12).map((p) => ({
              x: p.log_date.slice(5),
              y: displayWeight(Number(p.weight_kg), units),
            }))}
          />
        </div>
        <p className="mt-1 text-[10.5px] text-muted">
          Weigh in about once a week. Day-to-day changes are normal.
        </p>
      </Card>

      <Card>
        <div className="flex items-start justify-between gap-2">
          <Cap>BMI</Cap>
          <form action={toggleBmi}>
            <button className="min-h-10 px-1 text-[11px] font-bold text-brand underline underline-offset-4">
              {profile?.hide_bmi ? "Show" : "Hide"}
            </button>
          </form>
        </div>
        {profile?.hide_bmi ? (
          <p className="text-xs text-muted">Hidden. You can show it any time.</p>
        ) : bmi === null || !height ? (
          <p className="text-xs text-muted">
            {height
              ? "Log a weight to see your BMI."
              : "Add your height in your profile answers to see your BMI."}
          </p>
        ) : (
          <>
            <p className="mt-1 text-2xl font-extrabold text-brand tabular-nums">
              {bmi}{" "}
              <span className="text-sm font-semibold text-muted">
                · {bmiLabel(bmi).replace("range", "Range")}
              </span>
            </p>
            <div
              role="img"
              aria-label={`BMI ${bmi} on a scale from 15 to 40`}
              className="relative mt-2 h-2 w-full overflow-hidden rounded-full bg-page"
            >
              <div
                aria-hidden="true"
                className="absolute inset-y-0 bg-success-soft"
                style={{
                  left: `${((18.5 - 15) / 25) * 100}%`,
                  width: `${((24.9 - 18.5) / 25) * 100}%`,
                }}
              />
              <div
                aria-hidden="true"
                className="absolute -top-0.5 h-3 w-1.5 rounded bg-brand"
                style={{ left: `${Math.min(97, Math.max(0, ((bmi - 15) / 25) * 100))}%` }}
              />
            </div>
            <p className="mt-2 text-xs">
              For your height, a BMI of 18.5 to 24.9 is about{" "}
              {displayWeight(typical.low, units)} to {displayWeight(typical.high, units)}{" "}
              {weightUnit(units)}.
            </p>
          </>
        )}
        <p className="mt-1 text-[10.5px] text-muted">
          Information only. Not a diagnosis. BMI does not account for muscle, bone or body
          shape.
        </p>
      </Card>

      <Card>
        <Cap>Workouts per week</Cap>
        <div className="mt-1">
          <BarChart label="Workouts completed in the last five weeks" bars={bars} />
        </div>
      </Card>

      <Card>
        <Cap>Water</Cap>
        <p className="mt-1 text-xl font-extrabold text-brand">{waterDays} of 7 days</p>
        <p className="text-[10.5px] text-muted">
          You reached your water target on {waterDays} of the last 7 days.
        </p>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <Cap>Measurements</Cap>
          <span className="text-[10.5px] text-muted">
            {latest ? `Last logged ${String(latest.log_date).slice(5)}` : "None yet"}
          </span>
        </div>
        {latest ? (
          <dl className="mt-2 grid grid-cols-5 gap-1 text-center">
            {rows.map(([label, key]) => {
              const diff =
                latest[key] != null && previous?.[key] != null
                  ? Math.round(
                      (displayLength(Number(latest[key]), units) -
                        displayLength(Number(previous[key]), units)) *
                        10,
                    ) / 10
                  : null;
              return (
                <div key={key}>
                  <dt className="text-[10px] text-muted">{label}</dt>
                  <dd className="text-sm font-extrabold text-brand tabular-nums">
                    {latest[key] != null
                      ? displayLength(Number(latest[key]), units)
                      : "-"}
                  </dd>
                  {diff !== null && diff !== 0 ? (
                    <dd className="text-[10px] text-muted">
                      {diff > 0 ? "+" : ""}
                      {diff}
                    </dd>
                  ) : null}
                </div>
              );
            })}
          </dl>
        ) : null}
        <details className="mt-2">
          <summary className="flex min-h-10 cursor-pointer items-center text-[11px] font-bold text-brand underline underline-offset-4">
            Log measurements ({lengthUnit(units)})
          </summary>
          <form action={logMeasurements} className="mt-2 grid grid-cols-2 gap-2">
            {num("waist", "Waist")}
            {num("hips", "Hips")}
            {num("bust", "Bust or chest")}
            {num("thigh", "Thigh")}
            {num("arm", "Arm")}
            <div className="col-span-2">
              <Button variant="primary" className="w-full">
                Save measurements
              </Button>
            </div>
          </form>
        </details>
      </Card>

      <MealPlanCard title={null} />

      {flags.progressPhotos ? (
        <Card>
          <Cap>Progress photos</Cap>
          <p className="mt-1 text-xs text-muted">
            Optional weekly photos. Private to you.
          </p>
          <Link
            href="/progress/photos"
            className="mt-2 inline-flex min-h-11 items-center rounded-button border-2 border-line px-4 text-xs font-bold text-brand"
          >
            Open photos
          </Link>
        </Card>
      ) : null}

      <Card>
        <Cap>Weekly check-ins</Cap>
        {(checkins.data ?? []).length === 0 ? (
          <p className="mt-1 text-xs text-muted">
            Your check-ins will show here after your first one.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col divide-y divide-line">
            {((checkins.data ?? []) as Record<string, number | string>[]).map((c) => (
              <li
                key={String(c.week_start)}
                className="flex items-center justify-between py-2 text-xs"
              >
                <span className="font-semibold">
                  Week of {String(c.week_start).slice(5)}
                </span>
                <span className="text-muted">
                  {c.completed_workouts} of {c.planned_workouts} workouts · energy{" "}
                  {c.energy}/5
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
