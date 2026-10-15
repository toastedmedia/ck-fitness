import { NextResponse, type NextRequest } from "next/server";
import { dayKey } from "@ck/core";
import { cronGuard } from "@/lib/cron";
import { sendMemberEmail } from "@/lib/email/send";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily (about 8 am Vancouver): for each published meal plan whose "notify on" date has come and
 * that has not been announced, tell every member in the app and by email (their Email switch).
 * The plan is claimed first, so a retry never announces it twice.
 */
export async function GET(request: NextRequest) {
  const denied = cronGuard(request);
  if (denied) return denied;
  const db = createAdminSupabase();
  const today = dayKey(new Date(), "America/Vancouver");
  const { data: due } = await db
    .from("diet_plans")
    .select("id,title")
    .eq("published", true)
    .is("notified_at", null)
    .not("notify_on", "is", null)
    .lte("notify_on", today);
  let announced = 0;
  for (const plan of (due ?? []) as { id: string; title: string }[]) {
    const { data: claimed } = await db
      .from("diet_plans")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", plan.id)
      .is("notified_at", null)
      .select("id");
    if (!claimed?.length) continue;
    const { data: members } = await db
      .from("profiles")
      .select("user_id")
      .eq("onboarding_complete", true);
    for (const m of (members ?? []) as { user_id: string }[]) {
      const { error } = await db.from("notifications").insert({
        user_id: m.user_id,
        kind: "content",
        title: "Your new meal plan is ready",
        body: plan.title,
        link: "/accountability/diet",
        dedupe_key: `mealplan:${plan.id}`,
      });
      if (!error) await sendMemberEmail(m.user_id, "meal_plan");
    }
    announced++;
  }
  return NextResponse.json({ announced });
}
