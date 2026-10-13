import { describe, expect, it } from "vitest";
import { membershipFromSubscription, paidThrough, resolveMembership } from "./membership";

const unix = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);
const sub = (over: Record<string, unknown>) => ({
  id: "sub_1",
  customer: "cus_1",
  status: "active",
  cancel_at_period_end: false,
  start_date: unix("2026-10-05T00:00:00Z"),
  period_start: unix("2026-11-05T00:00:00Z"),
  period_end: unix("2026-12-05T00:00:00Z"),
  ...over,
});

describe("failed renewal", () => {
  const row = membershipFromSubscription(sub({ status: "past_due" }), "u1");
  it("counts the 7 day grace from the day she was last paid up to", () => {
    expect(row.period_end).toBe("2026-11-05T00:00:00.000Z");
    const day = (d: string) => resolveMembership(row, new Date(d));
    expect(day("2026-11-06T12:00:00Z")).toMatchObject({
      entitlement: "ck_member",
      state: "grace",
    });
    expect(day("2026-11-12T00:00:00Z")).toMatchObject({ state: "grace" });
    expect(day("2026-11-13T00:00:00Z")).toMatchObject({
      entitlement: "free",
      state: "expired",
    });
  });
  it("restores full access the moment a retry succeeds", () => {
    const paid = membershipFromSubscription(sub({ status: "active" }), "u1");
    expect(resolveMembership(paid, new Date("2026-11-13T00:00:00Z"))).toMatchObject({
      entitlement: "ck_member",
      state: "active",
    });
  });
  it("treats unpaid like past due", () => {
    expect(paidThrough(sub({ status: "unpaid" }))).toBe(unix("2026-11-05T00:00:00Z"));
  });
});

describe("cancelled subscriptions", () => {
  it("ends access straight away when Stripe cancels after failed payments", () => {
    const row = membershipFromSubscription(
      sub({ status: "canceled", ended_at: unix("2026-11-20T00:00:00Z") }),
      "u1",
    );
    expect(row.period_end).toBe("2026-11-20T00:00:00.000Z");
    expect(resolveMembership(row, new Date("2026-11-21T00:00:00Z")).entitlement).toBe(
      "free",
    );
  });
  it("keeps access to the end of the paid period when she cancelled herself", () => {
    const row = membershipFromSubscription(
      sub({ status: "active", cancel_at_period_end: true }),
      "u1",
    );
    expect(resolveMembership(row, new Date("2026-11-20T00:00:00Z"))).toMatchObject({
      entitlement: "ck_member",
      cancelling: true,
    });
  });
});
