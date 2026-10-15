/** Meal plans written as plain text in the admin. Pure, so the preview and the member page match. */
export type DietKey = "vegetarian" | "non_vegetarian";
export const DIET_LABELS: Record<DietKey, string> = {
  vegetarian: "Vegetarian",
  non_vegetarian: "Non-vegetarian",
};
export const isDiet = (v: unknown): v is DietKey =>
  v === "vegetarian" || v === "non_vegetarian";

export type MealBlock =
  | { type: "h"; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] };

/** "# Heading" is a heading, lines starting "- " are bullets, a blank line starts a new paragraph. */
export function mealPlanBlocks(body: string): MealBlock[] {
  const out: MealBlock[] = [];
  let list: string[] = [];
  let para: string[] = [];
  const flush = () => {
    if (list.length) out.push({ type: "ul", items: list });
    if (para.length) out.push({ type: "p", text: para.join(" ") });
    list = [];
    para = [];
  };
  for (const raw of body.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line) flush();
    else if (line.startsWith("# ")) {
      flush();
      out.push({ type: "h", text: line.slice(2).trim() });
    } else if (line.startsWith("- ")) {
      if (para.length) flush();
      list.push(line.slice(2).trim());
    } else {
      if (list.length) flush();
      para.push(line);
    }
  }
  flush();
  return out;
}

export interface PlanLike {
  diet: string;
  starts_on: string;
  ends_on: string | null;
  published: boolean;
}

/** The plan to show today: published, started, not ended; the latest start wins. */
export function currentPlan<T extends PlanLike>(
  plans: T[],
  diet: DietKey,
  today: string,
): T | null {
  const ok = plans.filter(
    (p) =>
      p.published &&
      p.diet === diet &&
      p.starts_on <= today &&
      (!p.ends_on || p.ends_on >= today),
  );
  ok.sort((a, b) => (a.starts_on < b.starts_on ? 1 : -1));
  return ok[0] ?? null;
}

/** The diet to show: her own change wins, else what she answered when she signed up (vegetarian or non-vegetarian). */
export function effectiveDiet(override: unknown, onboarding: unknown): DietKey | null {
  if (isDiet(override)) return override;
  if (isDiet(onboarding)) return onboarding;
  return null;
}
