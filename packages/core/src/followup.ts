/**
 * Following up with members who stop working out: who goes on the coaches' "Call today" list and
 * when a member gets the automatic missed-workout text. Pure and tested.
 */
import { daysBetween } from "./dates";

export const CALL_OUTCOMES = [
  ["talked", "Talked"],
  ["voicemail", "Left voicemail"],
  ["no_answer", "No answer"],
  ["wrong_number", "Wrong number"],
] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number][0];
export const isCallOutcome = (v: unknown): v is CallOutcome =>
  CALL_OUTCOMES.some(([k]) => k === v);
export const callOutcomeLabel = (v: string) =>
  CALL_OUTCOMES.find(([k]) => k === v)?.[1] ?? v;

/** After a real conversation or a voicemail, a member leaves the list for this many days. */
export const CALL_QUIET_DAYS = 7;

export type FollowUpMember = {
  userId: string;
  name: string;
  phone: string | null;
  paid: boolean;
  joinedDay: string; // YYYY-MM-DD
  lastWorkoutDay: string | null; // last completed workout, YYYY-MM-DD
  missedLast7: number; // planned workouts in the last 7 days that were not done
  lastReason: string | null; // what she said got in the way
  lastCall: {
    at: string;
    outcome: string;
    by: string | null;
    note: string | null;
  } | null;
};

/** Days since the last completed workout (or since joining, if she has not done one yet). */
export function quietDays(
  m: Pick<FollowUpMember, "joinedDay" | "lastWorkoutDay">,
  today: string,
) {
  return Math.max(0, daysBetween(m.lastWorkoutDay ?? m.joinedDay, today));
}

/**
 * The "Call today" list: members with no workout for `minDays`+ days or a missed planned workout
 * this week. Someone a coach talked to (or left a voicemail for) in the last 7 days is left out
 * unless `includeRecent`. Members (studio clients) first, then free accounts; longest-quiet first in each.
 */
export function callList(
  members: readonly FollowUpMember[],
  today: string,
  opts: { minDays?: number; includeRecent?: boolean; now?: number } = {},
): (FollowUpMember & { quietDays: number; recentlyCalled: boolean })[] {
  const minDays = opts.minDays ?? 3;
  const now = opts.now ?? Date.now();
  return members
    .map((m) => {
      const recentlyCalled = Boolean(
        m.lastCall &&
        (m.lastCall.outcome === "talked" || m.lastCall.outcome === "voicemail") &&
        now - new Date(m.lastCall.at).getTime() < CALL_QUIET_DAYS * 86_400_000,
      );
      return { ...m, quietDays: quietDays(m, today), recentlyCalled };
    })
    .filter((m) => m.quietDays >= minDays || m.missedLast7 > 0)
    .filter((m) => opts.includeRecent || !m.recentlyCalled)
    .sort(
      (a, b) =>
        Number(b.paid) - Number(a.paid) ||
        b.quietDays - a.quietDays ||
        b.missedLast7 - a.missedLast7 ||
        a.name.localeCompare(b.name),
    );
}

/**
 * Should she get the missed-workout text today? Only with her consent (the Profile "Text message"
 * switch), a number we can text, after `afterDays` without a workout, and at most once every
 * `everyDays`. New members get `afterDays` from joining before the first one.
 */
export function nudgeTextDue(i: {
  optedIn: boolean;
  textable: boolean;
  quietDays: number;
  afterDays: number;
  lastNudgeAt: string | null;
  everyDays: number;
  now?: number;
}): boolean {
  if (!i.optedIn || !i.textable || i.quietDays < i.afterDays) return false;
  if (!i.lastNudgeAt) return true;
  return (
    (i.now ?? Date.now()) - new Date(i.lastNudgeAt).getTime() >= i.everyDays * 86_400_000
  );
}

/** "+16045550123" -> "+1 604-555-0123" for reading out loud; other countries stay as they are. */
export function formatPhone(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `+1 ${m[1]}-${m[2]}-${m[3]}` : e164;
}
