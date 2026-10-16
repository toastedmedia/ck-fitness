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
/** Friendly starting messages a coach can send (and edit) for each reason a member gave. */
export const BARRIER_REPLIES: Record<Barrier, string> = {
  no_time:
    "No problem. Even a 10-minute session counts. Pick the shortest workout in your plan today and do just that.",
  low_motivation:
    "It happens to everyone. Start with just 5 minutes and see how you feel. We are here if you want to talk.",
  sore: "Okay, you are feeling sore. Take it easy today: a 10-minute walk, gentle stretching and plenty of water. Come back to your plan when you feel ready.",
  dont_understand:
    "Thanks for telling us. Open the lesson and watch the first minute, or reply here and we will walk you through it.",
  nutrition:
    "That is okay. Check your meal plan under My Week and pick one meal to get right today. Small steps add up.",
  other:
    "Thanks for letting us know. Reply here and tell us what is getting in the way, and we will help you find a plan that fits.",
};

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
