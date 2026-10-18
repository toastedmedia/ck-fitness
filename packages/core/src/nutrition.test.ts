import { describe, expect, it } from "vitest";
import {
  approxKcal,
  canScan,
  cleanItem,
  dayProgress,
  estimateTargets,
  extractJson,
  distinctRecent,
  groupByDay,
  loggingStreak,
  scaleItem,
  isTester,
  itemsTotal,
  parseTesters,
  localTime,
  localToUtc,
  mealDay,
  mergeNudgeConfig,
  nutritionNudge,
  nutritionWeek,
  mealTypeForHour,
  parseAiMeal,
  sumMacros,
  validMealDate,
  validateTargets,
} from "./nutrition";

describe("daily totals", () => {
  const meals = [
    { calories: 420, protein: 20, carbs: 50, fat: 12 },
    { calories: 610, protein: 40, carbs: 60, fat: 20 },
    { calories: 190, protein: 16, carbs: 10, fat: 8 },
  ];
  it("adds calories and macros", () => {
    expect(sumMacros(meals)).toEqual({
      calories: 1220,
      protein: 76,
      carbs: 120,
      fat: 40,
    });
  });
  it("shows what is consumed and what remains", () => {
    const p = dayProgress({ calories: 1850, protein: 110 }, meals);
    expect(p.remainingCalories).toBe(630);
    expect(p.remainingProtein).toBe(34);
    expect(p.overCalories).toBe(false);
    expect(p.proteinMet).toBe(false);
  });
  it("recalculates when a meal is edited or deleted", () => {
    const t = { calories: 1850, protein: 110 };
    expect(dayProgress(t, meals.slice(0, 2)).consumed.calories).toBe(1030);
    const edited = [{ ...meals[0], calories: 520 }, ...meals.slice(1)];
    expect(dayProgress(t, edited).remainingCalories).toBe(530);
    expect(dayProgress(t, []).remainingCalories).toBe(1850);
  });
  it("never reports negative remaining and flags over neutrally", () => {
    const p = dayProgress({ calories: 1000, protein: 20 }, [
      { calories: 1300, protein: 30 },
    ]);
    expect(p.remainingCalories).toBe(0);
    expect(p.overCalories).toBe(true);
    expect(p.proteinMet).toBe(true);
    expect(p.caloriesPct).toBe(100);
  });
});

describe("local day and meal type", () => {
  it("groups a meal into the member's local day", () => {
    // 11:30 pm Vancouver on Oct 16 is already Oct 17 in UTC.
    expect(mealDay("2026-10-17T06:30:00Z", "America/Vancouver")).toBe("2026-10-16");
    expect(mealDay("2026-10-17T08:30:00Z", "America/Vancouver")).toBe("2026-10-17");
    expect(mealDay("2026-10-17T06:30:00Z", "Asia/Kolkata")).toBe("2026-10-17");
  });
  it("suggests a meal type from the hour", () => {
    expect([8, 13, 19, 23].map(mealTypeForHour)).toEqual([
      "breakfast",
      "lunch",
      "dinner",
      "snack",
    ]);
  });
  it("only accepts sensible dates", () => {
    expect(validMealDate("2026-10-16", "2026-10-16")).toBe(true);
    expect(validMealDate("2026-10-20", "2026-10-16")).toBe(false);
    expect(validMealDate("2024-01-01", "2026-10-16")).toBe(false);
    expect(validMealDate("nope", "2026-10-16")).toBe(false);
  });
});

describe("starting target", () => {
  const base = {
    sex: "female",
    age: 32,
    weightKg: 70,
    heightCm: 165,
    activity: "lightly_active" as const,
    goal: "maintain" as const,
  };
  it("gives a conservative estimate", () => {
    const m = estimateTargets(base)!;
    const f = estimateTargets({ ...base, goal: "fat_loss" })!;
    const g = estimateTargets({ ...base, goal: "gain" })!;
    expect(f.calories).toBeLessThan(m.calories);
    expect(g.calories).toBeGreaterThan(m.calories);
    expect(f.calories).toBeGreaterThanOrEqual(1400);
    expect(m.calories % 50).toBe(0);
    expect(m.protein).toBeGreaterThanOrEqual(50);
  });
  it("never goes below 1,400 kcal and refuses bad inputs", () => {
    expect(
      estimateTargets({
        ...base,
        weightKg: 40,
        heightCm: 150,
        activity: "mostly_seated",
        goal: "fat_loss",
      })!.calories,
    ).toBe(1400);
    expect(estimateTargets({ ...base, age: 15 })).toBeNull();
    expect(estimateTargets({ ...base, weightKg: 10 })).toBeNull();
  });
  it("validates a target typed by the member", () => {
    expect(validateTargets({ calories: 1850, protein: 110 }).ok).toBe(true);
    expect(validateTargets({ calories: 300, protein: 110 }).ok).toBe(false);
    expect(validateTargets({ calories: 1850, protein: 900 }).ok).toBe(false);
  });
});

