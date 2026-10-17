import "server-only";
import { notFound } from "next/navigation";
import { isTester, parseTesters } from "@ck/core";
import { flags } from "@/lib/flags";
import { getContext, type AppContext } from "@/lib/app";
import { isNativeApp } from "@/lib/native";
import { getViewer } from "@/lib/viewer";

/** Emails that see Nutrition before it is on for everyone: Admin -> Settings list plus the built-in default. */
export async function nutritionTesters(
  supabase: AppContext["supabase"],
): Promise<string[]> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "nutrition_testers")
    .maybeSingle();
  return parseTesters(data?.value);
}

/** Is Nutrition switched on for this member, and may she use it? (No page redirects: for Home, Profile, cron-like checks.) */
export async function nutritionAccess(ctx: AppContext) {
  const { viewer } = await getViewer();
  const tester = isTester(ctx.user.email, await nutritionTesters(ctx.supabase));
  const staffPreview = viewer.staffRoles.some((r) => r === "owner" || r === "admin");
  const on = flags.nutrition_tracker_enabled || tester;
  const paid = viewer.entitlement !== "free";
  return { on, tester, staffPreview, viewer, allowed: on && (paid || tester), paid };
}

/**
 * One door for every Nutrition page and action.
 * - Feature flag off: hidden for everyone except testers and owners/admins (preview).
 * - Paid only: an active CK Membership (the existing entitlement), or a tester / owner / admin.
 */
export async function nutritionGate() {
  const ctx = await getContext();
  const a = await nutritionAccess(ctx);
  if (!a.on && !a.staffPreview) notFound();
  return {
    ...ctx,
    viewer: a.viewer,
    staffPreview: a.staffPreview,
    tester: a.tester,
    allowed: a.paid || a.staffPreview || a.tester,
    native: await isNativeApp(),
  };
}

export type NutritionCtx = Awaited<ReturnType<typeof nutritionGate>>;

export interface NutritionProfileRow {
  daily_calorie_target: number;
  daily_protein_target: number;
  daily_carbs_target: number | null;
  daily_fat_target: number | null;
  target_source: string;
  activity_level: string | null;
  goal_type: string | null;
  share_with_coach: boolean;
}

export const PROFILE_COLUMNS =
  "daily_calorie_target,daily_protein_target,daily_carbs_target,daily_fat_target,target_source,activity_level,goal_type,share_with_coach";
