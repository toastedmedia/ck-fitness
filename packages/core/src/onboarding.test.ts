import { describe, expect, it } from "vitest";
import {
  ageFromBirthDate,
  bmiLabel,
  bmiTypicalRangeKg,
  calcBmi,
  needsSafetyGuidance,
  validateAbout,
  validateGoal,
  validateSafety,
  validateTraining,
} from "./onboarding";

const now = new Date("2026-10-10T12:00:00Z");
const about = {
  firstName: " Priya ",
  lastName: "Sharma",
  birthDate: "1992-03-14",
  gender: "female",
  heightCm: 168,
  weightKg: 67.2,
  phone: "604-555-0123",
};

describe("age and BMI", () => {
  it("counts birthdays correctly", () => {
    expect(ageFromBirthDate("2008-10-10", now)).toBe(18);
    expect(ageFromBirthDate("2008-10-11", now)).toBe(17);
  });
  it("calculates BMI to one decimal", () => expect(calcBmi(67.2, 168)).toBe(23.8));
  it("labels BMI without diagnosing", () => {
    expect(bmiLabel(23.8)).toBe("Typical range");
    expect(bmiLabel(31)).toBe("Well above typical range");
  });
});

describe("validateAbout", () => {
  it("accepts valid input and trims names", () => {
    const r = validateAbout(about, now);
    expect(r.ok && r.value.firstName).toBe("Priya");
  });
  it("blocks under-18 sign-ups", () => {
    const r = validateAbout({ ...about, birthDate: "2010-01-01" }, now);
    expect(!r.ok && r.errors.birthDate).toMatch(/18/);
  });
  it("rejects out-of-range height and weight", () => {
    const r = validateAbout({ ...about, heightCm: 20, weightKg: 5 }, now);
    expect(!r.ok && Object.keys(r.errors)).toEqual(["heightCm", "weightKg"]);
  });
});

describe("other steps", () => {
  it("removes the primary goal from secondary goals", () => {
    const r = validateGoal({
      primaryGoal: "strength",
      secondaryGoals: ["strength", "mobility"],
    });
    expect(r.ok && r.value.secondaryGoals).toEqual(["mobility"]);
  });
  it("needs at least one training day and a valid time", () => {
    const r = validateTraining({
      level: "beginner",
      location: "home",
      equipment: [],
      preferredDays: [],
      reminderTime: "7am",
    });
    expect(!r.ok && Object.keys(r.errors)).toEqual(["preferredDays", "reminderTime"]);
  });
  it("defaults empty equipment to none", () => {
    const r = validateTraining({
      level: "beginner",
      location: "home",
      equipment: [],
      preferredDays: [1, 3],
      reminderTime: "07:00",
    });
    expect(r.ok && r.value.equipment).toEqual(["none"]);
  });
  it("requires the acknowledgement", () => {
    const r = validateSafety({
      pregnancyContext: "no",
      weeklyCommitment: 3,
      acknowledged: false,
    });
    expect(!r.ok && r.errors.acknowledged).toBeDefined();
  });
  it("shows safety guidance for limitations or pregnancy", () => {
    expect(needsSafetyGuidance({ limitations: "bad knee", pregnancyContext: "no" })).toBe(
      true,
    );
    expect(needsSafetyGuidance({ limitations: "", pregnancyContext: "no" })).toBe(false);
  });
});

describe("phone and coach sharing", () => {
  const base = {
    firstName: "P",
    lastName: "S",
    birthDate: "1992-03-14",
    gender: "female",
    heightCm: 168,
    weightKg: 67,
  };
  it("accepts a normal phone number and requires one", () => {
    const ok = validateAbout(
      { ...base, phone: "+1 (604) 555-0123" },
      new Date("2026-10-10T12:00:00Z"),
    );
    expect(ok.ok && ok.value.phone).toBe("+1 (604) 555-0123");
    const none = validateAbout(base, new Date("2026-10-10T12:00:00Z"));
    expect(!none.ok && none.errors.phone).toBeDefined();
  });
  it("rejects nonsense phone numbers", () => {
    const bad = validateAbout(
      { ...base, phone: "call me" },
      new Date("2026-10-10T12:00:00Z"),
    );
    expect(!bad.ok && bad.errors.phone).toBeDefined();
  });
  it("does not ask the member to agree to coach visibility again (the sign-up terms cover it)", () => {
    const r = validateSafety({
      pregnancyContext: "no",
      weeklyCommitment: 3,
      acknowledged: true,
    });
    expect(r.ok).toBe(true);
  });
});

describe("BMI typical range", () => {
  it("gives the weights that match a BMI of 18.5 to 24.9", () => {
    expect(bmiTypicalRangeKg(170)).toEqual({ low: 53.5, high: 72 });
    expect(calcBmi(72, 170)).toBe(24.9);
  });
});
