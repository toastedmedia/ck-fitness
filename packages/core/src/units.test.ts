import { describe, expect, it } from "vitest";
import {
  asUnits,
  cmToFeetInches,
  displayWeight,
  feetInchesToCm,
  kgToLb,
  lbToKg,
  lengthToCm,
  weightToKg,
} from "./units";

describe("units", () => {
  it("converts weight both ways without drifting", () => {
    expect(kgToLb(67.2)).toBe(148.2);
    expect(lbToKg(148.2)).toBe(67.2);
    expect(weightToKg(displayWeight(70, "imperial"), "imperial")).toBeCloseTo(70, 0);
  });
  it("shows kg as is in metric", () => {
    expect(displayWeight(67.24, "metric")).toBe(67.2);
    expect(weightToKg(67.2, "metric")).toBe(67.2);
  });
  it("converts height between cm and feet/inches", () => {
    expect(cmToFeetInches(168)).toEqual({ feet: 5, inches: 6 });
    expect(feetInchesToCm(5, 6)).toBe(167.6);
    expect(cmToFeetInches(feetInchesToCm(5, 10))).toEqual({ feet: 5, inches: 10 });
  });
  it("converts measurements", () => expect(lengthToCm(30, "imperial")).toBe(76.2));
  it("defaults anything unknown to metric", () => {
    expect(asUnits("imperial")).toBe("imperial");
    expect(asUnits("pounds")).toBe("metric");
    expect(asUnits(undefined)).toBe("metric");
  });
});
