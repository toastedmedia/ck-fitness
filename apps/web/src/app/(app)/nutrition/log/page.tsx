import type { Metadata } from "next";
import { localTime, mealTypeForHour, validMealDate } from "@ck/core";
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
  const { tz, today, allowed, native, user } = await nutritionGate();
  if (!allowed) return <LockedNutrition native={native} />;
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
