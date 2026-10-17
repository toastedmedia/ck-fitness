import { describe, expect, it } from "vitest";
import { nextLifecycleEmail, weeklyCheckinDue, type LifecycleInput } from "./lifecycle";

const D = 24 * 3_600_000;
const now = Date.UTC(2026, 10, 20, 12);
const base: LifecycleInput = {
  now,
  signupAt: now - 2 * D,
  onboardingComplete: false,
  onboardedAt: null,
  hasWorkout: false,
  lastActiveAt: now - 2 * D,
  sent: {},
};

describe("onboarding reminders", () => {
  it("first after 24 hours, second 48 hours later, third 72 hours later, then stops", () => {
    expect(nextLifecycleEmail({ ...base, signupAt: now - 0.5 * D })).toBeNull();
    expect(nextLifecycleEmail(base)).toBe("onboarding_1");
    expect(
      nextLifecycleEmail({ ...base, sent: { onboarding_1: now - 1 * D } }),
    ).toBeNull();
    expect(nextLifecycleEmail({ ...base, sent: { onboarding_1: now - 2 * D } })).toBe(
      "onboarding_2",
    );
    expect(
      nextLifecycleEmail({
        ...base,
        signupAt: now - 8 * D,
        sent: { onboarding_1: now - 6 * D, onboarding_2: now - 3 * D },
      }),
    ).toBe("onboarding_3");
    expect(
      nextLifecycleEmail({
        ...base,
        signupAt: now - 12 * D,
        sent: {
          onboarding_1: now - 9 * D,
          onboarding_2: now - 7 * D,
          onboarding_3: now - 4 * D,
        },
      }),
    ).toBeNull();
  });
  it("ignores old forgotten sign-ups", () => {
    expect(nextLifecycleEmail({ ...base, signupAt: now - 30 * D })).toBeNull();
  });
});

describe("after onboarding", () => {
  const onb = { ...base, onboardingComplete: true, onboardedAt: now - 2 * D };
  it("nudges to start the first training, twice", () => {
    expect(nextLifecycleEmail(onb)).toBe("start_1");
    expect(
      nextLifecycleEmail({
        ...onb,
        onboardedAt: now - 6 * D,
        sent: { start_1: now - 4 * D },
      }),
    ).toBe("start_2");
  });
  it("stops once she has trained, and sends quiet notes later", () => {
    expect(nextLifecycleEmail({ ...onb, hasWorkout: true })).toBeNull();
    expect(
      nextLifecycleEmail({ ...onb, hasWorkout: true, lastActiveAt: now - 8 * D }),
    ).toBe("quiet_7");
    expect(
      nextLifecycleEmail({
        ...onb,
        hasWorkout: true,
        lastActiveAt: now - 15 * D,
        sent: { quiet_7: now - 7 * D },
      }),
    ).toBe("quiet_14");
    expect(
      nextLifecycleEmail({
        ...onb,
        hasWorkout: true,
        lastActiveAt: now - 8 * D,
        sent: { quiet_7: now - 3 * D },
      }),
    ).toBeNull();
  });
});

describe("weekly check-in reminder timing", () => {
  const base = { today: "2026-10-19", dayOfWeek: 0, hour: 9, joinedDay: "2026-10-11" };
  it("goes out Monday morning, around 9", () => {
    expect(weeklyCheckinDue(base)).toBe(true);
    expect(weeklyCheckinDue({ ...base, hour: 8 })).toBe(false);
    expect(weeklyCheckinDue({ ...base, hour: 17 })).toBe(true);
    expect(weeklyCheckinDue({ ...base, hour: 18 })).toBe(false);
  });
  it("never goes out on other days, including Friday", () => {
    for (const d of [1, 2, 3, 4, 5, 6])
      expect(weeklyCheckinDue({ ...base, dayOfWeek: d })).toBe(false);
  });
  it("includes anyone who joined before Monday (even Sunday) but not someone who joined today", () => {
    expect(weeklyCheckinDue({ ...base, joinedDay: "2026-10-18" })).toBe(true);
    expect(weeklyCheckinDue({ ...base, joinedDay: "2026-10-16" })).toBe(true);
    expect(weeklyCheckinDue({ ...base, joinedDay: "2026-10-19" })).toBe(false);
  });
});
