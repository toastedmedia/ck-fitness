import type { Metadata } from "next";
import Link from "next/link";
import { weekStart, dayKey } from "@ck/core";
import { H1, Panel, Status, Table, Tile, td } from "@/components/admin/ui";
import { requireStaff } from "@/lib/admin";

export const metadata: Metadata = { title: "Accountability" };

export default async function AdminAccountability() {
  const { db } = await requireStaff(["owner", "admin", "coach"]);
  const start = weekStart(dayKey(new Date()));
  const [risk, checkins, members, helpers] = await Promise.all([
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
      .select("id,user_id,category,message,profiles(first_name,last_name)")
      .neq("status", "resolved")
      .in("category", ["help", "coaching"])
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
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
        <Tile value={(helpers.data ?? []).length} label="Asked for help" />
      </div>
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
                  ? new Date(r.last_activity_at).toLocaleDateString("en-CA")
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
