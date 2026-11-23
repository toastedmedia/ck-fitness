/**
 * Entitlement-based access rules (Build Guide §10). Pure functions, no I/O, so the
 * server and (later) the mobile app share one definition. The UI may show locks, but
 * every gated server route must call canAccess() too.
 */
export type Entitlement = "free" | "ck_member" | "ck_premium";
export type StaffRole = "owner" | "admin" | "coach" | "content_manager" | "support";
export type AccessLevel = "free" | "member" | "premium_preview" | "coach_only" | "hidden";

export interface Viewer {
  entitlement: Entitlement;
  staffRoles: readonly StaffRole[];
  /**
   * Trainings given to her one at a time (Admin -> Give access, for example a one-off purchase).
   * Each opens only that training, never the rest of the Member Library.
   */
  programGrants?: readonly string[];
}

const CONTENT_STAFF: readonly StaffRole[] = [
  "owner",
  "admin",
  "coach",
  "content_manager",
];

/**
 * May she open content at this level? Pass the training's id so a one-training grant counts:
 * a grant opens everything in that training except hidden content.
 */
export function canAccess(
  viewer: Viewer,
  level: AccessLevel,
  programId?: string | null,
): boolean {
  if (viewer.staffRoles.some((r) => CONTENT_STAFF.includes(r))) return true;
  if (level !== "hidden" && programId && viewer.programGrants?.includes(programId))
    return true;
  switch (level) {
    case "free":
      return true;
    case "member":
    case "premium_preview":
      return viewer.entitlement === "ck_member" || viewer.entitlement === "ck_premium";
    case "coach_only":
      return viewer.entitlement === "ck_premium";
    case "hidden":
      return false;
  }
}
