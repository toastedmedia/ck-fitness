/** Phase 1 KPI definitions (Build Guide §16). Pure maths so every number is testable. */
export interface KpiInputs {
  newAccounts: number;
  activated: number; // finished onboarding and did one meaningful thing
  freeEligible: number;
  converted: number;
  onboarded: number;
  active7: number;
  paidMembers: number;
  paidWithProgram: number;
  plannedWorkouts: number;
  completedWorkouts: number;
  checkinsThisWeek: number;
  atRiskPaid: number;
  expiredInPeriod: number;
  coachingLeads: number;
  videoMinutes: number | null;
}

export interface Kpi {
  key: string;
  label: string;
  value: number | null; // percent, or null when there is nothing to measure yet
  detail: string;
}

const pct = (n: number, d: number): number | null =>
  d <= 0 ? null : Math.round((n / d) * 1000) / 10;

export function computeKpis(i: KpiInputs): Kpi[] {
  return [
    {
      key: "activation",
      label: "Activation rate",
      value: pct(i.activated, i.newAccounts),
      detail: `${i.activated} of ${i.newAccounts} new accounts finished onboarding and took a first action`,
    },
    {
      key: "free_to_paid",
      label: "Free to paid conversion",
      value: pct(i.converted, i.freeEligible),
      detail: `${i.converted} became members of ${i.freeEligible} eligible free members`,
    },
    {
      key: "active7",
      label: "7-day active rate",
      value: pct(i.active7, i.onboarded),
      detail: `${i.active7} of ${i.onboarded} members returned in the last 7 days`,
    },
    {
      key: "paid_start",
      label: "Paid training start rate",
      value: pct(i.paidWithProgram, i.paidMembers),
      detail: `${i.paidWithProgram} of ${i.paidMembers} paid members started a training`,
    },
    {
      key: "adherence",
      label: "Weekly adherence",
      value: pct(i.completedWorkouts, i.plannedWorkouts),
      detail: `${i.completedWorkouts} of ${i.plannedWorkouts} planned workouts completed (last 7 days)`,
    },
    {
      key: "checkin",
      label: "Weekly check-in completion",
      value: pct(i.checkinsThisWeek, i.active7),
      detail: `${i.checkinsThisWeek} check-ins from ${i.active7} active members this week`,
    },
    {
      key: "at_risk",
      label: "At-risk rate (paid)",
      value: pct(i.atRiskPaid, i.paidMembers),
      detail: `${i.atRiskPaid} of ${i.paidMembers} paid members quiet for 7+ days`,
    },
    {
      key: "churn",
      label: "Monthly membership churn",
      value: pct(i.expiredInPeriod, i.paidMembers + i.expiredInPeriod),
      detail: `${i.expiredInPeriod} memberships ended in the last 30 days`,
    },
    {
      key: "coaching",
      label: "Coaching lead rate",
      value: pct(i.coachingLeads, i.active7),
      detail: `${i.coachingLeads} members asked about coaching (30 days)`,
    },
  ];
}

/** Monthly cost guard: minutes delivered per paying member. Null until the owner enters the Stream figure. */
export function videoMinutesPerMember(
  minutes: number | null,
  paidMembers: number,
): number | null {
  if (minutes === null || paidMembers <= 0) return null;
  return Math.round((minutes / paidMembers) * 10) / 10;
}
