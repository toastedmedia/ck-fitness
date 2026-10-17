import "server-only";
import { notFound } from "next/navigation";
import { flags } from "@/lib/flags";
import { getContext } from "@/lib/app";
import { isNativeApp } from "@/lib/native";
import { getViewer } from "@/lib/viewer";

/**
 * One door for every Nutrition page and action.
 * - Feature flag off: hidden for everyone except owners/admins (they can open /nutrition to test).
 * - Paid only: an active CK Membership (the existing entitlement), or an owner/admin in preview.
 */
export async function nutritionGate() {
  const ctx = await getContext();
  const { viewer } = await getViewer();
  const staffPreview = viewer.staffRoles.some((r) => r === "owner" || r === "admin");
  if (!flags.nutrition_tracker_enabled && !staffPreview) notFound();
  const paid = viewer.entitlement !== "free";
  return {
    ...ctx,
    viewer,
    staffPreview,
    allowed: paid || staffPreview,
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
