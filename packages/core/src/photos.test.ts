import { describe, expect, it } from "vitest";
import { isPose, ownsPath, photoPath } from "./photos";

const U = "11111111-1111-1111-1111-111111111111";
const V = "22222222-2222-2222-2222-222222222222";
const ID = "33333333-3333-3333-3333-333333333333";

describe("photos", () => {
  it("knows the four poses", () => {
    expect(isPose("arms_raised")).toBe(true);
    expect(isPose("selfie")).toBe(false);
  });
  it("builds random paths inside her own folder", () =>
    expect(photoPath(U, ID)).toBe(`${U}/${ID}.jpg`));
  it("only accepts paths she owns", () => {
    expect(ownsPath(U, photoPath(U, ID))).toBe(true);
    expect(ownsPath(U, photoPath(V, ID))).toBe(false);
    expect(ownsPath(U, `${U}/../${V}/${ID}.jpg`)).toBe(false);
    expect(ownsPath(U, `${U}/notes.txt`)).toBe(false);
  });
});
