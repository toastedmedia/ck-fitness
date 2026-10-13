import { describe, expect, it } from "vitest";
import { summarizeProgress } from "./progress";

const enr = (u: string, status = "active") => ({
  user_id: u,
  status,
  started_at: "2026-10-01T00:00:00Z",
});

describe("summarizeProgress", () => {
  it("counts started, completed and average progress", () => {
    const s = summarizeProgress(
      [enr("a"), enr("b"), enr("c", "completed")],
      [
        {
          user_id: "a",
          completed_at: "2026-10-02T00:00:00Z",
          play_count: 2,
          last_watched_at: "2026-10-03T00:00:00Z",
        },
        {
          user_id: "a",
          completed_at: null,
          play_count: 1,
          last_watched_at: "2026-10-04T00:00:00Z",
        },
        {
          user_id: "c",
          completed_at: "2026-10-02T00:00:00Z",
          play_count: 1,
          last_watched_at: null,
        },
      ],
      2,
    );
    expect(s.enrolled).toBe(3);
    expect(s.started).toBe(2);
    expect(s.completed).toBe(1);
    const a = s.members.find((m) => m.userId === "a");
    expect(a).toMatchObject({ completedLessons: 1, percent: 50, sessions: 3 });
    expect(a?.lastAccessed).toBe("2026-10-04T00:00:00Z");
    expect(s.averagePercent).toBe(Math.round((50 + 0 + 50) / 3));
  });
  it("handles a training with no lessons or members", () => {
    expect(summarizeProgress([], [], 0)).toMatchObject({
      enrolled: 0,
      averagePercent: 0,
    });
    expect(summarizeProgress([enr("a")], [], 0).members[0].percent).toBe(0);
  });
});
