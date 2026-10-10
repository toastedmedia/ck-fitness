import { describe, expect, it } from "vitest";
import { addDays, daysBetween, dayKey, dayOfWeek, weekStart } from "./dates";
import { dayScore, DEFAULT_GOALS, mergeGoals } from "./score";
import {
  buildWeek,
  homeReminders,
  milestonesEarned,
  riskState,
  streakDays,
  weekProgress,
  weighInStatus,
} from "./accountability";
import { resolveMembership } from "./membership";

describe("dates", () => {
  it("finds Monday as week start", () => {
    expect(weekStart("2026-10-10")).toBe("2026-10-05"); // Saturday
    expect(dayOfWeek("2026-10-05")).toBe(0);
  });
  it("adds and counts days across month ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(daysBetween("2026-10-01", "2026-10-10")).toBe(9);
  });
  it("uses the member's timezone for the day key", () => {
    const d = new Date("2026-10-10T03:00:00Z"); // still Oct 9 in Vancouver
    expect(dayKey(d, "America/Vancouver")).toBe("2026-10-09");
    expect(dayKey(d, "UTC")).toBe("2026-10-10");
  });
});

describe("dayScore", () => {
  it("is 0 for an empty day and 100 for a full day", () => {
    expect(
      dayScore({ workoutDone: false, waterMl: 0, steps: 0, checkinDone: false }),
    ).toBe(0);
    expect(
      dayScore({ workoutDone: true, waterMl: 2500, steps: 8000, checkinDone: true }),
    ).toBe(100);
  });
  it("counts water and steps partially and caps at their targets", () => {
    expect(
      dayScore({ workoutDone: false, waterMl: 1250, steps: 0, checkinDone: false }),
    ).toBe(15);
    expect(
      dayScore({ workoutDone: false, waterMl: 9000, steps: 0, checkinDone: false }),
    ).toBe(30);
  });
  it("normalises when custom weights do not sum to 100", () => {
    const goals = {
      ...DEFAULT_GOALS,
      weights: { workout: 50, water: 50, steps: 0, checkin: 0 },
    };
    expect(
      dayScore({ workoutDone: true, waterMl: 0, steps: 0, checkinDone: false }, goals),
    ).toBe(50);
  });
  it("ignores invalid saved settings", () => {
    expect(mergeGoals({ waterTargetMl: -5, stepGoal: "x" }).waterTargetMl).toBe(2500);
    expect(mergeGoals({ stepGoal: 10000 }).stepGoal).toBe(10000);
  });
});

describe("week and consistency", () => {
  const actions = [
    { scheduled_for: "2026-10-05", status: "completed" as const },
    { scheduled_for: "2026-10-07", status: "planned" as const },
    { scheduled_for: "2026-10-09", status: "planned" as const },
    { scheduled_for: "2026-10-08", status: "rescheduled" as const },
  ];
  it("marks past planned days as missed and future as planned", () => {
    const week = buildWeek("2026-10-05", "2026-10-08", actions);
    expect(week.map((d) => d.state)).toEqual([
      "done",
      "rest",
      "missed",
      "rescheduled",
      "planned",
      "rest",
      "rest",
    ]);
    expect(week[3].isToday).toBe(true);
  });
  it("does not count rescheduled actions against consistency", () => {
    expect(weekProgress(actions)).toEqual({ planned: 3, completed: 1, consistency: 33 });
  });
  it("is 0 with nothing planned", () => expect(weekProgress([]).consistency).toBe(0));
});

describe("streak", () => {
  it("counts back from today", () =>
    expect(streakDays(["2026-10-10", "2026-10-09", "2026-10-08"], "2026-10-10")).toBe(3));
  it("does not break when today is not done yet", () =>
    expect(streakDays(["2026-10-09", "2026-10-08"], "2026-10-10")).toBe(2));
  it("stops at a gap", () =>
    expect(streakDays(["2026-10-10", "2026-10-08"], "2026-10-10")).toBe(1));
});

describe("weigh-in and reminders", () => {
  it("prompts for a first weigh-in", () =>
    expect(weighInStatus(null, "2026-10-10", DEFAULT_GOALS).show).toBe(true));
  it("shows the reminder from day 5 and counts down to day 7", () => {
    expect(weighInStatus("2026-10-06", "2026-10-10", DEFAULT_GOALS)).toEqual({
      daysSince: 4,
      show: false,
      dueIn: 3,
    });
    expect(weighInStatus("2026-10-04", "2026-10-10", DEFAULT_GOALS)).toEqual({
      daysSince: 6,
      show: true,
      dueIn: 1,
    });
  });
  it("personalises and limits reminders to two", () => {
    const r = homeReminders({
      firstName: "Priya",
      today: "2026-10-10",
      weigh: { daysSince: 6, show: true, dueIn: 1 },
      checkinDoneThisWeek: false,
      daysInactive: 4,
    });
    expect(r).toHaveLength(2);
    expect(r[0].id).toBe("restart");
    expect(r[1].title).toContain("Priya");
  });
  it("does not nag about the check-in early in the week", () => {
    const r = homeReminders({
      firstName: "P",
      today: "2026-10-06",
      weigh: { daysSince: 1, show: false, dueIn: 6 },
      checkinDoneThisWeek: false,
      daysInactive: 0,
    });
    expect(r).toHaveLength(0);
  });
});

describe("risk and milestones", () => {
  it("escalates by inactivity, and 14 days only for paid members", () => {
    expect(riskState(1, false)).toBe("active");
    expect(riskState(3, false)).toBe("at_risk_3d");
    expect(riskState(8, true)).toBe("at_risk_7d");
    expect(riskState(15, false)).toBe("at_risk_7d");
    expect(riskState(15, true)).toBe("at_risk_14d");
  });
  it("awards milestones from stats", () => {
    expect(
      milestonesEarned({
        completedWorkouts: 3,
        streak: 7,
        fullWeeks: 0,
        programLessons: 1,
      }),
    ).toEqual([
      "first_workout",
      "three_workouts",
      "seven_day_streak",
      "first_program_module",
    ]);
  });
});

describe("membership", () => {
  const now = new Date("2026-10-10T00:00:00Z");
  const row = (o: object) => ({
    entitlement: "ck_member",
    status: "active",
    period_end: "2026-11-01T00:00:00Z",
    cancel_at_period_end: false,
    ...o,
  });
  it("is free with no row", () =>
    expect(resolveMembership(null, now).entitlement).toBe("free"));
  it("is active for a paid period", () =>
    expect(resolveMembership(row({}), now).state).toBe("active"));
  it("keeps access after cancelling until the period ends", () => {
    expect(resolveMembership(row({ status: "canceled" }), now).entitlement).toBe(
      "ck_member",
    );
    expect(
      resolveMembership(
        row({ status: "canceled", period_end: "2026-10-01T00:00:00Z" }),
        now,
      ).entitlement,
    ).toBe("free");
  });
  it("gives a 7 day grace window for billing problems", () => {
    expect(
      resolveMembership(
        row({ status: "past_due", period_end: "2026-10-05T00:00:00Z" }),
        now,
      ).state,
    ).toBe("grace");
    expect(
      resolveMembership(
        row({ status: "past_due", period_end: "2026-09-20T00:00:00Z" }),
        now,
      ).state,
    ).toBe("expired");
  });
  it("keeps premium for manually assigned coaching clients", () =>
    expect(
      resolveMembership(row({ entitlement: "ck_premium", period_end: null }), now)
        .entitlement,
    ).toBe("ck_premium"));
});
