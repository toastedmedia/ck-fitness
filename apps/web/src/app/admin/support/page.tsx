import type { Metadata } from "next";
import Link from "next/link";
import { ABtn, Flash, H1, Panel, Status, aInput } from "@/components/admin/ui";
import { SUPPORT, requireStaff } from "@/lib/admin";
import { updateSupportRequest } from "../actions";

export const metadata: Metadata = { title: "Support" };

export default async function AdminSupport({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; all?: string }>;
}) {
  const sp = await searchParams;
  const { db } = await requireStaff(SUPPORT);
  let q = db
    .from("support_requests")
    .select(
      "id,user_id,category,message,status,staff_reply,created_at,profiles(first_name,last_name,email)",
    )
    .order("created_at", { ascending: false })
    .limit(50);
  if (!sp.all) q = q.neq("status", "resolved");
  const { data } = await q;
  type T = {
    id: string;
    user_id: string;
    category: string;
    message: string;
    status: string;
    staff_reply: string | null;
    created_at: string;
    profiles: { first_name: string; last_name: string; email: string } | null;
  };
  const rows = (data ?? []) as unknown as T[];
  return (
    <>
      <H1
        right={
          <Link
            className="text-sm font-bold text-brand underline"
            href={sp.all ? "/admin/support" : "/admin/support?all=1"}
          >
            {sp.all ? "Show open only" : "Show resolved too"}
          </Link>
        }
      >
        Support requests
      </H1>
      {sp.saved ? <Flash>Saved.</Flash> : null}
      {rows.map((t) => (
        <Panel key={t.id}>
          <div className="flex flex-wrap items-center gap-2">
            <Status tone={t.category === "coaching" ? "warn" : "mute"}>
              {t.category}
            </Status>
            <Status tone={t.status === "resolved" ? "ok" : "bad"}>
              {t.status.replace("_", " ")}
            </Status>
            <Link
              href={`/admin/users/${t.user_id}`}
              className="text-sm font-bold text-brand underline"
            >
              {t.profiles?.first_name} {t.profiles?.last_name}
            </Link>
            <span className="text-xs text-muted">
              {t.profiles?.email} · {new Date(t.created_at).toLocaleString("en-CA")}
            </span>
          </div>
          <p className="mt-2 whitespace-pre-line text-sm">{t.message}</p>
          {t.staff_reply ? (
            <p className="mt-2 rounded-xl bg-page p-2 text-sm">
              Replied: {t.staff_reply}
            </p>
          ) : null}
          <form
            action={updateSupportRequest.bind(null, t.id)}
            className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]"
          >
            <textarea
              name="reply"
              rows={2}
              maxLength={2000}
              placeholder="Write a reply (the member is notified in the app)"
              className={`${aInput} py-2`}
            />
            <div className="flex flex-col gap-2">
              <select name="status" defaultValue={t.status} className={aInput}>
                <option value="open">Open</option>
                <option value="in_progress">In progress</option>
                <option value="resolved">Resolved</option>
              </select>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" name="assign" className="size-4 accent-brand" />
                Assign to me
              </label>
              <ABtn variant="primary">Save</ABtn>
            </div>
          </form>
        </Panel>
      ))}
      {rows.length === 0 ? (
        <Panel>
          <p className="text-sm text-muted">No requests. Nice and quiet.</p>
        </Panel>
      ) : null}
    </>
  );
}
