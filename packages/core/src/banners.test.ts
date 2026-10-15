import { describe, expect, it } from "vitest";
import { bannerLink, bannerVisible } from "./banners";

const b = { active: true, audience: "all", starts_at: null, ends_at: null };
const now = new Date("2026-12-01T12:00:00Z");

describe("bannerVisible", () => {
  it("respects dates, audience and the on/off switch", () => {
    expect(bannerVisible(b, now, false)).toBe(true);
    expect(bannerVisible({ ...b, active: false }, now, false)).toBe(false);
    expect(bannerVisible({ ...b, starts_at: "2026-12-02T00:00:00Z" }, now, false)).toBe(
      false,
    );
    expect(bannerVisible({ ...b, ends_at: "2026-11-30T00:00:00Z" }, now, false)).toBe(
      false,
    );
    expect(bannerVisible({ ...b, audience: "member" }, now, false)).toBe(false);
    expect(bannerVisible({ ...b, audience: "free" }, now, true)).toBe(false);
  });
});

describe("bannerLink", () => {
  it("allows app paths and https, blocks the rest", () => {
    expect(bannerLink("/community", false)).toEqual({
      href: "/community",
      external: false,
    });
    expect(bannerLink("https://example.org/event", false)?.external).toBe(true);
    expect(bannerLink("http://example.org", false)).toBeNull();
    expect(bannerLink("//evil.com", false)).toBeNull();
    expect(bannerLink("javascript:alert(1)", false)).toBeNull();
    expect(bannerLink("/admin", false)).toBeNull();
  });
  it("keeps the store apps free of outside and buying links", () => {
    expect(bannerLink("https://example.org", true)).toBeNull();
    expect(bannerLink("/membership", true)).toBeNull();
    expect(bannerLink("/membership", false)).not.toBeNull();
    expect(bannerLink("/community", true)).not.toBeNull();
  });
});
