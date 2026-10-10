/** Daily check-in (under 15 seconds) and "what is getting in the way" reasons. Rules-based, no AI. */
export const CHECKIN_FIELDS = {
  energy: {
    label: "Energy",
    options: [
      ["low", "Low"],
      ["okay", "Okay"],
      ["good", "Good"],
      ["great", "Great"],
    ],
  },
  soreness: {
    label: "Soreness",
    options: [
      ["none", "None"],
      ["mild", "Mild"],
      ["high", "High"],
    ],
  },
  sleep: {
    label: "Sleep",
    options: [
      ["poor", "Poor"],
      ["fair", "Fair"],
      ["good", "Good"],
      ["great", "Great"],
    ],
  },
  mood: {
    label: "Mood",
    options: [
      ["low", "Low"],
      ["okay", "Okay"],
      ["good", "Good"],
      ["great", "Great"],
    ],
  },
} as const;

export type CheckinField = keyof typeof CHECKIN_FIELDS;
export interface DailyCheckinInput {
  energy: string;
  soreness: string;
  sleep: string;
  mood: string;
  note: string;
}

export const BARRIERS = [
  ["no_time", "No time"],
  ["low_motivation", "Low motivation"],
  ["sore", "Feeling sore"],
  ["dont_understand", "Don't understand the workout"],
  ["nutrition", "Nutrition is off track"],
  ["other", "Other"],
] as const;
export type Barrier = (typeof BARRIERS)[number][0];
export const isBarrier = (v: unknown): v is Barrier => BARRIERS.some(([k]) => k === v);

export function validateDailyCheckin(
  raw: Record<string, unknown>,
): { ok: true; value: DailyCheckinInput } | { ok: false; error: string } {
  const out: Record<string, string> = {};
  for (const [field, def] of Object.entries(CHECKIN_FIELDS)) {
    const v = raw[field];
    if (typeof v !== "string" || !def.options.some(([k]) => k === v))
      return { ok: false, error: `Please choose your ${def.label.toLowerCase()}.` };
    out[field] = v;
  }
  const note = typeof raw.note === "string" ? raw.note.trim().slice(0, 300) : "";
  return {
    ok: true,
    value: {
      energy: out.energy,
      soreness: out.soreness,
      sleep: out.sleep,
      mood: out.mood,
      note,
    },
  };
}
