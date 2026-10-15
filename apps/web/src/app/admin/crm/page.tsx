import type { Metadata } from "next";
import { crmConfigured } from "@/lib/crm";
import { ABtn, Flash, H1, Panel, Status, Table, td } from "@/components/admin/ui";
import { OPS, requireStaff } from "@/lib/admin";
import { retryCrmEvent, runCrmNow } from "../actions";

export const metadata: Metadata = { title: "CRM sync" };

export default async function AdminCrm({
  searchParams,
}: {
  searchParams: Promise<{ ran?: string; retried?: string }>;
}) {
  const sp = await searchParams;
  const { db } = await requireStaff(OPS);
  const { data } = await db
    .from("crm_sync_events")
    .select(
      "id,event_type,status,attempts,last_error,created_at,sent_at,profiles(first_name,last_name)",
    )
    .order("created_at", { ascending: false })
    .limit(50);
  type E = {
    id: string;
    event_type: string;
    status: string;
    attempts: number;
    last_error: string | null;
    created_at: string;
    profiles: { first_name: string; last_name: string } | null;
  };
  const rows = (data ?? []) as unknown as E[];
  const pending = rows.filter((r) => r.status !== "sent").length;
  return (
    <>
      <H1
        right={
          <form action={runCrmNow}>
            <ABtn variant="primary">Run sync now</ABtn>
          </form>
        }
      >
        Toasted Media CRM sync
      </H1>
      {!crmConfigured() ? (
        <Flash bad>
          CRM connection details are not set yet. Events are queued safely and will send
          once TOASTED_CRM_* settings are added.
        </Flash>
      ) : null}
      {sp.ran ? (
        <Flash>
          {sp.ran === "skipped"
            ? "Sync skipped: CRM is not configured."
            : `Sync finished. Sent ${sp.ran.split("-")[0]}, failed ${sp.ran.split("-")[1]}.`}
        </Flash>
      ) : null}
      {sp.retried ? <Flash>Queued for retry.</Flash> : null}
      <Panel title={`Latest events (${pending} waiting or failed)`}>
        <Table head={["When", "Event", "Member", "Status", "Detail", ""]}>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className={td}>{new Date(r.created_at).toLocaleString("en-CA", { timeZone: "America/Vancouver", timeZone: "America/Vancouver" })}</td>
              <td className={td}>
                <code>{r.event_type}</code>
              </td>
              <td className={td}>
                {r.profiles?.first_name} {r.profiles?.last_name}
              </td>
              <td className={td}>
                <Status
                  tone={
                    r.status === "sent" ? "ok" : r.status === "failed" ? "bad" : "warn"
                  }
                >
                  {r.status}
                </Status>
              </td>
              <td className={td}>
                <span className="text-xs text-muted">
                  {r.last_error ?? (r.attempts ? `${r.attempts} attempt(s)` : "")}
                </span>
              </td>
              <td className={td}>
                {r.status === "failed" ? (
                  <form action={retryCrmEvent.bind(null, r.id)}>
                    <ABtn variant="ghost">Retry</ABtn>
                  </form>
                ) : null}
              </td>
            </tr>
          ))}
        </Table>
        {rows.length === 0 ? (
          <p className="py-3 text-sm text-muted">No events yet.</p>
        ) : null}
        <p className="mt-2 text-xs text-muted">
          Only lifecycle events are sent. Weight, measurements and health answers are
          never sent.
        </p>
      </Panel>
    </>
  );
}
