import { describe, expect, it } from "vitest";
import { currentPlan, mealPlanBlocks } from "./mealplan";

describe("mealPlanBlocks", () => {
  it("reads headings, bullets and paragraphs", () => {
    expect(
      mealPlanBlocks("# Monday\n- Oats 1 cup\n- Eggs 2\n\nDrink water.\nStay light."),
    ).toEqual([
      { type: "h", text: "Monday" },
      { type: "ul", items: ["Oats 1 cup", "Eggs 2"] },
      { type: "p", text: "Drink water. Stay light." },
    ]);
  });
});

describe("currentPlan", () => {
  const p = (
    diet: string,
    starts_on: string,
    ends_on: string | null,
    published = true,
  ) => ({
    diet,
    starts_on,
    ends_on,
    published,
  });
  it("picks the latest started, published, not-ended plan for the diet", () => {
    const plans = [
      p("vegetarian", "2026-11-01", "2026-11-30"),
      p("vegetarian", "2026-11-10", null),
      p("vegetarian", "2026-11-20", null, false),
      p("non_vegetarian", "2026-11-05", null),
    ];
    expect(currentPlan(plans, "vegetarian", "2026-11-15")?.starts_on).toBe("2026-11-10");
    expect(currentPlan(plans, "non_vegetarian", "2026-11-04")).toBeNull();
    expect(currentPlan(plans, "vegetarian", "2026-10-31")).toBeNull();
  });
});