describe("AI response validation", () => {
  const good = {
    items: [
      {
        name: "Roti",
        quantity: 2,
        serving_description: "2 medium",
        estimated_calories: 190,
        estimated_protein_g: 6,
        estimated_carbs_g: 38,
        estimated_fat_g: 2,
        confidence: "medium",
      },
      {
        name: "Dal",
        quantity: 1,
        serving_description: "1 bowl",
        estimated_calories: 220,
        estimated_protein_g: 13,
        estimated_carbs_g: 30,
        estimated_fat_g: 6,
        confidence: "high",
      },
    ],
    totals: { estimated_calories: 99999 },
    notes: ["Oil quantity cannot be determined precisely."],
  };
  it("recomputes totals from the items instead of trusting the model", () => {
    const r = parseAiMeal(good);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.totals.calories).toBe(410);
      expect(r.value.totals.protein).toBe(19);
      expect(r.value.notes).toHaveLength(1);
    }
  });
  it("rejects broken output", () => {
    expect(parseAiMeal(null).ok).toBe(false);
    expect(parseAiMeal({ items: [] }).ok).toBe(false);
    expect(parseAiMeal({ items: [{ estimated_calories: 100 }] }).ok).toBe(false);
    expect(parseAiMeal({ items: [{ name: "Rice" }] }).ok).toBe(false);
  });
  it("pulls JSON out of a code fence", () => {
    expect(extractJson('```json\n{"items":[]}\n```')).toEqual({ items: [] });
    expect(extractJson("sorry, no")).toBeNull();
  });
  it("bounds silly numbers", () => {
    const i = cleanItem({
      name: "Cake",
      calories: 9e9,
      protein: -5,
      carbs: "x",
      fat: 12.34,
    })!;
    expect(i.calories).toBe(5000);
    expect(i.protein).toBe(0);
    expect(i.carbs).toBe(0);
    expect(i.fat).toBe(12.3);
    expect(cleanItem({ name: "  " })).toBeNull();
    expect(itemsTotal([i]).calories).toBe(5000);
  });
});

describe("wording and limits", () => {
  it("always says approximately", () => {
    expect(approxKcal(810)).toBe("~810 kcal");
    expect(approxKcal(1420.4)).toBe("~1,420 kcal");
  });
  it("limits AI scans per day", () => {
    expect(canScan(9)).toBe(true);
    expect(canScan(10)).toBe(false);
  });
});

describe("local date and time", () => {
  it("turns a local meal time into the right instant and back", () => {
    const at = localToUtc("2026-10-16", "13:22", "America/Vancouver")!;
    expect(at.toISOString()).toBe("2026-10-16T20:22:00.000Z");
    expect(localTime(at, "America/Vancouver")).toBe("13:22");
    expect(mealDay(at, "America/Vancouver")).toBe("2026-10-16");
    // 11:30 pm local still belongs to that local day.
    expect(
      mealDay(
        localToUtc("2026-10-16", "23:30", "America/Vancouver")!,
        "America/Vancouver",
      ),
    ).toBe("2026-10-16");
    expect(localToUtc("bad", "13:22", "America/Vancouver")).toBeNull();
  });
});

describe("history grouping", () => {
  it("groups meals into days, newest first", () => {
    const g = groupByDay([
      { meal_date: "2026-10-15", calories: 500, protein: 30 },
      { meal_date: "2026-10-16", calories: 400, protein: 20 },
      { meal_date: "2026-10-16", calories: 300, protein: 10 },
    ]);
    expect(g.map((d) => d.date)).toEqual(["2026-10-16", "2026-10-15"]);
    expect(g[0]).toMatchObject({ meals: 2, totals: { calories: 700, protein: 30 } });
  });
});

describe("weekly summary", () => {
  const d = (date: string, calories: number, protein: number) => ({
    date,
    totals: { calories, protein, carbs: 0, fat: 0 },
    meals: 3,
  });
  it("counts days tracked, protein days and the average", () => {
    const w = nutritionWeek(
      [
        d("2026-10-12", 1800, 110),
        d("2026-10-13", 1700, 90),
        d("2026-10-14", 1900, 120),
        d("2026-10-09", 3000, 200),
      ],
      { calories: 1850, protein: 110 },
      "2026-10-12",
      "2026-10-15",
    );
    expect(w).toMatchObject({
      daysTracked: 3,
      daysElapsed: 4,
      proteinDaysHit: 2,
      mealsLogged: 9,
      avgCalories: 1800,
    });
    expect(w.line).toBe("Strong consistency this week.");
  });
  it("stays encouraging when nothing is logged", () => {
    expect(
      nutritionWeek([], { calories: 1850, protein: 110 }, "2026-10-12", "2026-10-13")
        .line,
    ).toBe("One photo is enough to get started.");
  });
});

