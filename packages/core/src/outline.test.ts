import { describe, expect, it } from "vitest";
import { insertIndex, movePhase, phaseOf } from "./outline";

const s = (id: string, section_type: string) => ({ id, section_type });
const rows = [
  s("p1", "phase"),
  s("w1", "week"),
  s("w2", "week"),
  s("p2", "phase"),
  s("w3", "week"),
  s("m1", "module"),
];

describe("training outline", () => {
  it("puts a new week at the end of its phase, and everything else at the end", () => {
    expect(insertIndex(rows, "week", "p1")).toBe(3);
    expect(insertIndex(rows, "week", "p2")).toBe(6);
    expect(insertIndex(rows, "phase", "p1")).toBe(6);
    expect(insertIndex(rows, "week", "")).toBe(6);
    expect(insertIndex(rows, "week", "w1")).toBe(6);
  });
  it("moves a phase together with its weeks", () => {
    expect(movePhase(rows, "p2", "up")).toEqual(["p2", "w3", "m1", "p1", "w1", "w2"]);
    expect(movePhase(rows, "p1", "down")).toEqual(["p2", "w3", "m1", "p1", "w1", "w2"]);
    expect(movePhase(rows, "p1", "up")).toBeNull();
    expect(movePhase(rows, "p2", "down")).toBeNull();
    expect(movePhase(rows, "w1", "up")).toBeNull();
  });
  it("tells which phase a week belongs to", () => {
    expect(phaseOf(rows, "w2")).toBe("p1");
    expect(phaseOf(rows, "m1")).toBe("p2");
    expect(phaseOf(rows, "p1")).toBeNull();
    expect(phaseOf([s("w", "week")], "w")).toBeNull();
  });
});
