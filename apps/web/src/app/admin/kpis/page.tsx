import type { Metadata } from "next";
import {
  computeKpis,
  resolveMembership,
  videoMinutesPerMember,
  addDays,
  dailySeries,
  dayKey,
  seriesTotals,
  weekStart,
} from "@ck/core";
import { BarChart } from "@/components/admin/BarChart";
import { ABtn, Flash, H1, Panel, Tile, aInput } from "@/components/admin/ui";
import { OPS, requireStaff } from "@/lib/admin";
import { saveVideoMinutes } from "../actions";

export const metadata: Metadata = { title: "KPIs" };

const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;

/** The Phase 1 KPI dashboard (Build Guide §16). Last 30 days unless stated. */
export default async function AdminKpis({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const sp = await searchParams;
  const { db } = await requireStaff(OPS);
  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const since7 = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const today = dayKey(now);

  const [{ data: newProfiles }, { data: memberRows }, onboarded, active7, atRisk] =
    await Promise.all([
      db
        .from("profiles")
        .select("user_id,onboarding_complete")
        .gte("created_at", since30),
      db
        .from("memberships")
        .select("user_id,entitlement,status,period_end,cancel_at_period_end"),
      count(
        db
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .eq("onboarding_complete", true),
      ),
      count(
        db
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .gte("last_active_at", since7),
      ),
      db.from("risk_states").select("user_id").in("state", ["at_risk_7d", "at_risk_14d"]),
    ]);

  const paidIds = new Set(
    (
      (memberRows ?? []) as {
        user_id: string;
        entitlement: string;
        status: string;
        period_end: string | null;
        cancel_at_period_end: boolean;
      }[]
    )
      .filter((m) => resolveMembership(m).entitlement !== "free")
      .map((m) => m.user_id),
  );
  const onboardedNew = (
    (newProfiles ?? []) as { user_id: string; onboarding_complete: boolean }[]
  )
    .filter((p) => p.onboarding_complete)
    .map((p) => p.user_id);

  let activated = 0;
  if (onboardedNew.length) {
    const [h, a, l] = await Promise.all([
      db.from("habit_logs").select("user_id").in("user_id", onboardedNew),
      db
        .from("scheduled_actions")
        .select("user_id")
        .in("user_id", onboardedNew)
        .eq("status", "completed"),
      db.from("lesson_progress").select("user_id").in("user_id", onboardedNew),
    ]);
    const did = new Set(
      [...(h.data ?? []), ...(a.data ?? []), ...(l.data ?? [])].map(
        (r: { user_id: string }) => r.user_id,
      ),
    );
    activated = did.size;
  }

  const [converted, expired, paidEnroll, planned, coaching, checkins, leads] =
    await Promise.all([
      count(
        db
          .from("analytics_events")
          .select("*", { count: "exact", head: true })
          .eq("event_name", "membership_started")
          .gte("created_at", since30),
      ),
      count(
        db
          .from("analytics_events")
          .select("*", { count: "exact", head: true })
          .eq("event_name", "membership_expired")
          .gte("created_at", since30),
      ),
      paidIds.size
        ? db
            .from("program_enrollments")
            .select("user_id")
            .in("user_id", [...paidIds])
        : Promise.resolve({ data: [] as { user_id: string }[] }),
      db
        .from("scheduled_actions")
        .select("status")
        .eq("action_type", "workout")
        .in("status", ["planned", "completed"])
        .gte("scheduled_for", addDays(today, -7))
        .lte("scheduled_for", today),
      db
        .from("analytics_events")
        .select("user_id")
        .eq("event_name", "coaching_interest")
        .gte("created_at", since30),
      count(
        db
          .from("weekly_checkins")
          .select("*", { count: "exact", head: true })
          .eq("week_start", weekStart(today)),
      ),
      db
        .from("app_settings")
        .select("value")
        .eq("key", "video_minutes_delivered_month")
        .maybeSingle(),
    ]);
  const actions = (planned.data ?? []) as { status: string }[];
  const paidWithProgram = new Set(
    (paidEnroll.data ?? []).map((r: { user_id: string }) => r.user_id),
  ).size;
  const atRiskPaid = ((atRisk.data ?? []) as { user_id: string }[]).filter((r) =>
    paidIds.has(r.user_id),
  ).length;
  const videoMinutes = typeof leads.data?.value === "number" ? leads.data.value : null;

  // Trends: the last 30 days against the 30 before, from timestamps only (no personal content).
  const since60 = new Date(now.getTime() - 60 * 86_400_000).toISOString();
  const [signups, workouts, posts, comments] = await Promise.all([
    db.from("profiles").select("created_at").gte("created_at", since60),
    db
      .from("scheduled_actions")
      .select("completed_at")
      .eq("status", "completed")
      .gte("completed_at", since60),
    db.from("community_posts").select("created_at").gte("created_at", since60),
    db.from("community_comments").select("created_at").gte("created_at", since60),
  ]);
  const trend = (
    title: string,
    rows: { [k: string]: string | null }[] | null,
    col: string,
  ) => {
    const all = (rows ?? []).map((r) => r[col]);
    const cut = since30;
    const cur = dailySeries(
      all.filter((t) => t && t >= cut),
      30,
      today,
    );
    const prev = all.filter((t) => t && t < cut).length;
    return { title, series: cur, ...seriesTotals(cur, prev) };
  };
  const trends = [
    trend("New sign-ups", signups.data, "created_at"),
    trend("Workouts completed", workouts.data, "completed_at"),
    trend("Community posts", posts.data, "created_at"),
    trend("Community comments", comments.data, "created_at"),
  ];

  const kpis = computeKpis({
    newAccounts: (newProfiles ?? []).length,
    activated,
    freeEligible: Math.max(onboarded - paidIds.size, 0) + converted,
    converted,
    onboarded,
    active7,
    paidMembers: paidIds.size,
    paidWithProgram,
    plannedWorkouts: actions.length,
    completedWorkouts: actions.filter((a) => a.status === "completed").length,
    checkinsThisWeek: checkins,
    atRiskPaid,
    expiredInPeriod: expired,
    coachingLeads: new Set(
      (coaching.data ?? []).map((r: { user_id: string }) => r.user_id),
    ).size,
    videoMinutes,
  });
  const perMember = videoMinutesPerMember(videoMinutes, paidIds.size);

  return (
    <>
      <H1>KPIs</H1>
      {sp.saved ? <Flash>Saved.</Flash> : null}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {kpis.map((k) => (
          <div key={k.key} className="rounded-card border border-line bg-surface p-4">
            <b className="block font-display text-3xl tabular-nums text-brand">
              {k.value === null ? "-" : `${k.value}%`}
            </b>
            <span className="text-sm font-bold text-brand">{k.label}</span>
            <p className="mt-1 text-xs text-muted">
              {k.value === null ? "Not enough data yet." : k.detail}
            </p>
          </div>
        ))}
      </div>
      <Panel title="Trends: last 30 days (change is against the 30 days before)">
        <div className="grid gap-3 md:grid-cols-2">
          {trends.map((t) => (
            <BarChart key={t.title} {...t} />
          ))}
        </div>
      </Panel>
      <Panel title="Video cost guard">
        <div className="grid gap-3 md:grid-cols-[auto_1fr]">
          <Tile
            value={perMember ?? "-"}
            label="Video minutes delivered per paying member (month)"
          />
          <form action={saveVideoMinutes} className="flex flex-wrap items-end gap-2">
            <label className="text-xs font-bold text-brand">
              Minutes delivered this month (optional, for your own tracking)
              <input
                name="minutes"
                type="number"
                min={0}
                defaultValue={videoMinutes ?? ""}
                className={aInput}
              />
            </label>
            <ABtn variant="primary">Save</ABtn>
          </form>
        </div>
        <p className="mt-2 text-xs text-muted">
          If this number jumps, check for autoplay, preloading or abuse. Do not cut
          legitimate use just to save pennies.
        </p>
      </Panel>
    </>
  );
}
