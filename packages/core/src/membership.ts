import type { Entitlement } from "./access";

/** Turns a stored membership row into what the member may access today. Used on the server only. */
export type MembershipState = "none" | "active" | "grace" | "expired";

export interface MembershipRow {
  entitlement: string;
  status: string;
  period_end: string | null;
  cancel_at_period_end: boolean;
}

const GRACE_DAYS = 7;
const DAY = 86_400_000;

export function resolveMembership(
  row: MembershipRow | null | undefined,
  now: Date = new Date(),
): {
  entitlement: Entitlement;
  state: MembershipState;
  endsAt: string | null;
  cancelling: boolean;
} {
  const free = {
    entitlement: "free" as const,
    state: "none" as MembershipState,
    endsAt: null,
    cancelling: false,
  };
  if (!row) return free;
  const end = row.period_end ? new Date(row.period_end).getTime() : null;
  const tier: Entitlement = row.entitlement === "ck_premium" ? "ck_premium" : "ck_member";
  const cancelling = row.cancel_at_period_end;
  const base = { endsAt: row.period_end, cancelling };

  switch (row.status) {
    case "active":
    case "trialing":
      // Cancelled-at-period-end members keep access until the paid period ends.
      if (end !== null && end < now.getTime())
        return { ...base, entitlement: "free", state: "expired" };
      return { ...base, entitlement: tier, state: "active" };
    case "canceled":
      return end !== null && end > now.getTime()
        ? { ...base, entitlement: tier, state: "active" }
        : { ...base, entitlement: "free", state: "expired" };
    case "past_due":
    case "unpaid":
      // Billing problem: keep access for a short grace window instead of cutting off at once.
      return end !== null && now.getTime() <= end + GRACE_DAYS * DAY
        ? { ...base, entitlement: tier, state: "grace" }
        : { ...base, entitlement: "free", state: "expired" };
    default:
      return { ...base, entitlement: "free", state: "none" };
  }
}
