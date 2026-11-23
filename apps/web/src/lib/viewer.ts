import "server-only";
import { cache } from "react";
import { resolveMembership, type StaffRole, type Viewer } from "@ck/core";
import { getContext, type AppContext } from "@/lib/app";

/**
 * The trainings given to her one at a time (Admin -> Give access). Empty if the 0033 database
 * change is not applied yet, so pages keep working.
 */
export async function loadProgramGrants(
  supabase: AppContext["supabase"],
  userId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("program_grants")
    .select("program_id")
    .eq("user_id", userId);
  if (error) return [];
  return ((data ?? []) as { program_id: string }[]).map((g) => g.program_id);
}

/** Who is looking: her entitlement (from the memberships table) and any staff roles. Never from the browser. */
export const getViewer = cache(async () => {
  const { supabase, user } = await getContext();
  const [{ data: row }, { data: roles }, grants] = await Promise.all([
    supabase
      .from("memberships")
      .select("entitlement,status,period_end,cancel_at_period_end")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("staff_roles").select("role").eq("user_id", user.id).eq("active", true),
    loadProgramGrants(supabase, user.id),
  ]);
  const membership = resolveMembership(row);
  const viewer: Viewer = {
    entitlement: membership.entitlement,
    staffRoles: ((roles ?? []) as { role: StaffRole }[]).map((r) => r.role),
    programGrants: grants,
  };
  return { viewer, membership };
});
