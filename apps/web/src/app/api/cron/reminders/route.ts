import { NextResponse, type NextRequest } from "next/server";
import {
  addDays,
  dayKey,
  dayOfWeek,
  hourIn,
  weekStart,
  weeklyCheckinDue,
  workoutReminderDue,
} from "@ck/core";
import { cronGuard } from "@/lib/cron";
import { sendMemberEmail } from "@/lib/email/send";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Hourly: creates in-app reminders. Each one is de-duplicated by key, so running twice in an hour
 * (or being retried) never sends a member the same reminder twice. Respects her notification choices.
 */
export async function GET(request: NextRequest) {
  const denied = cronGuard(request);
  if (denied) return denied;
  const db = createAdminSupabase();
  const now = new Date();
  const { data: profiles } = await db
    .from("profiles")
    .select("user_id,first_name,timezone,last_active_at,created_at")
    .eq("onboarding_complete", true);
  const { data: prefs } = await db
    .from("notification_preferences")
    .select("user_id,workout,water,weekly_checkin");
  const pref = new Map(
    (
      (prefs ?? []) as {
        user_id: string;
        workout: boolean;
        water: boolean;
        weekly_checkin: boolean;
      }[]
    ).map((p) => [p.user_id, p]),
  );
  const { data: plans } = await db
    .from("accountability_plans")
    .select("user_id,reminder_time");
  const plan = new Map(
    ((plans ?? []) as { user_id: string; reminder_time: string }[]).map((p) => [
      p.user_id,
      p.reminder_time,
    ]),
  );
  let created = 0;

  const send = async (
    userId: string,
    key: string,
    kind: string,
    title: string,
    body: string,
    link: string,
  ) => {
    const { error } = await db
      .from("notifications")
      .insert({ user_id: userId, kind, title, body, link, dedupe_key: key });
    if (!error) {
      created++; // a duplicate key just means it was already sent
      // The two accountability nudges that are worth an email too (the rest stay in-app).
      if (kind === "checkin") await sendMemberEmail(userId, "checkin_reminder");
      if (kind === "restart") await sendMemberEmail(userId, "we_miss_you");
    }
  };

  for (const p of (profiles ?? []) as {
    user_id: string;
    first_name: string | null;
    timezone: string;
    last_active_at: string | null;
    created_at: string;
  }[]) {
    const today = dayKey(now, p.timezone);
    const hour = hourIn(now, p.timezone);
    const name = p.first_name ?? "there";
    const pr = pref.get(p.user_id);

    if (pr?.workout !== false) {
      const { data: acts } = await db
        .from("scheduled_actions")
        .select("status")
        .eq("user_id", p.user_id)
        .eq("action_type", "workout")
        .eq("scheduled_for", today);
      const planned = (acts ?? []).some(
        (a: { status: string }) => a.status === "planned",
      );
      const done = (acts ?? []).some((a: { status: string }) => a.status === "completed");
      if (workoutReminderDue(hour, plan.get(p.user_id) ?? "07:00", planned, done)) {
        await send(
          p.user_id,
          `workout:${today}`,
          "workout",
          `${name}, today's session is ready`,
          "A short session keeps your week on track.",
          "/home",
        );
      }
    }

    // Opt-in water nudge: mid-afternoon, once a day, only if she is behind.
    if (pr?.water === true && hour >= 14 && hour < 20) {
      const { data: w } = await db
        .from("habit_logs")
        .select("value")
        .eq("user_id", p.user_id)
        .eq("habit_type", "water_ml")
        .eq("log_date", today);
      const total = (w ?? []).reduce(
        (sum: number, r: { value: number }) => sum + Number(r.value),
        0,
      );
      if (total < 1000)
        await send(
          p.user_id,
          `water:${today}`,
          "water",
          "Time for some water",
          "A glass now keeps you on track.",
          "/home",
        );
    }

    // Monthly: gentle prompt to log measurements if none in 30 days (day 1 to 7 of the month).
    if (Number(today.slice(8)) <= 7 && hour >= 10) {
      const { data: m } = await db
        .from("body_measurements")
        .select("log_date")
        .eq("user_id", p.user_id)
        .order("log_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      const stale =
        !m ||
        (new Date(`${today}T00:00:00Z`).getTime() -
          new Date(`${m.log_date}T00:00:00Z`).getTime()) /
          86_400_000 >
          30;
      if (stale)
        await send(
          p.user_id,
          `measure:${today.slice(0, 7)}`,
          "progress",
          "Time for your monthly measurements?",
          "Optional. It only takes a minute.",
          "/progress",
        );
    }

    // Monday morning (the calendar week starts Monday): the weekly check-in for the week that just ended,
    // once per week, for everyone who joined before today. Never on Friday, never on the day they join.
    if (
      pr?.weekly_checkin !== false &&
      weeklyCheckinDue({
        today,
        dayOfWeek: dayOfWeek(today),
        hour,
        joinedDay: dayKey(new Date(p.created_at), p.timezone),
      })
    ) {
      const thisWeek = weekStart(today);
      const lastWeek = addDays(thisWeek, -7);
      const { data: ci } = await db
        .from("weekly_checkins")
        .select("id")
        .eq("user_id", p.user_id)
        .eq("week_start", lastWeek)
        .maybeSingle();
      if (!ci)
        await send(
          p.user_id,
          `checkin-mon:${thisWeek}`,
          "checkin",
          "Your weekly check-in is ready",
          "How was last week? It takes about a minute.",
          "/accountability/checkin?week=last",
        );
    }

    // Three quiet days: one friendly restart note per quiet stretch.
    if (
      p.last_active_at &&
      now.getTime() - new Date(p.last_active_at).getTime() >= 3 * 86_400_000 &&
      hour >= 9
    ) {
      await send(
        p.user_id,
        `restart:${dayKey(new Date(p.last_active_at), p.timezone)}`,
        "restart",
        `${name}, pick up where you left off`,
        "One short session is a great restart.",
        "/home",
      );
    }
  }
  return NextResponse.json({ members: profiles?.length ?? 0, created });
}
