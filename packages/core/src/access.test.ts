import { describe, expect, it } from "vitest";
import { canAccess } from "./access";

const free = { entitlement: "free", staffRoles: [] } as const;
const member = { entitlement: "ck_member", staffRoles: [] } as const;

describe("canAccess", () => {
  it("lets everyone see free content", () => expect(canAccess(free, "free")).toBe(true));
  it("locks member content for free users", () =>
    expect(canAccess(free, "member")).toBe(false));
  it("unlocks member content for members", () =>
    expect(canAccess(member, "member")).toBe(true));
  it("keeps coach-only away from plain members", () =>
    expect(canAccess(member, "coach_only")).toBe(false));
  it("never serves hidden content to non-staff", () =>
    expect(canAccess(member, "hidden")).toBe(false));
  it("lets content staff preview everything", () =>
    expect(
      canAccess({ entitlement: "free", staffRoles: ["content_manager"] }, "hidden"),
    ).toBe(true));
  it("does not let support staff bypass paywalls", () =>
    expect(canAccess({ entitlement: "free", staffRoles: ["support"] }, "member")).toBe(
      false,
    ));
});
