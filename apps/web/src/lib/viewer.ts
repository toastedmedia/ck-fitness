import "server-only";
import { cache } from "react";
import { resolveMembership, type StaffRole, type Viewer } from "@ck/core";
import { getContext } from "@/lib/app";

/** Who is looking: her entitlement (from the memberships table) and any staff roles. Never from the browser. */
export const getViewer = cache(async () => {
  const { supabase, user } = await getContext();
  const [{ data: row }, { data: roles }] = await Promise.all([
    supabase
      .from("memberships")
      .select("entitlement,status,period_end,cancel_at_period_end")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("staff_roles").select("role").eq("user_id", user.id).eq("active", true),
  ]);
  const membership = resolveMembership(row);
  const viewer: Viewer = {
    entitlement: membership.entitlement,
    staffRoles: ((roles ?? []) as { role: StaffRole }[]).map((r) => r.role),
  };
  return { viewer, membership };
});
