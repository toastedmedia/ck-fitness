import type { Metadata } from "next";
import Link from "next/link";
import { resolveMembership } from "@ck/core";
import { ABtn, H1, Panel, Status, Table, aInput, td } from "@/components/admin/ui";
import { SUPPORT, requireStaff } from "@/lib/admin";

export const metadata: Metadata = { title: "Users" };

/** Staff see who a member is and how she is doing, never her body measurements or safety answers. */
export default async function AdminUsers({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const { db } = await requireStaff(SUPPORT);
  const term = q.trim().replace(/[%,()]/g, "");
  let query = db
    .from("profiles")
    .select(
      "user_id,first_name,last_name,email,onboarding_complete,last_active_at,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(50);
  if (term)
    query = query.or(
      `email.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%`,
    );
  const { data } = await query;
  const rows = (data ?? []) as {
    user_id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    onboarding_complete: boolean;
    last_active_at: string | null;
    created_at: string;
  }[];
  const ids = rows.map((r) => r.user_id);
  const [{ data: ms }, { data: rs }] = await Promise.all([
    ids.length
      ? db
          .from("memberships")
          .select("user_id,entitlement,status,period_end,cancel_at_period_end")
          .in("user_id", ids)
      : { data: [] },
    ids.length
      ? db.from("risk_states").select("user_id,state").in("user_id", ids)
      : { data: [] },
  ]);
  const mem = new Map(
    (
      (ms ?? []) as {
        user_id: string;
        entitlement: string;
        status: string;
        period_end: string | null;
        cancel_at_period_end: boolean;
      }[]
    ).map((m) => [m.user_id, resolveMembership(m)]),
  );
  const risk = new Map(
    ((rs ?? []) as { user_id: string; state: string }[]).map((r) => [r.user_id, r.state]),
  );
  const ago = (iso: string | null) =>
    iso
      ? `${Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000))}d ago`
      : "never";

  return (
    <>
      <H1>Users</H1>
      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by name or email"
          className={aInput}
        />
        <ABtn variant="primary">Search</ABtn>
      </form>
      <Panel>
        <Table head={["Name", "Email", "Plan", "Onboarding", "Last active", "Risk"]}>
          {rows.map((r) => {
            const m = mem.get(r.user_id);
            const st = risk.get(r.user_id) ?? "active";
            return (
              <tr key={r.user_id}>
                <td className={td}>
                  <Link
                    className="font-bold text-brand underline"
                    href={`/admin/users/${r.user_id}`}
                  >
                    {r.first_name ?? "(no name)"} {r.last_name}
                  </Link>
                </td>
                <td className={td}>{r.email}</td>
                <td className={td}>
                  {m && m.state === "active" ? (
                    <Status tone="ok">
                      {m.entitlement === "ck_premium" ? "Premium" : "Member"}
                    </Status>
                  ) : m && m.state === "grace" ? (
                    <Status tone="warn">Billing problem</Status>
                  ) : (
                    <Status tone="mute">Free</Status>
                  )}
                </td>
                <td className={td}>
                  {r.onboarding_complete ? "Complete" : "Not finished"}
                </td>
                <td className={td}>{ago(r.last_active_at)}</td>
                <td className={td}>
                  {st === "active" ? (
                    "-"
                  ) : (
                    <Status tone={st === "at_risk_14d" ? "bad" : "warn"}>
                      {st.replace("at_risk_", "At risk ")}
                    </Status>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
        {rows.length === 0 ? (
          <p className="py-3 text-sm text-muted">No members found.</p>
        ) : null}
      </Panel>
    </>
  );
}
