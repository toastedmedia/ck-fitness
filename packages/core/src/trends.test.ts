import { describe, expect, it } from "vitest";
import { dailySeries, seriesTotals } from "./trends";

describe("dailySeries", () => {
  it("fills empty days and counts by the local day", () => {
    const s = dailySeries(
      [
        "2026-10-12T20:00:00Z",
        "2026-10-12T21:00:00Z",
        "2026-10-10T18:00:00Z",
        null,
        "bad",
      ],
      4,
      "2026-10-12",
      "UTC",
    );
    expect(s.map((d) => d.day)).toEqual([
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
      "2026-10-12",
    ]);
    expect(s.map((d) => d.count)).toEqual([0, 1, 0, 2]);
  });
  it("ignores anything outside the window", () => {
    const s = dailySeries(["2026-01-01T00:00:00Z"], 3, "2026-10-12", "UTC");
    expect(s.every((d) => d.count === 0)).toBe(true);
  });
});

describe("seriesTotals", () => {
  it("compares to the previous period", () => {
    const cur = [
      { day: "a", count: 3 },
      { day: "b", count: 3 },
    ];
    expect(seriesTotals(cur, 4)).toEqual({ total: 6, change: 50 });
  });
  it("gives no change when there is nothing to compare", () => {
    expect(seriesTotals([{ day: "a", count: 2 }], 0).change).toBeNull();
  });
});