describe("nutrition nudges", () => {
  const base = {
    today: "2026-10-16",
    proteinTarget: 110,
    proteinToday: 0,
    mealsToday: 0,
    lastMealDay: "2026-10-15" as string | null,
  };
  it("asks gently when nothing is logged by the afternoon", () => {
    expect(nutritionNudge({ ...base, hour: 9 })).toBeNull();
    expect(nutritionNudge({ ...base, hour: 14 })?.kind).toBe("no_meal");
    expect(nutritionNudge({ ...base, hour: 21 })).toBeNull();
  });
  it("mentions protein only late in the day and only when well short", () => {
    const m = { ...base, mealsToday: 2 };
    expect(nutritionNudge({ ...m, hour: 15, proteinToday: 20 })).toBeNull();
    expect(nutritionNudge({ ...m, hour: 18, proteinToday: 75 })).toBeNull();
    const n = nutritionNudge({ ...m, hour: 18, proteinToday: 40 });
    expect(n?.kind).toBe("protein");
    expect(n?.body).toContain("70g short");
  });
  it("sends a restart note after 3 quiet days and never shames", () => {
    const n = nutritionNudge({ ...base, hour: 11, lastMealDay: "2026-10-12" });
    expect(n?.kind).toBe("idle");
    const all = [
      n,
      nutritionNudge({ ...base, hour: 14 }),
      nutritionNudge({ ...base, hour: 18, mealsToday: 1, proteinToday: 10 }),
    ];
    for (const x of all)
      expect(`${x?.title} ${x?.body}`).not.toMatch(/fail|overate|bad day/i);
  });
  it("is quiet when the member is over their calories (no such rule exists)", () => {
    expect(
      nutritionNudge({ ...base, hour: 18, mealsToday: 4, proteinToday: 120 }),
    ).toBeNull();
  });
  it("bounds admin overrides", () => {
    expect(mergeNudgeConfig({ noMealHour: 2, idleDays: 5 })).toMatchObject({
      noMealHour: 13,
      idleDays: 5,
    });
    expect(mergeNudgeConfig(null).proteinShortPct).toBe(60);
  });
});

describe("tester list", () => {
  it("is empty unless the owners list someone, and cleans the list", () => {
    expect(parseTesters(null)).toEqual([]);
    expect(parseTesters("A@x.com, bad\n a@X.com ;b@y.org")).toEqual([
      "a@x.com",
      "b@y.org",
    ]);
    expect(parseTesters(["Z@z.com", 5])).toContain("z@z.com");
  });
  it("matches emails case-insensitively", () => {
    const t = parseTesters("Tester@Example.com");
    expect(isTester("tester@EXAMPLE.com", t)).toBe(true);
    expect(isTester("someone@else.com", t)).toBe(false);
    expect(isTester(null, t)).toBe(false);
  });
});

describe("streaks, recents and portions", () => {
  it("counts consecutive logged days and keeps the streak alive until the day ends", () => {
    expect(loggingStreak(["2026-10-14", "2026-10-15", "2026-10-16"], "2026-10-16")).toBe(
      3,
    );
    expect(loggingStreak(["2026-10-14", "2026-10-15"], "2026-10-16")).toBe(2);
    expect(loggingStreak(["2026-10-12", "2026-10-15"], "2026-10-16")).toBe(1);
    expect(loggingStreak(["2026-10-10"], "2026-10-16")).toBe(0);
  });
  it("lists each usual meal once, newest first", () => {
    const m = (id: string, ...names: string[]) => ({
      id,
      items: names.map((name) => ({ name })),
    });
    const r = distinctRecent([
      m("a", "Dal", "Roti"),
      m("b", "roti", "dal"),
      m("c", "Oats"),
      m("d"),
    ]);
    expect(r.map((x) => x.id)).toEqual(["a", "c"]);
  });
  it("scales a portion", () => {
    expect(scaleItem({ calories: 200, protein: 10, carbs: 30, fat: 5 }, 1.5)).toEqual({
      calories: 300,
      protein: 15,
      carbs: 45,
      fat: 7.5,
    });
    expect(
      scaleItem({ calories: 200, protein: 10, carbs: 30, fat: 5 }, 99).calories,
    ).toBe(200);
  });
});
