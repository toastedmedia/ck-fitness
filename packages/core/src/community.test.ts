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

import { canEdit, isReaction, reactionMilestone, summarizeReactions } from "./community";

describe("reactions, editing and milestones", () => {
  it("summarises the most used reactions first", () => {
    expect(
      summarizeReactions({ love: 5, like: 2, strong: 7, celebrate: 0 }).map((r) => r.key),
    ).toEqual(["strong", "love", "like"]);
    expect(summarizeReactions({}).length).toBe(0);
    expect(summarizeReactions(null).length).toBe(0);
  });
  it("knows the five reactions", () => {
    expect(isReaction("support")).toBe(true);
    expect(isReaction("angry")).toBe(false);
  });
  it("allows editing only in the first fifteen minutes", () => {
    const now = new Date("2026-10-12T12:00:00Z");
    expect(canEdit("2026-10-12T11:50:00Z", now)).toBe(true);
    expect(canEdit("2026-10-12T11:40:00Z", now)).toBe(false);
  });
  it("notifies at round numbers only", () => {
    expect([1, 2, 5, 9, 10, 25].filter(reactionMilestone)).toEqual([1, 5, 10, 25]);
  });
});
