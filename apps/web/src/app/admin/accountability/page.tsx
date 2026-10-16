import type { Metadata } from "next";
import Link from "next/link";
import {
  BARRIERS,
  BARRIER_REPLIES,
  isBarrier,
  weekStart,
  dayKey,
  addDays,
} from "@ck/core";
import { Flash, H1, Panel, Status, Table, Tile, td } from "@/components/admin/ui";
import { QuickMessage } from "@/components/admin/QuickMessage";
import { requireStaff } from "@/lib/admin";

export const metadata: Metadata = { title: "Accountability" };

export default async function AdminAccountability({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const { db } = await requireStaff(["owner", "admin", "coach"]);
  const start = weekStart(dayKey(new Date()));
  const since = addDays(dayKey(new Date(), "America/Vancouver"), -7);
  const [risk, checkins, members, helpers, missed] = await Promise.all([
    db
      .from("risk_states")
      .select("user_id,state,last_activity_at,profiles(first_name,last_name,email)")
      .in("state", ["at_risk_7d", "at_risk_14d", "at_risk_3d"])
      .order("last_activity_at"),
    db
      .from("weekly_checkins")
      .select("*", { count: "exact", head: true })
      .eq("week_start", start),
    db
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("onboarding_complete", true),
    db
      .from("support_requests")
      .select("id,user_id,category,message,created_at,profiles(first_name,last_name)")
      .neq("status", "resolved")
      .in("category", ["help", "coaching"])
      .order("created_at", { ascending: false })
      .limit(10),
    // Reasons members gave for a missed workout (only members who share records with the coach).
    db
      .from("scheduled_actions")
      .select(
        "id,user_id,scheduled_for,barrier,profiles!inner(first_name,last_name,coach_access_at)",
      )
      .eq("action_type", "workout")
      .not("barrier", "is", null)
      .not("profiles.coach_access_at", "is", null)
      .gte("scheduled_for", since)
      .order("scheduled_for", { ascending: false })
      .limit(20),
  ]);
  type Help = {
    id: string;
    user_id: string;
    category: string;
    message: string;
    created_at: string;
    profiles: { first_name: string; last_name: string } | null;
  };
  type Missed = {
    id: string;
    user_id: string;
    scheduled_for: string;
    barrier: string;
    profiles: { first_name: string; last_name: string } | null;
  };
  const helps = (helpers.data ?? []) as unknown as Help[];
  const missedRows = (missed.data ?? []) as unknown as Missed[];
  type R = {
    user_id: string;
    state: string;
    last_activity_at: string | null;
    profiles: { first_name: string; last_name: string; email: string } | null;
  };
  const rows = (risk.data ?? []) as unknown as R[];
  const pct = members.count
    ? Math.round(((checkins.count ?? 0) / members.count) * 100)
    : 0;
  return (
    <>
      <H1>Accountability</H1>
      {sp.sent ? (
        <Flash>Message sent. The member sees it in their notifications.</Flash>
      ) : null}
      {sp.error ? <Flash bad>Write a message first.</Flash> : null}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile
          value={rows.filter((r) => r.state === "at_risk_7d").length}
          label="Quiet 7+ days"
        />
        <Tile
          value={rows.filter((r) => r.state === "at_risk_14d").length}
          label="Paid, quiet 14+ days"
        />
        <Tile value={`${pct}%`} label="Weekly check-ins done this week" />
        <Tile value={helps.length} label="Asked for help" />
      </div>
      <Panel title="Asked for help (needs a reply)">
        {helps.length === 0 ? (
          <p className="text-sm text-muted">No open requests.</p>
        ) : (
          <ul className="divide-y divide-line">
            {helps.map((h) => (
              <li key={h.id} className="py-3">
                <p className="text-sm">
                  <Link
                    className="font-bold text-brand underline"
                    href={`/admin/users/${h.user_id}`}
                  >
                    {h.profiles?.first_name} {h.profiles?.last_name}
                  </Link>{" "}
                  <Status tone="warn">{h.category}</Status>{" "}
                  <span className="text-xs text-muted">
                    {new Date(h.created_at).toLocaleString("en-CA", {
                      timeZone: "America/Vancouver",
                    })}
                  </span>
                </p>
                <p className="mt-1 text-sm">{h.message}</p>
                <QuickMessage userId={h.user_id} />
                <p className="mt-1 text-xs text-muted">
                  The full conversation and &quot;mark resolved&quot; are under{" "}
                  <Link className="underline" href="/admin/support">
                    Support
                  </Link>
                  .
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Missed workouts: what got in the way (last 7 days)">
        {missedRows.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing yet. Reasons appear here when a member who shares records with the
            coach says what got in the way.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {missedRows.map((m) => {
              const reason = isBarrier(m.barrier) ? m.barrier : "other";
              return (
                <li key={m.id} className="py-3">
                  <p className="text-sm">
                    <Link
                      className="font-bold text-brand underline"
                      href={`/admin/users/${m.user_id}`}
                    >
                      {m.profiles?.first_name} {m.profiles?.last_name}
                    </Link>{" "}
                    <Status tone="warn">
                      {BARRIERS.find(([k]) => k === reason)?.[1]}
                    </Status>{" "}
                    <span className="text-xs text-muted">missed {m.scheduled_for}</span>
                  </p>
                  <QuickMessage userId={m.user_id} suggestion={BARRIER_REPLIES[reason]} />
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      <Panel title="At-risk members">
        <Table head={["Member", "State", "Last activity", ""]}>
          {rows.map((r) => (
            <tr key={r.user_id}>
              <td className={td}>
                {r.profiles?.first_name} {r.profiles?.last_name}
                <span className="block text-xs text-muted">{r.profiles?.email}</span>
              </td>
              <td className={td}>
                <Status tone={r.state === "at_risk_14d" ? "bad" : "warn"}>
                  {r.state.replace("at_risk_", "Quiet ")}
                </Status>
              </td>
              <td className={td}>
                {r.last_activity_at
                  ? new Date(r.last_activity_at).toLocaleDateString("en-CA", {
                      timeZone: "America/Vancouver",
                    })
                  : "-"}
              </td>
              <td className={td}>
                <Link
                  className="font-bold text-brand underline"
                  href={`/admin/users/${r.user_id}`}
                >
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </Table>
        {rows.length === 0 ? (
          <p className="py-3 text-sm text-muted">Nobody is at risk right now.</p>
        ) : null}
        <p className="mt-2 text-xs text-muted">
          Reminder: do not chase every free member. Focus on paid members quiet for 14
          days.
        </p>
      </Panel>
    </>
  );
}
