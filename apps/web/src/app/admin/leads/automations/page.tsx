import type { Metadata } from "next";
import Link from "next/link";
import { AUTOMATION_TRIGGERS, sourceLabel, stageLabel } from "@ck/core";
import { Flash, H1, Panel, Status, Table, td } from "@/components/admin/ui";
import { requireStaff } from "@/lib/admin";
import type { AutomationRow } from "@/lib/automations";
import { CRM_ROLES } from "@/lib/leads";

export const metadata: Metadata = { title: "Email automations" };

export default async function Automations({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const { db } = await requireStaff([...CRM_ROLES]);
  const [{ data, error }, { data: tags }, { data: runs }] = await Promise.all([
    db.from("crm_automations").select("*").order("created_at"),
    db.from("member_tags").select("id,name"),
    db.from("crm_automation_runs").select("automation_id,status").limit(50000),
  ]);
  const list = (data ?? []) as AutomationRow[];
  const tagName = new Map(
    ((tags ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name]),
  );
  const stat = (id: string, st: string) =>
    ((runs ?? []) as { automation_id: string; status: string }[]).filter(
      (r) => r.automation_id === id && r.status === st,
    ).length;
  const when = (a: AutomationRow) =>
    a.trigger_type === "tag_added"
      ? `Tag "${tagName.get(a.trigger_value) ?? "?"}" is added`
      : a.trigger_type === "stage"
        ? `Moves to ${stageLabel(a.trigger_value)}`
        : a.trigger_type === "new_lead"
          ? `New lead${a.trigger_value ? ` from ${sourceLabel(a.trigger_value)}` : ""}`
          : (AUTOMATION_TRIGGERS.find((t) => t.key === a.trigger_type)?.label ??
            a.trigger_type);
  return (
    <>
      <Link href="/admin/leads" className="text-sm font-bold text-brand underline">
        ← All leads
      </Link>
      <H1
        right={
          <Link
            href="/admin/leads/automations/new"
            className="inline-flex min-h-10 items-center rounded-button bg-brand px-4 text-xs font-bold text-on-brand"
          >
            + New automation
          </Link>
        }
      >
        Email automations
      </H1>
      <p className="text-sm text-muted">
        When something happens to a lead (a tag is added, they move to a stage, they are
        new, they book a consultation), send them a series of emails on their own. Only
        leads we may email get them; each email has an unsubscribe link. Each lead goes
        through an automation once.
      </p>
      {error ? (
        <Flash bad>
          Automations are not ready yet. Run the latest database update (0037).
        </Flash>
      ) : null}
      {sp.deleted ? <Flash>Automation deleted.</Flash> : null}
      <Panel>
        {list.length ? (
          <Table
            head={[
              "Name",
              "When",
              "Emails",
              "Status",
              "In progress",
              "Finished",
              "Stopped",
            ]}
          >
            {list.map((a) => (
              <tr key={a.id}>
                <td className={td}>
                  <Link
                    href={`/admin/leads/automations/${a.id}`}
                    className="font-bold text-brand underline"
                  >
                    {a.name}
                  </Link>
                </td>
                <td className={td}>{when(a)}</td>
                <td className={td}>{a.steps?.length ?? 0}</td>
                <td className={td}>
                  <Status tone={a.active ? "ok" : "mute"}>
                    {a.active ? "On" : "Off"}
                  </Status>
                </td>
                <td className={td}>{stat(a.id, "active")}</td>
                <td className={td}>{stat(a.id, "done")}</td>
                <td className={td}>{stat(a.id, "stopped")}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <p className="text-sm text-muted">
            No automations yet. Ideas: a welcome series for new leads; a 3-email Winter
            Challenge series when you tag someone &quot;Winter interest&quot;; a &quot;how
            did it go?&quot; email after a consultation.
          </p>
        )}
      </Panel>
    </>
  );
}
