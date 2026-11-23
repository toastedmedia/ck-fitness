import type { AccessLevel } from "./access";

/** Checks a program is ready to publish (Build Guide §12.3 step 4). Returns plain-English problems. */
export interface PublishCheck {
  program: {
    title: string;
    short_description: string;
    access_level: AccessLevel;
    level: string | null;
    duration_label: string | null;
  };
  sections: { id: string; title: string; section_type?: string }[];
  lessons: {
    title: string;
    section_id: string;
    video_key: string | null;
    instructions: string;
    published: boolean;
    /** The lesson's picture; an image-only lesson (for example a set of instructions as images) is fine. */
    thumbnail_path?: string | null;
    /** An attached image or PDF. */
    resource_path?: string | null;
  }[];
}

/** A lesson can go live with a video, written instructions, a picture or an attached image/PDF. */
export function lessonHasContent(l: {
  video_key?: string | null;
  instructions?: string | null;
  thumbnail_path?: string | null;
  resource_path?: string | null;
}): boolean {
  return Boolean(
    l.video_key ||
    String(l.instructions ?? "").trim() ||
    l.thumbnail_path ||
    l.resource_path,
  );
}

export function validateForPublish({
  program,
  sections,
  lessons,
}: PublishCheck): string[] {
  const problems: string[] = [];
  if (!program.title.trim()) problems.push("Add a program title.");
  if (!program.short_description.trim())
    problems.push("Add a one-line benefit (short description).");
  if (!program.level) problems.push("Choose a level.");
  if (sections.length === 0) problems.push("Add at least one week or phase.");
  const live = lessons.filter((l) => l.published);
  if (live.length === 0) problems.push("Add at least one published lesson.");
  for (const l of live) {
    if (!l.title.trim()) problems.push("A lesson is missing its title.");
    if (!lessonHasContent(l))
      problems.push(
        `"${l.title || "Untitled lesson"}" needs a video, a picture or written instructions.`,
      );
  }
  for (const s of sections) {
    // A phase is a heading that groups weeks; it holds no lessons of its own.
    if (s.section_type === "phase" && !lessons.some((l) => l.section_id === s.id))
      continue;
    if (!lessons.some((l) => l.section_id === s.id))
      problems.push(`"${s.title}" has no lessons yet.`);
  }
  return problems;
}

export const STAFF_ROLES = [
  "owner",
  "admin",
  "coach",
  "content_manager",
  "support",
] as const;

/** Only an owner may grant or remove staff roles; an admin can never touch owner access (guide §12.2). */
export function canManageRole(
  actorRoles: readonly string[],
  targetRole: string,
): boolean {
  if (actorRoles.includes("owner")) return true;
  return false;
}

/** In-app workout reminder is due when her reminder hour has arrived today and nothing is done yet. */
export function workoutReminderDue(
  localHour: number,
  reminderTime: string,
  workoutPlannedToday: boolean,
  workoutDone: boolean,
): boolean {
  const hour = Number(reminderTime.slice(0, 2));
  return workoutPlannedToday && !workoutDone && localHour >= hour;
}

export type AudienceKey = "all" | "free" | "member" | "premium";
export function audienceMatches(
  audience: AudienceKey,
  entitlement: "free" | "ck_member" | "ck_premium",
): boolean {
  if (audience === "all") return true;
  if (audience === "free") return entitlement === "free";
  if (audience === "member")
    return entitlement === "ck_member" || entitlement === "ck_premium";
  return entitlement === "ck_premium";
}

/** Backoff for retrying a failed CRM sync: 1, 5, 15, 60, 240 minutes, then give up (status stays failed). */
export function crmRetryDelayMinutes(attempts: number): number | null {
  const ladder = [1, 5, 15, 60, 240];
  return attempts < ladder.length ? ladder[attempts] : null;
}
