"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveOnboardingStep } from "@/app/onboarding/actions";
import { asUnits, feetInchesToCm, lbToKg } from "@ck/core";
import { ChipGroup, type Option } from "@/components/ui/ChipGroup";
import { Field, TextArea } from "@/components/ui/Field";

type Data = Record<string, unknown>;

const opt = (pairs: [string, string][]): Option[] => pairs;
const UNITS = opt([
  ["metric", "kg and cm"],
  ["imperial", "lb and ft/in"],
]);
const GENDER = opt([
  ["female", "Female"],
  ["male", "Male"],
  ["non_binary", "Non-binary"],
  ["prefer_not_to_say", "Prefer not to say"],
]);
const GOALS = opt([
  ["fat_loss", "Fat loss"],
  ["strength", "Strength"],
  ["mobility", "Mobility"],
  ["core_pelvic", "Core and pelvic"],
  ["general_fitness", "General fitness"],
  ["performance", "Performance"],
]);
const LEVELS = opt([
  ["beginner", "Beginner"],
  ["intermediate", "Intermediate"],
  ["advanced", "Advanced"],
]);
const LOCATIONS = opt([
  ["home", "At home"],
  ["gym", "Gym"],
  ["both", "Both"],
]);
const EQUIPMENT = opt([
  ["none", "None"],
  ["mat", "Mat"],
  ["bands", "Bands"],
  ["dumbbells", "Dumbbells"],
  ["kettlebell", "Kettlebell"],
  ["full_gym", "Full gym"],
]);
const DAYS = opt([
  ["0", "Mon"],
  ["1", "Tue"],
  ["2", "Wed"],
  ["3", "Thu"],
  ["4", "Fri"],
  ["5", "Sat"],
  ["6", "Sun"],
]);
const NUTRITION = opt([
  ["vegetarian", "Vegetarian"],
  ["non_vegetarian", "Non-vegetarian"],
  ["other", "Something else"],
]);
const ACTIVITY = opt([
  ["mostly_seated", "Mostly seated"],
  ["lightly_active", "Lightly active"],
  ["active", "Active"],
  ["very_active", "Very active"],
]);
const SLEEP = opt([
  ["under_5", "Under 5 hours"],
  ["5_to_6", "5 to 6"],
  ["6_to_7", "6 to 7"],
  ["7_to_8", "7 to 8"],
  ["over_8", "Over 8"],
]);
const PREGNANCY = opt([
  ["no", "No"],
  ["yes", "Yes"],
  ["prefer_not_to_say", "Prefer not to say"],
]);
const COMMIT = opt([
  ["1", "1"],
  ["2", "2"],
  ["3", "3"],
  ["4", "4"],
  ["5", "5"],
  ["6", "6"],
  ["7", "7"],
]);

const TITLES = [
  "About you",
  "Your goal",
  "How you train",
  "Your lifestyle",
  "Safety and commitment",
];

