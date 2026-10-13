import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { videoKey } from "./r2";

describe("videoKey", () => {
  it("keeps every video inside its lesson folder and cleans the name", () => {
    expect(videoKey("abc", "Week 1 / Day 1 (final).mp4", 1000)).toBe(
      "lessons/abc/1000-Week_1___Day_1__final_.mp4",
    );
  });
  it("falls back to a plain name", () => {
    expect(videoKey("abc", "", 5)).toBe("lessons/abc/5-video");
  });
});
