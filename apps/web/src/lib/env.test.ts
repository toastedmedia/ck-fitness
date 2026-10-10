import { describe, expect, it } from "vitest";
import { requireValue } from "./env";

describe("requireValue", () => {
  it("returns a set value", () => expect(requireValue("X", "abc")).toBe("abc"));
  it("throws a clear error naming the variable", () =>
    expect(() => requireValue("MY_VAR", undefined)).toThrow("MY_VAR"));
});
