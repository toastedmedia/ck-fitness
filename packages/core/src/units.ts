/** Everything is stored in kg and cm. Units only change what she sees and types. */
export type Units = "metric" | "imperial";

const LB_PER_KG = 2.2046226218;
const CM_PER_IN = 2.54;
const round1 = (n: number) => Math.round(n * 10) / 10;

export const kgToLb = (kg: number) => round1(kg * LB_PER_KG);
export const lbToKg = (lb: number) => round1(lb / LB_PER_KG);
export const cmToIn = (cm: number) => round1(cm / CM_PER_IN);
export const inToCm = (inches: number) => round1(inches * CM_PER_IN);

export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const total = Math.round(cm / CM_PER_IN);
  return { feet: Math.floor(total / 12), inches: total % 12 };
}
export const feetInchesToCm = (feet: number, inches: number) =>
  round1((feet * 12 + inches) * CM_PER_IN);

export const weightUnit = (u: Units) => (u === "imperial" ? "lb" : "kg");
export const lengthUnit = (u: Units) => (u === "imperial" ? "in" : "cm");

/** Weight as she should see it, from the stored kg value. */
export const displayWeight = (kg: number, u: Units) =>
  u === "imperial" ? kgToLb(kg) : round1(kg);
/** Weight typed by her, back to kg for storage. */
export const weightToKg = (value: number, u: Units) =>
  u === "imperial" ? lbToKg(value) : round1(value);
export const displayLength = (cm: number, u: Units) =>
  u === "imperial" ? cmToIn(cm) : round1(cm);
export const lengthToCm = (value: number, u: Units) =>
  u === "imperial" ? inToCm(value) : round1(value);

export const asUnits = (v: unknown): Units => (v === "imperial" ? "imperial" : "metric");
