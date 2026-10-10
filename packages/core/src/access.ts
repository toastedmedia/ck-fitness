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
}

const CONTENT_STAFF: readonly StaffRole[] = [
  "owner",
  "admin",
  "coach",
  "content_manager",
];

export function canAccess(viewer: Viewer, level: AccessLevel): boolean {
  if (viewer.staffRoles.some((r) => CONTENT_STAFF.includes(r))) return true;
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
