import type { Metadata } from "next";
import { DIET_LABELS, currentPlan, isDiet, mealPlanBlocks, type DietKey } from "@ck/core";
import { Button, Card, Cap } from "@/components/app/ui";
import { getContext } from "@/lib/app";
import { setDietPref } from "./actions";

export const metadata: Metadata = { title: "Meal plan" };

interface Plan {
  id: string;
  title: string;
  diet: string;
  body: string;
  starts_on: string;
  ends_on: string | null;
  published: boolean;
}

export default async function DietPage() {
  const { supabase, user, today } = await getContext();
  const [{ data: pref }, { data: plans }] = await Promise.all([
    supabase.from("member_diet_pref").select("diet").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("diet_plans")
      .select("*")
      .eq("published", true)
      .order("starts_on", { ascending: false }),
  ]);
  const all = (plans ?? []) as Plan[];
  const diet: DietKey = isDiet(pref?.diet) ? pref.diet : "vegetarian";
  const plan = currentPlan(all, diet, today);
  const earlier = all
    .filter((p) => p.diet === diet && p.starts_on <= today && p.id !== plan?.id)
    .slice(0, 6);
  return (
    <>
      <h1 className="sr-only">Meal plan</h1>
      <Card>
        <Cap>I eat</Cap>
        <form action={setDietPref} className="mt-2 grid grid-cols-2 gap-2">
          {(Object.keys(DIET_LABELS) as DietKey[]).map((d) => (
            <Button
              key={d}
              name="diet"
              value={d}
              variant={d === diet ? "primary" : "ghost"}
              aria-pressed={d === diet}
            >
              {DIET_LABELS[d]}
            </Button>
          ))}
        </form>
      </Card>
      {plan ? (
        <Card>
          <Cap>{DIET_LABELS[diet]} plan</Cap>
          <h2 className="mt-1 font-display text-xl text-brand">{plan.title}</h2>
          <div className="mt-3 text-sm leading-relaxed">
            {mealPlanBlocks(plan.body).map((b, i) =>
              b.type === "h" ? (
                <h3 key={i} className="mt-4 font-bold text-brand">
                  {b.text}
                </h3>
              ) : b.type === "ul" ? (
                <ul key={i} className="ml-5 mt-1 list-disc">
                  {b.items.map((t, j) => (
                    <li key={j}>{t}</li>
                  ))}
                </ul>
              ) : (
                <p key={i} className="mt-2">
                  {b.text}
                </p>
              ),
            )}
          </div>
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-muted">
            Your {DIET_LABELS[diet].toLowerCase()} meal plan will appear here as soon as
            your coach publishes it.
          </p>
        </Card>
      )}
      {earlier.length ? (
        <Card>
          <details>
            <summary className="min-h-11 cursor-pointer text-sm font-bold text-brand">
              Earlier plans
            </summary>
            {earlier.map((p) => (
              <details key={p.id} className="mt-2 border-t border-line pt-2">
                <summary className="min-h-10 cursor-pointer text-sm font-bold">
                  {p.title}
                </summary>
                <div className="text-sm leading-relaxed">
                  {mealPlanBlocks(p.body).map((b, i) =>
                    b.type === "h" ? (
                      <h3 key={i} className="mt-3 font-bold text-brand">
                        {b.text}
                      </h3>
                    ) : b.type === "ul" ? (
                      <ul key={i} className="ml-5 list-disc">
                        {b.items.map((t, j) => (
                          <li key={j}>{t}</li>
                        ))}
                      </ul>
                    ) : (
                      <p key={i} className="mt-2">
                        {b.text}
                      </p>
                    ),
                  )}
                </div>
              </details>
            ))}
          </details>
        </Card>
      ) : null}
      <p className="text-center text-xs text-muted">
        General guidance from your coach, not medical advice. Talk to your doctor if you
        have a health condition or allergy.
      </p>
    </>
  );
}
