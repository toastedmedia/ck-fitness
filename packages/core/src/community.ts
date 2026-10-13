/** CK Community rules (pure, tested). Kept small and strict: safe, supportive, no spam. */
export const CATEGORIES = [
  ["win", "Win"],
  ["question", "Question"],
  ["tip", "Tip"],
  ["motivation", "Motivation"],
] as const;
export type PostCategory = (typeof CATEGORIES)[number][0] | "announcement";

export const REPORT_REASONS = [
  ["harassment", "Harassment or bullying"],
  ["medical_advice", "Medical advice"],
  ["spam", "Spam or selling"],
  ["inappropriate", "Inappropriate content"],
  ["privacy", "Shares private information"],
  ["other", "Something else"],
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number][0];

export const POST_MAX = 1000;
export const COMMENT_MAX = 500;
export const AUTO_HIDE_AFTER_REPORTS = 3;
const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|ca|net|org|io|co)\b)/i;

type Check<T> = { ok: true; value: T } | { ok: false; error: string };

export function validatePost(
  raw: Record<string, unknown>,
): Check<{ category: PostCategory; body: string }> {
  const body = typeof raw.body === "string" ? raw.body.trim() : "";
  const category = CATEGORIES.find(([k]) => k === raw.category)?.[0];
  if (!category) return { ok: false, error: "Please choose what kind of post this is." };
  if (!body) return { ok: false, error: "Write something to share." };
  if (body.length > POST_MAX)
    return { ok: false, error: `Posts can be up to ${POST_MAX} characters.` };
  if (LINK.test(body))
    return {
      ok: false,
      error: "Links are not allowed in the community. Describe it in your own words.",
    };
  return { ok: true, value: { category, body } };
}

export function validateComment(raw: Record<string, unknown>): Check<{ body: string }> {
  const body = typeof raw.body === "string" ? raw.body.trim() : "";
  if (!body) return { ok: false, error: "Write a comment first." };
  if (body.length > COMMENT_MAX)
    return { ok: false, error: `Comments can be up to ${COMMENT_MAX} characters.` };
  if (LINK.test(body))
    return { ok: false, error: "Links are not allowed in the community." };
  return { ok: true, value: { body } };
}

export function validateReport(
  raw: Record<string, unknown>,
): Check<{ reason: ReportReason; note: string | null }> {
  const reason = REPORT_REASONS.find(([k]) => k === raw.reason)?.[0];
  if (!reason) return { ok: false, error: "Please choose a reason." };
  const note = typeof raw.note === "string" ? raw.note.trim().slice(0, 500) : "";
  return { ok: true, value: { reason, note: note || null } };
}

/** "5 min ago", "3 h ago", "2 d ago", then a date. */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const s = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)} d ago`;
  return new Date(iso).toLocaleDateString("en-CA", { day: "numeric", month: "short" });
}

export const MUTE_OPTIONS = [
  ["1", "Mute for 1 day"],
  ["7", "Mute for 7 days"],
  ["30", "Mute for 30 days"],
] as const;

/** Reactions, like Facebook but five calm ones. One per member per post; tapping the same one removes it. */
export const REACTIONS = [
  ["like", "👍", "Like"],
  ["love", "❤️", "Love"],
  ["strong", "💪", "Strong"],
  ["celebrate", "🎉", "Celebrate"],
  ["support", "🤗", "Support"],
] as const;
export type Reaction = (typeof REACTIONS)[number][0];
export const isReaction = (v: unknown): v is Reaction => REACTIONS.some(([k]) => k === v);

/** The top reactions on a post, most used first, for the little summary under it. */
export function summarizeReactions(
  counts: Record<string, number> | null | undefined,
  max = 3,
) {
  return REACTIONS.map(([key, emoji, label]) => ({
    key,
    emoji,
    label,
    n: Number(counts?.[key] ?? 0),
  }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, max);
}

/** Authors can fix typos for a short while. */
export const EDIT_WINDOW_MINUTES = 15;
export const canEdit = (createdAt: string, now: Date = new Date()) =>
  now.getTime() - new Date(createdAt).getTime() < EDIT_WINDOW_MINUTES * 60_000;

export const MAX_IMAGES = 4;

/** Notify the author at a few round numbers instead of for every single reaction. */
export const reactionMilestone = (total: number) =>
  [1, 5, 10, 25, 50, 100].includes(total);

export const POST_FILTERS = [
  ["all", "All"],
  ...CATEGORIES,
  ["announcement", "Announcements"],
] as const;
