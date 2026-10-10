import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { colors, minTapTarget } from "./index";

const css = readFileSync(
  new URL("../../../apps/web/src/app/globals.css", import.meta.url),
  "utf8",
);

describe("design tokens", () => {
  it("are mirrored in the web app's globals.css", () => {
    const hexes = [
      colors.green[900],
      colors.green[800],
      colors.green[700],
      colors.green[100],
      colors.cream[50],
      colors.cream[100],
      colors.cream[200],
      colors.gold[600],
      colors.gold[500],
      colors.gold[100],
      colors.ink[900],
      colors.ink[600],
      colors.danger,
    ];
    for (const hex of hexes) expect(css).toContain(hex);
  });

  it("keeps tap targets large", () => {
    expect(minTapTarget).toBeGreaterThanOrEqual(44);
  });
});
