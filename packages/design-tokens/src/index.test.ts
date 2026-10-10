import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { colors, minTapTarget } from "./index";

const css = readFileSync(new URL("./theme.css", import.meta.url), "utf8");

describe("design tokens", () => {
  it("keeps theme.css and the TypeScript colours identical", () => {
    for (const hex of Object.values(colors)) expect(css.toLowerCase()).toContain(hex);
  });

  it("keeps tap targets large", () => {
    expect(minTapTarget).toBeGreaterThanOrEqual(44);
  });
});
