import { describe, expect, it } from "vitest";
import { timeAgo, validateComment, validatePost, validateReport } from "./community";

describe("community validation", () => {
  it("accepts a normal post and trims it", () => {
    const r = validatePost({ category: "win", body: "  Finished my first week!  " });
    expect(r.ok && r.value).toEqual({ category: "win", body: "Finished my first week!" });
  });
  it("needs a valid category and some text", () => {
    expect(validatePost({ category: "meme", body: "x" }).ok).toBe(false);
    expect(validatePost({ category: "win", body: "   " }).ok).toBe(false);
  });
  it("blocks links and web addresses to keep spam out", () => {
    for (const body of [
      "see https://example.com",
      "visit www.shop.com",
      "buy at deals.com now",
    ]) {
      const r = validatePost({ category: "tip", body });
      expect(!r.ok && r.error).toMatch(/Links/);
    }
    expect(validateComment({ body: "check out my.site.io" }).ok).toBe(false);
  });
  it("enforces length limits", () => {
    expect(validatePost({ category: "win", body: "a".repeat(1001) }).ok).toBe(false);
    expect(validateComment({ body: "a".repeat(501) }).ok).toBe(false);
    expect(validateComment({ body: "Well done!" }).ok).toBe(true);
  });
  it("validates reports", () => {
    expect(validateReport({ reason: "spam", note: " ad " })).toEqual({
      ok: true,
      value: { reason: "spam", note: "ad" },
    });
    expect(validateReport({ reason: "nope" }).ok).toBe(false);
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-10-12T12:00:00Z");
  it("describes recent times in plain words", () => {
    expect(timeAgo("2026-10-12T11:59:40Z", now)).toBe("just now");
    expect(timeAgo("2026-10-12T11:30:00Z", now)).toBe("30 min ago");
    expect(timeAgo("2026-10-12T09:00:00Z", now)).toBe("3 h ago");
    expect(timeAgo("2026-10-10T12:00:00Z", now)).toBe("2 d ago");
  });
});
