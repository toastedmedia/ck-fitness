import { beforeEach, describe, expect, it } from "vitest";
import { signUnsubscribe, verifyUnsubscribe } from "./token";

const id = "00000000-0000-0000-0000-00000000000a";
beforeEach(() => {
  process.env.CRON_SECRET = "test-secret";
});

describe("unsubscribe token", () => {
  it("round-trips for the right member", () => {
    expect(verifyUnsubscribe(signUnsubscribe(id))).toBe(id);
  });
  it("rejects a changed member id or a tampered signature", () => {
    const t = signUnsubscribe(id);
    expect(verifyUnsubscribe(t.replace("0a.", "0b."))).toBeNull();
    expect(verifyUnsubscribe(`${t}x`)).toBeNull();
    expect(verifyUnsubscribe("garbage")).toBeNull();
  });
  it("rejects everything when no secret is set", () => {
    const t = signUnsubscribe(id);
    delete process.env.CRON_SECRET;
    expect(verifyUnsubscribe(t)).toBeNull();
  });
});
