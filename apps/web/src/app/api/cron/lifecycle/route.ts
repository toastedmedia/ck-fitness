import { NextResponse, type NextRequest } from "next/server";
import { LIFECYCLE_KEYS, nextLifecycleEmail, type LifecycleKey } from "@ck/core";
import { cronGuard } from "@/lib/cron";
import { track } from "@/lib/events";
import { resendConfirmationEmail } from "@/lib/email/confirm";
import { emailConfigured, sendMemberEmail } from "@/lib/email/send";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_PER_RUN = 120;
const DAY = 86_400_000;

/**
 * Daily: the "keep them coming back" emails. Finish-your-setup reminders (24 h, then 48 h, then 72 h
 * apart), a nudge to start the first training, and two motivational notes after a quiet week or two.
 * Only for people who signed up themselves (accepted the terms) and confirmed their email; never for
 * imported members. Each email is recorded as an event so it is sent once, and at most one goes out
 * every 2 days per member. Each member's Email switch and the unsubscribe link apply.
 */
export async function GET(request: NextRequest) {
  const denied = cronGuard(request);
  if (denied) return denied;
  if (!emailConfigured()) return NextResponse.json({ skipped: "email not configured" });
  const db = createAdminSupabase();
  const now = Date.now();

  const { data: profiles } = await db
    .from("profiles")
    .select("user_id,created_at,onboarding_complete,last_active_at")
    .not("terms_accepted_at", "is", null)
    .gte("created_at", new Date(now - 120 * 86_400_000).toISOString());
  const names = [
    ...LIFECYCLE_KEYS.map((k) => `email_${k}`),
    "email_confirm_resend_1",
    "email_confirm_resend_2",
    "onboarding_completed",
  ];
  const { data: events } = await db
    .from("analytics_events")
    .select("user_id,event_name,created_at")
    .in("event_name", names)
    .limit(20000);
  const sentBy = new Map<string, Partial<Record<LifecycleKey, number>>>();
  const onboardedAt = new Map<string, number>();
  for (const e of (events ?? []) as {
    user_id: string | null;
    event_name: string;
    created_at: string;
  }[]) {
    if (!e.user_id) continue;
    const t = new Date(e.created_at).getTime();
    if (e.event_name === "onboarding_completed") {
      onboardedAt.set(e.user_id, Math.min(onboardedAt.get(e.user_id) ?? t, t));
      continue;
    }
    const key = e.event_name.slice(6) as LifecycleKey;
    const m = sentBy.get(e.user_id) ?? {};
    m[key] = Math.max(m[key] ?? 0, t);
    sentBy.set(e.user_id, m);
  }

  let sent = 0;
  for (const p of (profiles ?? []) as {
    user_id: string;
    created_at: string;
    onboarding_complete: boolean;
    last_active_at: string | null;
  }[]) {
    if (sent >= MAX_PER_RUN) break;
    const input = {
      now,
      signupAt: new Date(p.created_at).getTime(),
      onboardingComplete: p.onboarding_complete,
      onboardedAt: onboardedAt.get(p.user_id) ?? null,
      hasWorkout: false,
      lastActiveAt: p.last_active_at ? new Date(p.last_active_at).getTime() : null,
      sent: sentBy.get(p.user_id) ?? {},
    };
    // Never confirmed their email: they cannot log in, so resend the confirmation instead (24 h, then 72 h later).
    const confirmSent = sentBy.get(p.user_id) as Record<string, number> | undefined;
    if (
      !p.onboarding_complete &&
      now - input.signupAt >= DAY &&
      now - input.signupAt <= 14 * DAY
    ) {
      const c1 = confirmSent?.confirm_resend_1;
      const c2 = confirmSent?.confirm_resend_2;
      if (c2 === undefined && (c1 === undefined || now - c1 >= 3 * DAY)) {
        const { data: u0 } = await db.auth.admin.getUserById(p.user_id);
        if (u0?.user && !u0.user.email_confirmed_at && u0.user.email) {
          await track(
            p.user_id,
            c1 === undefined ? "email_confirm_resend_1" : "email_confirm_resend_2",
          );
          await resendConfirmationEmail(db, u0.user.email);
          sent++;
          continue;
        }
      }
    }
    // Only look up workouts when it changes the answer.
    let key = nextLifecycleEmail(input);
    if (key === null || key.startsWith("start_") || key.startsWith("quiet_")) {
      const withWorkout = nextLifecycleEmail({ ...input, hasWorkout: true });
      if (key !== withWorkout) {
        const [{ count: a }, { count: b }] = await Promise.all([
          db
            .from("scheduled_actions")
            .select("*", { count: "exact", head: true })
            .eq("user_id", p.user_id)
            .eq("action_type", "workout")
            .eq("status", "completed"),
          db
            .from("lesson_progress")
            .select("*", { count: "exact", head: true })
            .eq("user_id", p.user_id)
            .not("completed_at", "is", null),
        ]);
        if ((a ?? 0) + (b ?? 0) > 0) key = withWorkout;
      }
    }
    if (!key) continue;
    // Skip addresses that were never confirmed (they may be typos); try again after they confirm.
    const { data: u } = await db.auth.admin.getUserById(p.user_id);
    if (!u?.user?.email_confirmed_at) continue;
    await track(p.user_id, `email_${key}`);
    await sendMemberEmail(p.user_id, key);
    sent++;
  }
  return NextResponse.json({ checked: profiles?.length ?? 0, sent });
}
