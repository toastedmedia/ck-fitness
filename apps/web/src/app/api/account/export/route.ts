import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TABLES = [
  "profiles",
  "onboarding_profiles",
  "notification_preferences",
  "accountability_plans",
  "scheduled_actions",
  "habit_logs",
  "weigh_ins",
  "body_measurements",
  "weekly_checkins",
  "milestones",
  "program_enrollments",
  "lesson_progress",
  "daily_checkins",
  "progress_photos",
  "community_posts",
  "community_comments",
  "community_profiles",
  "memberships",
  "support_requests",
  "notifications",
];

/** Gives a member a copy of her own data. Row-level security guarantees it is only hers. */
export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  const out: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    email: user.email,
  };
  for (const t of TABLES) {
    const { data } = await supabase.from(t).select("*").eq("user_id", user.id);
    if (data) out[t] = data;
  }
  return new NextResponse(JSON.stringify(out, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": 'attachment; filename="ck-fitness-my-data.json"',
      "cache-control": "no-store",
    },
  });
}
