/** Which "keep them coming back" email is due for a member. Pure, so the timing is tested. */
export type LifecycleKey =
  | "onboarding_1"
  | "onboarding_2"
  | "onboarding_3"
  | "start_1"
  | "start_2"
  | "quiet_7"
  | "quiet_14";

export const LIFECYCLE_KEYS: LifecycleKey[] = [
  "onboarding_1",
  "onboarding_2",
  "onboarding_3",
  "start_1",
  "start_2",
  "quiet_7",
  "quiet_14",
];

export interface LifecycleInput {
  now: number;
  signupAt: number;
  onboardingComplete: boolean;
  /** When she finished onboarding, if known. */
  onboardedAt: number | null;
  /** She has completed at least one workout or lesson. */
  hasWorkout: boolean;
  lastActiveAt: number | null;
  /** When each lifecycle email was last sent to her. */
  sent: Partial<Record<LifecycleKey, number>>;
}

const H = 3_600_000;
const D = 24 * H;
/** Never email someone about an old, forgotten sign-up. */
const MAX_AGE_ONBOARDING = 14 * D;
const MAX_AGE_QUIET = 60 * D;

export function nextLifecycleEmail(i: LifecycleInput): LifecycleKey | null {
  const sentTimes = Object.values(i.sent).filter(
    (v): v is number => typeof v === "number",
  );
  const lastSent = sentTimes.length ? Math.max(...sentTimes) : 0;
  // At most one of these every 2 days.
  if (i.now - lastSent < 2 * D) return null;

  if (!i.onboardingComplete) {
    if (i.now - i.signupAt > MAX_AGE_ONBOARDING) return null;
    const s = i.sent;
    if (s.onboarding_1 === undefined)
      return i.now - i.signupAt >= D ? "onboarding_1" : null;
    if (s.onboarding_2 === undefined)
      return i.now - s.onboarding_1 >= 2 * D ? "onboarding_2" : null;
    if (s.onboarding_3 === undefined)
      return i.now - s.onboarding_2 >= 3 * D ? "onboarding_3" : null;
    return null;
  }

  if (!i.hasWorkout) {
    const base = i.onboardedAt ?? i.signupAt;
    if (i.now - base <= MAX_AGE_ONBOARDING) {
      const s = i.sent;
      if (s.start_1 === undefined) return i.now - base >= D ? "start_1" : null;
      if (s.start_2 === undefined && i.now - s.start_1 >= 3 * D) return "start_2";
    }
  }

  if (i.lastActiveAt !== null && i.now - i.lastActiveAt <= MAX_AGE_QUIET) {
    const idle = i.now - i.lastActiveAt;
    const sinceActive = (k: LifecycleKey) =>
      (i.sent[k] ?? 0) >= (i.lastActiveAt as number);
    if (idle >= 14 * D && !sinceActive("quiet_14")) return "quiet_14";
    if (idle >= 7 * D && !sinceActive("quiet_7")) return "quiet_7";
  }
  return null;
}

/** The weekly check-in reminder (in-app and email) waits until an account is nearly a week old. */
export const CHECKIN_MIN_ACCOUNT_DAYS = 6;
export function checkinNudgeAllowed(createdAtMs: number, nowMs: number): boolean {
  return nowMs - createdAtMs >= CHECKIN_MIN_ACCOUNT_DAYS * 86_400_000;
}
