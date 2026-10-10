import { describe, expect, it } from "vitest";
import { addDays, daysBetween, dayKey, dayOfWeek, weekStart } from "./dates";
import { ckScore, DEFAULT_GOALS, mergeGoals } from "./score";
import {
  buildWeek,
  attentionItems,
  nextMilestone,
  supportiveLine,
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

describe("ckScore", () => {
  const base = {
    workoutScheduled: true,
    workoutDone: false,
    waterMl: 0,
    steps: 0,
    checkinDone: false,
    weighScheduled: false,
    weighDone: false,
  };
  it("is 0 for an empty day and 100 for a full day", () => {
    expect(ckScore(base)).toBe(0);
    expect(
      ckScore({
        ...base,
        workoutDone: true,
        waterMl: 2500,
        steps: 8000,
        checkinDone: true,
      }),
    ).toBe(100);
  });
  it("counts water and steps partially and caps at their targets", () => {
    // workout 40 + water 25 + checkin 15 + steps 10 = 90 available; half the water is 12.5 of 90
    expect(ckScore({ ...base, waterMl: 1250 })).toBe(14);
    expect(ckScore({ ...base, waterMl: 9000 })).toBe(28);
  });
  it("does not penalise a rest day", () => {
    const rest = {
      ...base,
      workoutScheduled: false,
      waterMl: 2500,
      steps: 8000,
      checkinDone: true,
    };
    expect(ckScore(rest)).toBe(100);
  });
  it("only counts the weigh-in when one is scheduled or done", () => {
    const full = {
      ...base,
      workoutDone: true,
      waterMl: 2500,
      steps: 8000,
      checkinDone: true,
    };
    expect(ckScore({ ...full, weighScheduled: true })).toBe(90);
    expect(ckScore({ ...full, weighScheduled: true, weighDone: true })).toBe(100);
    expect(ckScore({ ...full, weighScheduled: false })).toBe(100);
  });
  it("normalises when custom weights do not sum to 100", () => {
    const goals = {
      ...DEFAULT_GOALS,
      weights: { workout: 50, water: 50, checkin: 0, steps: 0, weigh: 0 },
    };
    expect(ckScore({ ...base, workoutDone: true }, goals)).toBe(50);
  });
  it("ignores invalid saved settings", () => {
    expect(mergeGoals({ waterTargetMl: -5, stepGoal: "x" }).waterTargetMl).toBe(2500);
    expect(mergeGoals({ stepGoal: 10000 }).stepGoal).toBe(10000);
    expect(mergeGoals({}).weights.weigh).toBe(10);
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
});

describe("needs attention", () => {
  const today = "2026-10-10"; // Saturday
  const base = {
    firstName: "Priya",
    today,
    weigh: { daysSince: 2, show: false, dueIn: 5 },
    weighEveryDays: 7,
    checkinDoneThisWeek: true,
    daysInactive: 0,
  };
  it("is empty when nothing needs attention", () =>
    expect(attentionItems(base)).toEqual([]));
  it("says how overdue the weigh-in is", () => {
    const [w] = attentionItems({
      ...base,
      weigh: { daysSince: 13, show: true, dueIn: 0 },
    });
    expect(w).toMatchObject({
      kind: "weigh_in",
      severity: "warning",
      detail: "Overdue by 6 days",
    });
  });
  it("shows a countdown before it is overdue", () => {
    const [w] = attentionItems({
      ...base,
      weigh: { daysSince: 5, show: true, dueIn: 2 },
    });
    expect(w.detail).toBe("Due in 2 days");
  });
  it("offers inline recovery for a missed workout, without guilt", () => {
    const [m] = attentionItems({
      ...base,
      missedWorkout: { id: "a1", date: "2026-10-09" },
    });
    expect(m).toMatchObject({
      kind: "missed_workout",
      title: "Missed yesterday's workout?",
      cta: { action: "missed_recovery" },
      ref: "a1",
    });
    expect(
      attentionItems({ ...base, missedWorkout: { id: "a1", date: "2026-10-07" } })[0]
        .title,
    ).toBe("Missed Wednesday's workout?");
    expect(m.detail).not.toMatch(/fail/i);
  });
  it("puts payment first and caps the list", () => {
    const items = attentionItems({
      ...base,
      paymentProblem: true,
      missedWorkout: { id: "a", date: "2026-10-09" },
      weigh: { daysSince: 9, show: true, dueIn: 0 },
      checkinDoneThisWeek: false,
    });
    expect(items[0].kind).toBe("payment");
    expect(items.map((i) => i.kind)).toEqual([
      "payment",
      "missed_workout",
      "weigh_in",
      "weekly_checkin",
    ]);
  });
  it("only asks for the weekly check-in from Friday", () => {
    expect(
      attentionItems({ ...base, today: "2026-10-06", checkinDoneThisWeek: false }),
    ).toEqual([]);
    expect(
      attentionItems({ ...base, today: "2026-10-09", checkinDoneThisWeek: false })[0]
        .kind,
    ).toBe("weekly_checkin");
  });
});

describe("next milestone and supportive line", () => {
  const base = {
    program: null,
    week: { target: 4, completed: 2 },
    weeklyCheckinDone: false,
    waterRemainingMl: 900,
  };
  it("prefers the program, then the week, then accountability, then water", () => {
    expect(
      nextMilestone({ ...base, program: { sectionTitle: "Week 2", remaining: 2 } })?.text,
    ).toBe("Complete 2 more workouts to finish Week 2.");
    expect(
      nextMilestone({ ...base, program: { sectionTitle: "Week 3", remaining: 1 } })?.text,
    ).toBe("1 workout away from completing Week 3.");
    expect(nextMilestone(base)?.kind).toBe("week");
    expect(nextMilestone({ ...base, week: { target: 4, completed: 4 } })?.kind).toBe(
      "accountability",
    );
    expect(
      nextMilestone({
        ...base,
        week: { target: 4, completed: 4 },
        weeklyCheckinDone: true,
      })?.text,
    ).toBe("900 mL more water to hit today's goal.");
    expect(
      nextMilestone({
        ...base,
        week: { target: 4, completed: 4 },
        weeklyCheckinDone: true,
        waterRemainingMl: 0,
      }),
    ).toBeNull();
  });
  it("keeps the supportive line kind", () => {
    expect(
      supportiveLine({ score: 100, streak: 0, missed: false, weekDone: false }),
    ).toMatch(/done/i);
    expect(supportiveLine({ score: 20, streak: 4, missed: false, weekDone: false })).toBe(
      "Let's keep the momentum going.",
    );
    expect(
      supportiveLine({ score: 20, streak: 0, missed: true, weekDone: false }),
    ).toMatch(/fresh start/i);
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

import { membershipEvents, membershipFromSubscription } from "./membership";

describe("stripe mapping", () => {
  const sub = {
    id: "sub_1",
    customer: "cus_1",
    status: "active",
    cancel_at_period_end: false,
    start_date: 1_760_000_000,
    period_end: 1_762_600_000,
  };
  it("maps a subscription to a membership row", () => {
    const row = membershipFromSubscription(sub, "user-1");
    expect(row).toMatchObject({
      user_id: "user-1",
      entitlement: "ck_member",
      status: "active",
      source: "web",
      provider_customer_id: "cus_1",
    });
    expect(row.period_end).toBe(new Date(1_762_600_000 * 1000).toISOString());
  });
  it("emits one event per real change", () => {
    const now = new Date("2026-10-10T00:00:00Z");
    const active = {
      status: "active",
      cancel_at_period_end: false,
      period_end: "2026-11-10T00:00:00Z",
    };
    expect(membershipEvents(null, active, now)).toEqual(["membership_started"]);
    expect(membershipEvents(active, active, now)).toEqual([]);
    expect(
      membershipEvents(active, { ...active, cancel_at_period_end: true }, now),
    ).toEqual(["membership_cancelled"]);
    expect(membershipEvents(active, { ...active, status: "past_due" }, now)).toEqual([
      "billing_problem",
    ]);
    expect(
      membershipEvents(
        { status: "active", cancel_at_period_end: true },
        {
          status: "canceled",
          cancel_at_period_end: true,
          period_end: "2026-10-09T00:00:00Z",
        },
        now,
      ),
    ).toEqual(["membership_expired"]);
  });
});
