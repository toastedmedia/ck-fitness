import { describe, expect, it } from "vitest";
import {
  callList,
  callOutcomeLabel,
  formatPhone,
  isCallOutcome,
  nudgeTextDue,
  quietDays,
  type FollowUpMember,
} from "./followup";

const TODAY = "2026-11-21";
const NOW = Date.parse("2026-11-21T18:00:00Z");
const m = (p: Partial<FollowUpMember> & { userId: string }): FollowUpMember => ({
  name: p.userId,
  phone: "+16045550123",
  paid: false,
  joinedDay: "2026-10-01",
  lastWorkoutDay: "2026-11-20",
  missedLast7: 0,
  lastReason: null,
  lastCall: null,
  ...p,
});

describe("call list", () => {
  it("counts quiet days from the last workout, or from joining", () => {
    expect(
      quietDays({ joinedDay: "2026-10-01", lastWorkoutDay: "2026-11-14" }, TODAY),
    ).toBe(7);
    expect(quietDays({ joinedDay: "2026-11-19", lastWorkoutDay: null }, TODAY)).toBe(2);
  });

  it("lists members who stopped working out or missed a planned workout", () => {
    const list = callList(
      [
        m({ userId: "active" }),
        m({ userId: "quiet5", lastWorkoutDay: "2026-11-16" }),
        m({ userId: "missed", missedLast7: 1 }),
        m({ userId: "never", joinedDay: "2026-11-01", lastWorkoutDay: null }),
      ],
      TODAY,
      { now: NOW },
    );
    expect(list.map((r) => r.userId)).toEqual(["never", "quiet5", "missed"]);
    expect(list[0]!.quietDays).toBe(20);
  });

  it("puts studio clients (Members) before free accounts", () => {
    const list = callList(
      [
        m({ userId: "free", lastWorkoutDay: "2026-11-10" }),
        m({ userId: "member", lastWorkoutDay: "2026-11-17", paid: true }),
      ],
      TODAY,
      { now: NOW },
    );
    expect(list.map((r) => r.userId)).toEqual(["member", "free"]);
  });

  it("rests members a coach reached this week, but keeps no-answers on the list", () => {
    const quiet = { lastWorkoutDay: "2026-11-10" };
    const members = [
      m({
        userId: "talked",
        ...quiet,
        lastCall: { at: "2026-11-19T18:00:00Z", outcome: "talked", by: "Kv", note: null },
      }),
      m({
        userId: "vm-old",
        ...quiet,
        lastCall: {
          at: "2026-11-01T18:00:00Z",
          outcome: "voicemail",
          by: "Kv",
          note: null,
        },
      }),
      m({
        userId: "no-answer",
        ...quiet,
        lastCall: {
          at: "2026-11-20T18:00:00Z",
          outcome: "no_answer",
          by: "Kv",
          note: null,
        },
      }),
    ];
    expect(
      callList(members, TODAY, { now: NOW })
        .map((r) => r.userId)
        .sort(),
    ).toEqual(["no-answer", "vm-old"]);
    const all = callList(members, TODAY, { now: NOW, includeRecent: true });
    expect(all.find((r) => r.userId === "talked")?.recentlyCalled).toBe(true);
  });

  it("can show only the longer quiet spells", () => {
    const list = callList(
      [
        m({ userId: "q4", lastWorkoutDay: "2026-11-17" }),
        m({ userId: "q10", lastWorkoutDay: "2026-11-11" }),
      ],
      TODAY,
      { minDays: 7, now: NOW },
    );
    expect(list.map((r) => r.userId)).toEqual(["q10"]);
  });

  it("names call outcomes plainly", () => {
    expect(isCallOutcome("voicemail")).toBe(true);
    expect(isCallOutcome("emailed")).toBe(false);
    expect(callOutcomeLabel("no_answer")).toBe("No answer");
  });

  it("formats numbers for reading out loud", () => {
    expect(formatPhone("+16045550123")).toBe("+1 604-555-0123");
    expect(formatPhone("+447400123456")).toBe("+447400123456");
  });
});

describe("missed-workout text", () => {
  const base = {
    optedIn: true,
    textable: true,
    quietDays: 3,
    afterDays: 3,
    lastNudgeAt: null,
    everyDays: 7,
    now: NOW,
  };
  it("goes out after the quiet days, only with consent and a textable number", () => {
    expect(nudgeTextDue(base)).toBe(true);
    expect(nudgeTextDue({ ...base, quietDays: 2 })).toBe(false);
    expect(nudgeTextDue({ ...base, optedIn: false })).toBe(false);
    expect(nudgeTextDue({ ...base, textable: false })).toBe(false);
  });

  it("waits the chosen number of days between texts", () => {
    expect(nudgeTextDue({ ...base, lastNudgeAt: "2026-11-17T18:00:00Z" })).toBe(false);
    expect(nudgeTextDue({ ...base, lastNudgeAt: "2026-11-14T18:00:00Z" })).toBe(true);
  });
});