export function OnboardingFlow({ initial }: { initial: Data }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<Data>({
    reminderTime: "07:00",
    equipment: [],
    preferredDays: [],
    secondaryGoals: [],
    ...initial,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const set = (k: string, v: unknown) => setData((d) => ({ ...d, [k]: v }));
  const str = (k: string) =>
    data[k] === undefined || data[k] === null ? "" : String(data[k]);
  const arr = (k: string) => ((data[k] as unknown[]) ?? []).map(String);

  const next = () =>
    start(async () => {
      const payload: Data = { ...data };
      if (step === 1) {
        // Everything is stored in kg and cm, whatever she types in.
        const u = asUnits(data.units);
        payload.units = u;
        const w = Number(data.weightDisplay);
        payload.weightKg = u === "imperial" ? lbToKg(w) : w;
        if (u === "imperial")
          payload.heightCm = feetInchesToCm(
            Number(data.heightFt || 0),
            Number(data.heightIn || 0),
          );
      }
      if (step === 3) payload.preferredDays = arr("preferredDays").map(Number);
      if (step === 5) {
        payload.weeklyCommitment = Number(
          payload.weeklyCommitment ?? arr("preferredDays").length,
        );
      }
      const res = await saveOnboardingStep(step, payload);
      if (!res.ok) return setErrors(res.errors);
      setErrors({});
      if (step === 5) return router.push("/progress/photos?start=1");
      setStep(step + 1);
      window.scrollTo({ top: 0 });
    });

  return (
    <div className="mt-4 flex flex-col gap-5">
      <div className="flex gap-1.5" aria-hidden="true">
        {TITLES.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full ${i < step ? "bg-accent" : "bg-line"}`}
          />
        ))}
      </div>
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-accent-strong">
          Step {step} of 5
        </p>
        <h1 className="mt-1 font-display text-3xl text-brand">{TITLES[step - 1]}</h1>
      </div>

      {step === 1 && (
        <>
          <Field
            label="First name"
            value={str("firstName")}
            onChange={(e) => set("firstName", e.target.value)}
            error={errors.firstName}
            autoComplete="given-name"
          />
          <Field
            label="Last name"
            value={str("lastName")}
            onChange={(e) => set("lastName", e.target.value)}
            error={errors.lastName}
            autoComplete="family-name"
          />
          <Field
            label="Date of birth"
            type="date"
            value={str("birthDate")}
            onChange={(e) => set("birthDate", e.target.value)}
            error={errors.birthDate}
            autoComplete="bday"
          />
          <Field
            label="Phone number"
            type="tel"
            inputMode="tel"
            value={str("phone")}
            onChange={(e) => set("phone", e.target.value)}
            error={errors.phone}
            autoComplete="tel"
            hint="So your coach can reach you."
          />
          <ChipGroup
            label="Gender"
            options={GENDER}
            value={str("gender")}
            onChange={(v) => set("gender", v)}
            error={errors.gender}
          />
          <ChipGroup
            label="Units"
            options={UNITS}
            value={asUnits(data.units)}
            onChange={(v) => set("units", v)}
          />
          {asUnits(data.units) === "imperial" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Height (ft)"
                type="number"
                inputMode="numeric"
                value={str("heightFt")}
                onChange={(e) => set("heightFt", e.target.value)}
                error={errors.heightCm}
              />
              <Field
                label="Height (in)"
                type="number"
                inputMode="numeric"
                value={str("heightIn")}
                onChange={(e) => set("heightIn", e.target.value)}
              />
            </div>
          ) : (
            <Field
              label="Height (cm)"
              type="number"
              inputMode="decimal"
              value={str("heightCm")}
              onChange={(e) => set("heightCm", e.target.value)}
              error={errors.heightCm}
            />
          )}
          <Field
            label={asUnits(data.units) === "imperial" ? "Weight (lb)" : "Weight (kg)"}
            type="number"
            inputMode="decimal"
            step="0.1"
            value={str("weightDisplay")}
            onChange={(e) => set("weightDisplay", e.target.value)}
            error={errors.weightKg}
            hint="This is your starting point. You will log a new weight each week."
          />
        </>
      )}
      {step === 2 && (
        <>
          <ChipGroup
            label="Your main goal"
            options={GOALS}
            value={str("primaryGoal")}
            onChange={(v) => set("primaryGoal", v)}
            error={errors.primaryGoal}
          />
          <ChipGroup
            label="Anything else? (optional, up to 2)"
            multi
            max={2}
            options={GOALS.filter(([v]) => v !== str("primaryGoal"))}
            value={arr("secondaryGoals")}
            onChange={(v) => set("secondaryGoals", v)}
          />
          <p className="text-sm text-muted">
            Goals help us suggest where to start. They are not medical promises.
          </p>
        </>
      )}
      {step === 3 && (
        <>
          <ChipGroup
            label="Your level"
            options={LEVELS}
            value={str("level")}
            onChange={(v) => set("level", v)}
            error={errors.level}
          />
          <ChipGroup
            label="Where do you train?"
            options={LOCATIONS}
            value={str("location")}
            onChange={(v) => set("location", v)}
            error={errors.location}
          />
          <ChipGroup
            label="Equipment you have"
            multi
            options={EQUIPMENT}
            value={arr("equipment")}
            onChange={(v) => set("equipment", v)}
          />
          <ChipGroup
            label="Days you want to train"
            multi
            options={DAYS}
            value={arr("preferredDays")}
            onChange={(v) => set("preferredDays", v)}
            error={errors.preferredDays}
          />
          <Field
            label="Reminder time"
            type="time"
            value={str("reminderTime")}
            onChange={(e) => set("reminderTime", e.target.value)}
            error={errors.reminderTime}
          />
        </>
      )}
      {step === 4 && (
        <>
          <ChipGroup
            label="Food preference"
            options={NUTRITION}
            value={str("nutrition")}
            onChange={(v) => set("nutrition", v)}
            error={errors.nutrition}
          />
          <ChipGroup
            label="Your usual day"
            options={ACTIVITY}
            value={str("activity")}
            onChange={(v) => set("activity", v)}
            error={errors.activity}
          />
          <ChipGroup
            label="Sleep on a normal night"
            options={SLEEP}
            value={str("sleep")}
            onChange={(v) => set("sleep", v)}
            error={errors.sleep}
          />
          <TextArea
            label="Anything that affects your schedule? (optional)"
            value={str("constraints")}
            onChange={(e) => set("constraints", e.target.value)}
          />
        </>
      )}
      {step === 5 && (
        <>
          <TextArea
            label="Any injuries or limitations? (optional)"
            value={str("limitations")}
            onChange={(e) => set("limitations", e.target.value)}
          />
          <ChipGroup
            label="Are you pregnant or recently postpartum?"
            options={PREGNANCY}
            value={str("pregnancyContext")}
            onChange={(v) => set("pregnancyContext", v)}
            error={errors.pregnancyContext}
          />
          <TextArea
            label="Why are you starting now? (optional)"
            value={str("startingReason")}
            onChange={(e) => set("startingReason", e.target.value)}
          />
          <ChipGroup
            label="Training days per week"
            options={COMMIT}
            value={str("weeklyCommitment") || String(arr("preferredDays").length || "")}
            onChange={(v) => set("weeklyCommitment", v)}
            error={errors.weeklyCommitment}
          />
          <label className="flex min-h-12 items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 size-5 accent-brand"
              checked={data.acknowledged === true}
              onChange={(e) => set("acknowledged", e.target.checked)}
            />
            <span>
              I understand Chardikala Fitness gives general fitness guidance, not medical
              advice, and I will check with a health professional if I have concerns.
            </span>
          </label>
          {errors.acknowledged ? (
            <p role="alert" className="text-sm font-semibold text-danger">
              {errors.acknowledged}
            </p>
          ) : null}
        </>
      )}

      {errors.form ? (
        <p role="alert" className="font-semibold text-danger">
          {errors.form}
        </p>
      ) : null}
      <div className="flex gap-3">
        {step > 1 && (
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            className="min-h-12 rounded-button border-2 border-brand px-6 font-semibold text-brand"
          >
            Back
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={next}
          className="min-h-12 flex-1 rounded-button bg-brand px-6 font-semibold text-on-brand disabled:opacity-60"
        >
          {pending ? "Saving..." : step === 5 ? "Finish" : "Continue"}
        </button>
      </div>
    </div>
  );
}
