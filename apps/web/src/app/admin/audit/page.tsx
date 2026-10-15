import type { Metadata } from "next";
import { H1, Panel, Table, td } from "@/components/admin/ui";
import { OPS, requireStaff } from "@/lib/admin";

export const metadata: Metadata = { title: "Audit log" };

export default async function AdminAudit() {
  const { db } = await requireStaff(OPS);
  const { data } = await db
    .from("admin_audit_log")
    .select("id,action,target,details,created_at,actor_id")
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = (data ?? []) as {
    id: string;
    action: string;
    target: string | null;
    details: Record<string, unknown>;
    created_at: string;
    actor_id: string | null;
  }[];
  const ids = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))] as string[];
  const { data: actors } = ids.length
    ? await db.from("profiles").select("user_id,first_name,last_name").in("user_id", ids)
    : { data: [] };
  const name = new Map(
    ((actors ?? []) as { user_id: string; first_name: string; last_name: string }[]).map(
      (a) => [a.user_id, `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim()],
    ),
  );
  return (
    <>
      <H1>Audit log</H1>
      <Panel>
        <Table head={["When", "Who", "What", "Target", "Details"]}>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className={td}>{new Date(r.created_at).toLocaleString("en-CA", { timeZone: "America/Vancouver", timeZone: "America/Vancouver" })}</td>
              <td className={td}>{(r.actor_id && name.get(r.actor_id)) || "-"}</td>
              <td className={td}>
                <code>{r.action}</code>
              </td>
              <td className={td}>
                <span className="text-xs text-muted">{r.target?.slice(0, 8)}</span>
              </td>
              <td className={td}>
                <span className="text-xs text-muted">
                  {JSON.stringify(r.details).slice(0, 80)}
                </span>
              </td>
            </tr>
          ))}
        </Table>
        {rows.length === 0 ? (
          <p className="py-3 text-sm text-muted">No changes recorded yet.</p>
        ) : null}
      </Panel>
    </>
  );
}
