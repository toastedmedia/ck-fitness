import { describe, expect, it } from "vitest";
import {
  audienceMatches,
  canManageRole,
  crmRetryDelayMinutes,
  validateForPublish,
  workoutReminderDue,
} from "./admin";

const ready = {
  program: {
    title: "P",
    short_description: "d",
    access_level: "free" as const,
    level: "beginner",
    duration_label: "5 days",
  },
  sections: [{ id: "s1", title: "Week 1" }],
  lessons: [
    {
      title: "L1",
      section_id: "s1",
      video_key: "lessons/x/1-a.mp4",
      instructions: "",
      published: true,
    },
  ],
};

describe("validateForPublish", () => {
  it("passes a complete training", () => expect(validateForPublish(ready)).toEqual([]));
  it("lists every missing piece in plain English", () => {
    const problems = validateForPublish({
      program: { ...ready.program, short_description: "", level: null },
      sections: [...ready.sections, { id: "s2", title: "Week 2" }],
      lessons: [{ ...ready.lessons[0], video_key: null }],
    });
    expect(problems).toContain("Add a one-line benefit (short description).");
    expect(problems).toContain("Choose a level.");
    expect(problems).toContain('"L1" needs a video or written instructions.');
    expect(problems).toContain('"Week 2" has no lessons yet.');
  });
  it("needs at least one published lesson", () =>
    expect(
      validateForPublish({
        ...ready,
        lessons: [{ ...ready.lessons[0], published: false }],
      }),
    ).toContain("Add at least one published lesson."));
});

describe("roles, reminders, audiences, retries", () => {
  it("lets only owners manage roles", () => {
    expect(canManageRole(["owner"], "admin")).toBe(true);
    expect(canManageRole(["admin"], "owner")).toBe(false);
    expect(canManageRole(["admin"], "coach")).toBe(false);
  });
  it("sends the workout reminder only once her hour has come and nothing is done", () => {
    expect(workoutReminderDue(6, "07:00", true, false)).toBe(false);
    expect(workoutReminderDue(7, "07:00", true, false)).toBe(true);
    expect(workoutReminderDue(9, "07:00", true, true)).toBe(false);
    expect(workoutReminderDue(9, "07:00", false, false)).toBe(false);
  });
  it("targets announcements by plan", () => {
    expect(audienceMatches("free", "ck_member")).toBe(false);
    expect(audienceMatches("member", "ck_premium")).toBe(true);
    expect(audienceMatches("premium", "ck_member")).toBe(false);
    expect(audienceMatches("all", "free")).toBe(true);
  });
  it("backs off CRM retries then stops", () => {
    expect(crmRetryDelayMinutes(0)).toBe(1);
    expect(crmRetryDelayMinutes(4)).toBe(240);
    expect(crmRetryDelayMinutes(5)).toBeNull();
  });
});

import { computeKpis, videoMinutesPerMember } from "./kpis";

describe("KPIs", () => {
  const base = {
    newAccounts: 10,
    activated: 6,
    freeEligible: 50,
    converted: 5,
    onboarded: 40,
    active7: 20,
    paidMembers: 8,
    paidWithProgram: 6,
    plannedWorkouts: 30,
    completedWorkouts: 21,
    checkinsThisWeek: 10,
    atRiskPaid: 2,
    expiredInPeriod: 1,
    coachingLeads: 2,
    videoMinutes: 2400,
  };
  it("computes each rate as a percentage", () => {
    const k = Object.fromEntries(computeKpis(base).map((x) => [x.key, x.value]));
    expect(k).toMatchObject({
      activation: 60,
      free_to_paid: 10,
      active7: 50,
      paid_start: 75,
      adherence: 70,
      checkin: 50,
      at_risk: 25,
      coaching: 10,
    });
    expect(k.churn).toBeCloseTo(11.1, 1);
  });
  it("shows nothing rather than dividing by zero", () => {
    const k = computeKpis({
      ...base,
      newAccounts: 0,
      paidMembers: 0,
      expiredInPeriod: 0,
    });
    expect(k.find((x) => x.key === "activation")?.value).toBeNull();
    expect(k.find((x) => x.key === "churn")?.value).toBeNull();
  });
  it("tracks video minutes per paying member", () => {
    expect(videoMinutesPerMember(2400, 8)).toBe(300);
    expect(videoMinutesPerMember(null, 8)).toBeNull();
    expect(videoMinutesPerMember(100, 0)).toBeNull();
  });
});

describe("publish check and phases", () => {
  const program = {
    title: "T",
    short_description: "S",
    access_level: "member" as const,
    level: "beginner",
    duration_label: null,
  };
  it("does not ask an empty phase heading for lessons, but still asks an empty week", () => {
    const sections = [
      { id: "p", title: "Phase 1", section_type: "phase" },
      { id: "w", title: "Week 1", section_type: "week" },
      { id: "e", title: "Week 2", section_type: "week" },
    ];
    const lessons = [
      {
        title: "Day 1",
        section_id: "w",
        video_key: "k",
        instructions: "",
        published: true,
      },
    ];
    const problems = validateForPublish({ program, sections, lessons });
    expect(problems).toEqual(['"Week 2" has no lessons yet.']);
  });
});
