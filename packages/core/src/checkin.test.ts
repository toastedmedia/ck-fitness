import { describe, expect, it } from "vitest";
import { isBarrier, validateDailyCheckin } from "./checkin";

describe("validateDailyCheckin", () => {
  const ok = { energy: "good", soreness: "mild", sleep: "fair", mood: "okay" };
  it("accepts a full check-in and makes the note optional", () => {
    const r = validateDailyCheckin(ok);
    expect(r.ok && r.value.note).toBe("");
    const withNote = validateDailyCheckin({ ...ok, note: "  slept badly  " });
    expect(withNote.ok && withNote.value.note).toBe("slept badly");
  });
  it("asks for any missing answer in plain words", () => {
    const r = validateDailyCheckin({ ...ok, sleep: undefined });
    expect(!r.ok && r.error).toBe("Please choose your sleep.");
  });
  it("rejects values outside the options", () =>
    expect(validateDailyCheckin({ ...ok, energy: "amazing" }).ok).toBe(false));
  it("recognises barrier reasons", () => {
    expect(isBarrier("no_time")).toBe(true);
    expect(isBarrier("lazy")).toBe(false);
  });
});
