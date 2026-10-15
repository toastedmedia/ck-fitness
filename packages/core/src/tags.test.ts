import { describe, expect, it } from "vitest";
import { cleanIds, normalizeTagName, sameTag } from "./tags";

describe("tags", () => {
  it("tidies names and ignores capitals when comparing", () => {
    expect(normalizeTagName("  5-day   program ")).toBe("5-day program");
    expect(normalizeTagName("x".repeat(50))).toHaveLength(30);
    expect(sameTag("VIP", " vip ")).toBe(true);
    expect(sameTag("VIP", "VIPs")).toBe(false);
  });
  it("keeps only real member ids, once each", () => {
    const a = "00000000-0000-0000-0000-00000000000a";
    expect(cleanIds([a, a, "nope", 5, "<script>"])).toEqual([a]);
    expect(
      cleanIds(
        Array(5)
          .fill(a)
          .concat([a.replace("a", "b")]),
        1,
      ),
    ).toEqual([a]);
  });
});
