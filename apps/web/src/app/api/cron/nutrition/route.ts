import { NextResponse, type NextRequest } from "next/server";
import {
  dayKey,
  hourIn,
  localToUtc,
  isTester,
  mergeNudgeConfig,
  parseTesters,
  nutritionNudge,
  resolveMembership,
} from "@ck/core";
import { cronGuard } from "@/lib/cron";
import { track } from "@/lib/events";
import { flags } from "@/lib/flags";
import { sendPush } from "@/lib/push";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Hourly: rule-based, supportive nutrition nudges (in-app now, web push where on, native push later).
 * Paid members who set up nutrition and kept "Nutrition reminders" on. At most ONE proactive nutrition
 * nudge per member per local day. Never email, never about going over a target. While the feature flag is off
 * only the tester list gets them.
 */
export async function GET(request: NextRequest) {
  const denied = cronGuard(request);
  if (denied) return denied;
  const db = createAdminSupabase();
  const now = new Date();

  const [{ data: setting }, { data: testerSetting }, { data: np }] = await Promise.all([
    db.from("app_settings").select("value").eq("key", "nutrition_nudges").maybeSingle(),
    db.from("app_settings").select("value").eq("key", "nutrition_testers").maybeSingle(),
    db.from("nutrition_profiles").select("user_id,daily_protein_target"),
  ]);
  const config = mergeNudgeConfig(setting?.value);
  const testers = parseTesters(testerSetting?.value);
  const people = (np ?? []) as { user_id: string; daily_protein_target: number }[];
  if (people.length === 0) return NextResponse.json({ sent: 0 });
  const ids = people.map((p) => p.user_id);

  const [{ data: members }, { data: profiles }, { data: prefs }] = await Promise.all([
    db
      .from("memberships")
      .select("user_id,entitlement,status,period_end,cancel_at_period_end")
      .in("user_id", ids),
    db
      .from("profiles")
      .select("user_id,timezone,onboarding_complete,email")
      .in("user_id", ids),
    db.from("notification_preferences").select("*").in("user_id", ids),
  ]);
  const paid = new Set(
    (members ?? [])
      .filter((m) => resolveMembership(m).entitlement !== "free")
      .map((m) => m.user_id as string),
  );
  const tzOf = new Map(
    (profiles ?? [])
      .filter((p) => p.onboarding_complete)
      .map((p) => [p.user_id as string, (p.timezone as string) || "America/Vancouver"]),
  );
  // While the feature is off for everyone, only testers get nudges (and they need no membership).
  const testerIds = new Set(
    (profiles ?? [])
      .filter((p) => isTester(p.email as string | null, testers))
      .map((p) => p.user_id as string),
  );
  const off = new Set(
    (prefs ?? []).filter((p) => p.nutrition === false).map((p) => p.user_id as string),
  );

  let sent = 0;
  for (const p of people) {
    const isT = testerIds.has(p.user_id);
    if (!flags.nutrition_tracker_enabled && !isT) continue;
    if ((!paid.has(p.user_id) && !isT) || !tzOf.has(p.user_id) || off.has(p.user_id))
      continue;
    const tz = tzOf.get(p.user_id) as string;
    const today = dayKey(now, tz);
    const hour = hourIn(now, tz);
    // Cheap pre-check so most members cost nothing outside the reminder window.
    if (hour < 10 || hour >= 21) continue;

    const dayStart = (
      localToUtc(today, "00:00", tz) ?? new Date(now.getTime() - 86_400_000)
    ).toISOString();
    const { count: already } = await db
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", p.user_id)
      .like("dedupe_key", "nutrition%")
      .gte("created_at", dayStart);
    if (already) continue;

    const [{ data: todays }, { data: last }] = await Promise.all([
      db
        .from("meal_logs")
        .select("final_protein_g")
        .eq("user_id", p.user_id)
        .eq("meal_date", today),
      db
        .from("meal_logs")
        .select("meal_date")
        .eq("user_id", p.user_id)
        .lt("meal_date", today)
        .order("meal_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const nudge = nutritionNudge({
      hour,
      today,
      mealsToday: todays?.length ?? 0,
      proteinToday: (todays ?? []).reduce((n, m) => n + Number(m.final_protein_g), 0),
      proteinTarget: p.daily_protein_target,
      lastMealDay: (last?.meal_date as string | undefined) ?? null,
      config,
    });
    if (!nudge) continue;
    const key =
      nudge.kind === "idle" ? `nutrition-idle:${last?.meal_date}` : `nutrition:${today}`;
    const { error } = await db.from("notifications").insert({
      user_id: p.user_id,
      kind: "nutrition",
      title: nudge.title,
      body: nudge.body,
      link: "/nutrition",
      dedupe_key: key,
    });
    if (error) continue; // already sent for this stretch/day
    await sendPush(p.user_id, {
      title: nudge.title,
      body: nudge.body,
      link: "/nutrition",
    });
    await track(p.user_id, "nutrition_reminder_sent", { kind: nudge.kind });
    sent++;
  }
  return NextResponse.json({ sent });
}
