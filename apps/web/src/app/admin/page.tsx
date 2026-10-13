import type { Metadata } from "next";
import Link from "next/link";
import { resolveMembership } from "@ck/core";
import { Panel, Status, Tile, H1, Table, td } from "@/components/admin/ui";
import { ALL_STAFF, requireStaff } from "@/lib/admin";

export const metadata: Metadata = { title: "Dashboard" };

export default async function AdminDashboard() {
  const { db, roles } = await requireStaff(ALL_STAFF);
  const since7 = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [profiles, members, active, risk, starts, completes, help, billing, recent] =
    await Promise.all([
      db
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("onboarding_complete", true),
      db.from("memberships").select("entitlement,status,period_end,cancel_at_period_end"),
      db
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .gte("last_active_at", since7),
      db
        .from("risk_states")
        .select("*", { count: "exact", head: true })
        .in("state", ["at_risk_7d", "at_risk_14d"]),
      db
        .from("analytics_events")
        .select("*", { count: "exact", head: true })
        .eq("event_name", "program_started")
        .gte("created_at", since7),
      db
        .from("analytics_events")
        .select("*", { count: "exact", head: true })
        .eq("event_name", "program_completed")
        .gte("created_at", since7),
      db
        .from("support_requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "open"),
      db
        .from("memberships")
        .select("user_id,profiles(first_name,last_name)")
        .eq("status", "past_due"),
      db
        .from("support_requests")
        .select("id,category,message,created_at,profiles(first_name,last_name)")
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);
  const paying = (
    (members.data ?? []) as {
      entitlement: string;
      status: string;
      period_end: string | null;
      cancel_at_period_end: boolean;
    }[]
  ).filter((m) => resolveMembership(m).entitlement !== "free").length;
  const total = profiles.count ?? 0;
  const showMoney = roles.includes("owner") || roles.includes("admin");

  return (
    <>
      <H1>Dashboard</H1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile value={Math.max(total - paying, 0)} label="Free members" />
        <Tile value={paying} label="Active members" />
        <Tile value={active.count ?? 0} label="Active in 7 days" />
        <Tile value={risk.count ?? 0} label="At risk (7+ days quiet)" />
        <Tile value={starts.count ?? 0} label="Training starts (7 days)" />
        <Tile value={completes.count ?? 0} label="Training completions (7 days)" />
        <Tile value={help.count ?? 0} label="Open help requests" />
        {showMoney ? (
          <Tile
            value={`$${(paying * 29.99).toFixed(0)}`}
            label="Estimated monthly revenue"
          />
        ) : null}
      </div>
      <Panel title="Needs attention">
        <Table head={["Who", "What", ""]}>
          {(
            (billing.data ?? []) as unknown as {
              user_id: string;
              profiles: { first_name: string; last_name: string } | null;
            }[]
          ).map((b) => (
            <tr key={b.user_id}>
              <td className={td}>
                {b.profiles?.first_name} {b.profiles?.last_name}
              </td>
              <td className={td}>
                <Status tone="warn">Billing problem</Status>
              </td>
              <td className={td}>
                <Link
                  className="font-bold text-brand underline"
                  href={`/admin/users/${b.user_id}`}
                >
                  Open
                </Link>
              </td>
            </tr>
          ))}
          {(
            (recent.data ?? []) as unknown as {
              id: string;
              category: string;
              message: string;
              profiles: { first_name: string; last_name: string } | null;
            }[]
          ).map((r) => (
            <tr key={r.id}>
              <td className={td}>
                {r.profiles?.first_name} {r.profiles?.last_name}
              </td>
              <td className={td}>
                <Status tone="bad">
                  {r.category === "coaching" ? "Coaching interest" : "Asked for help"}
                </Status>{" "}
                <span className="text-muted">{r.message.slice(0, 60)}</span>
              </td>
              <td className={td}>
                <Link className="font-bold text-brand underline" href="/admin/support">
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </Table>
        {(billing.data ?? []).length + (recent.data ?? []).length === 0 ? (
          <p className="py-3 text-sm text-muted">Nothing needs attention right now.</p>
        ) : null}
      </Panel>
    </>
  );
}
