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

/** The few Stripe subscription fields we use. Kept separate from the Stripe SDK so it is easy to test. */
export interface SubscriptionLike {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end: boolean;
  start_date: number;
  period_end: number; // unix seconds, from the subscription item
  period_start?: number; // unix seconds: when the current (possibly unpaid) period began
  ended_at?: number | null; // unix seconds: when a cancelled subscription actually ended
}

export interface MembershipUpsert {
  user_id: string;
  provider: "stripe";
  provider_customer_id: string;
  provider_subscription_id: string;
  entitlement: "ck_member";
  status: string;
  started_at: string;
  period_end: string;
  cancel_at_period_end: boolean;
  source: "web";
}

const iso = (unix: number) => new Date(unix * 1000).toISOString();

/**
 * The date her paid access runs to. Normally the end of the current period. Two cases differ:
 * - A failed renewal (past_due/unpaid): Stripe has already moved to the NEW, unpaid period, so we use
 *   the day that period began (the day she was last paid up to). The 7-day grace counts from there.
 * - Cancelled straight away (for example Stripe gave up collecting): access ends when it ended, not at
 *   the end of a period she never paid for.
 */
export function paidThrough(sub: SubscriptionLike, now: Date = new Date()): number {
  if ((sub.status === "past_due" || sub.status === "unpaid") && sub.period_start)
    return sub.period_start;
  if (sub.status === "canceled" && !sub.cancel_at_period_end)
    return Math.min(sub.period_end, sub.ended_at ?? Math.floor(now.getTime() / 1000));
  return sub.period_end;
}

export function membershipFromSubscription(
  sub: SubscriptionLike,
  userId: string,
): MembershipUpsert {
  return {
    user_id: userId,
    provider: "stripe",
    provider_customer_id: sub.customer,
    provider_subscription_id: sub.id,
    entitlement: "ck_member",
    status: sub.status,
    started_at: iso(sub.start_date),
    period_end: iso(paidThrough(sub)),
    cancel_at_period_end: sub.cancel_at_period_end,
    source: "web",
  };
}

export type MembershipEvent =
  | "membership_started"
  | "membership_cancelled"
  | "membership_expired"
  | "billing_problem";

/** Which lifecycle events a change in membership should trigger (each is sent to the CRM once). */
export function membershipEvents(
  previous: Pick<MembershipRow, "status" | "cancel_at_period_end"> | null,
  next: Pick<MembershipRow, "status" | "cancel_at_period_end" | "period_end">,
  now: Date = new Date(),
): MembershipEvent[] {
  const out: MembershipEvent[] = [];
  const wasPaid =
    previous && (previous.status === "active" || previous.status === "trialing");
  const isPaid = next.status === "active" || next.status === "trialing";
  if (isPaid && !wasPaid) out.push("membership_started");
  if (isPaid && next.cancel_at_period_end && !previous?.cancel_at_period_end)
    out.push("membership_cancelled");
  if (next.status === "past_due" && previous?.status !== "past_due")
    out.push("billing_problem");
  const ended =
    next.status === "canceled" && (!next.period_end || new Date(next.period_end) <= now);
  if (ended && previous?.status !== "canceled") out.push("membership_expired");
  return out;
}
