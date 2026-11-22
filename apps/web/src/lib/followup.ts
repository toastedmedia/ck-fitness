import "server-only";
import { addDays, dayKey, resolveMembership, type FollowUpMember } from "@ck/core";
import { createAdminSupabase } from "@/lib/supabase/admin";

type Db = ReturnType<typeof createAdminSupabase>;

/**
 * Everything the "Call today" list and the missed-workout text need, for every member who finished
 * signing up (staff left out). `callsMissing` is true until SQL 0032 is run.
 */
export async function loadFollowUpMembers(
  db: Db = createAdminSupabase(),
  today: string = dayKey(new Date()),
): Promise<{ members: FollowUpMember[]; callsMissing: boolean }> {
  const weekAgo = addDays(today, -7);
  const [profiles, staff, memberships, done, missed, calls] = await Promise.all([
    db
      .from("profiles")
      .select("user_id,first_name,last_name,phone,created_at,timezone")
      .eq("onboarding_complete", true),
    db.from("staff_roles").select("user_id").eq("active", true),
    db
      .from("memberships")
      .select("user_id,entitlement,status,period_end,cancel_at_period_end"),
    db
      .from("scheduled_actions")
      .select("user_id,scheduled_for")
      .eq("action_type", "workout")
      .eq("status", "completed")
      .gte("scheduled_for", addDays(today, -365))
      .order("scheduled_for", { ascending: false })
      .limit(20000),
    db
      .from("scheduled_actions")
      .select("user_id,scheduled_for,status,barrier")
      .eq("action_type", "workout")
      .in("status", ["planned", "skipped"])
      .gte("scheduled_for", weekAgo)
      .lt("scheduled_for", today)
      .order("scheduled_for", { ascending: false }),
    db
      .from("member_calls")
      .select("user_id,outcome,note,created_at,called_by")
      .order("created_at", { ascending: false })
      .limit(2000),
  ]);

  const staffIds = new Set(
    ((staff.data ?? []) as { user_id: string }[]).map((s) => s.user_id),
  );
  const paid = new Set(
    (
      (memberships.data ?? []) as {
        user_id: string;
        entitlement: string;
        status: string;
        period_end: string | null;
        cancel_at_period_end: boolean;
      }[]
    )
      .filter((m) => resolveMembership(m as never).entitlement !== "free")
      .map((m) => m.user_id),
  );
  const lastWorkout = new Map<string, string>();
  for (const r of (done.data ?? []) as { user_id: string; scheduled_for: string }[])
    if (!lastWorkout.has(r.user_id)) lastWorkout.set(r.user_id, r.scheduled_for);
  const missedCount = new Map<string, number>();
  const lastReason = new Map<string, string>();
  for (const r of (missed.data ?? []) as {
    user_id: string;
    barrier: string | null;
  }[]) {
    missedCount.set(r.user_id, (missedCount.get(r.user_id) ?? 0) + 1);
    if (r.barrier && !lastReason.has(r.user_id)) lastReason.set(r.user_id, r.barrier);
  }

  const callRows = (calls.data ?? []) as {
    user_id: string;
    outcome: string;
    note: string | null;
    created_at: string;
    called_by: string | null;
  }[];
  const profileRows = (profiles.data ?? []) as {
    user_id: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    created_at: string;
    timezone: string | null;
  }[];
  const nameOf = new Map(
    profileRows.map((p) => [
      p.user_id,
      [p.first_name, p.last_name].filter(Boolean).join(" "),
    ]),
  );
  // Callers are staff, who are not in the member list; look their names up separately.
  const callerIds = [
    ...new Set(callRows.map((c) => c.called_by).filter(Boolean)),
  ] as string[];
  if (callerIds.length) {
    const { data } = await db
      .from("profiles")
      .select("user_id,first_name")
      .in("user_id", callerIds);
    for (const p of (data ?? []) as { user_id: string; first_name: string | null }[])
      nameOf.set(p.user_id, p.first_name ?? "");
  }
  const lastCall = new Map<string, FollowUpMember["lastCall"]>();
  for (const c of callRows)
    if (!lastCall.has(c.user_id))
      lastCall.set(c.user_id, {
        at: c.created_at,
        outcome: c.outcome,
        note: c.note,
        by: c.called_by ? nameOf.get(c.called_by) || "Staff" : null,
      });

  const members = profileRows
    .filter((p) => !staffIds.has(p.user_id))
    .map((p) => ({
      userId: p.user_id,
      name: [p.first_name, p.last_name].filter(Boolean).join(" ") || "Member",
      phone: p.phone,
      paid: paid.has(p.user_id),
      joinedDay: dayKey(new Date(p.created_at), p.timezone ?? undefined),
      lastWorkoutDay: lastWorkout.get(p.user_id) ?? null,
      missedLast7: missedCount.get(p.user_id) ?? 0,
      lastReason: lastReason.get(p.user_id) ?? null,
      lastCall: lastCall.get(p.user_id) ?? null,
    }));
  return { members, callsMissing: Boolean(calls.error) };
}
