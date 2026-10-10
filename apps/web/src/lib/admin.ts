import "server-only";
import { notFound } from "next/navigation";
import type { StaffRole } from "@ck/core";
import { requireUser } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * Staff guard. Roles are read from the database on the server for every request; nothing the
 * browser sends can grant access. Non-staff get a plain 404 so the portal is not advertised.
 */
export async function requireStaff(allowed: readonly StaffRole[]) {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("staff_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("active", true);
  const roles = ((data ?? []) as { role: StaffRole }[]).map((r) => r.role);
  if (!roles.some((r) => allowed.includes(r))) notFound();
  return { supabase, user, roles, db: createAdminSupabase() };
}

export const ALL_STAFF: StaffRole[] = [
  "owner",
  "admin",
  "coach",
  "content_manager",
  "support",
];
export const OPS: StaffRole[] = ["owner", "admin"];
export const CONTENT: StaffRole[] = ["owner", "admin", "content_manager"];
export const SUPPORT: StaffRole[] = ["owner", "admin", "support", "coach"];

/** Writes who changed what. Append-only table; failures are logged, never hidden. */
export async function audit(
  supabase: Awaited<ReturnType<typeof requireStaff>>["supabase"],
  actorId: string,
  action: string,
  target: string,
  details: Record<string, unknown> = {},
) {
  const { error } = await supabase
    .from("admin_audit_log")
    .insert({ actor_id: actorId, action, target, details });
  if (error) console.error("audit log failed", action, error.message);
}
