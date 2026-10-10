import type { Metadata } from "next";
import { ABtn, Flash, H1, Panel, aInput } from "@/components/admin/ui";
import { OPS, requireStaff } from "@/lib/admin";
import { sendAnnouncement } from "../actions";

export const metadata: Metadata = { title: "Notifications" };

export default async function AdminNotifications({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const sp = await searchParams;
  await requireStaff(OPS);
  return (
    <>
      <H1>Announcements</H1>
      {sp.sent ? <Flash>Sent to {sp.sent} members.</Flash> : null}
      {sp.error ? (
        <Flash bad>
          {sp.error === "title"
            ? "Please add a title."
            : "Links must start with / (for example /programs)."}
        </Flash>
      ) : null}
      <Panel title="New in-app announcement">
        <form action={sendAnnouncement} className="flex max-w-xl flex-col gap-3">
          <label className="text-xs font-bold text-brand">
            Title
            <input name="title" required maxLength={100} className={aInput} />
          </label>
          <label className="text-xs font-bold text-brand">
            Message
            <textarea name="body" rows={3} maxLength={400} className={`${aInput} py-2`} />
          </label>
          <label className="text-xs font-bold text-brand">
            Link inside the app (optional)
            <input name="link" placeholder="/programs" className={aInput} />
          </label>
          <label className="text-xs font-bold text-brand">
            Who gets it
            <select name="audience" className={aInput}>
              <option value="all">Everyone</option>
              <option value="free">Free members</option>
              <option value="member">Members (including premium)</option>
              <option value="premium">Premium only</option>
            </select>
          </label>
          <p className="text-xs text-muted">
            Announcements appear in each member&apos;s notification centre. Keep them
            useful and occasional.
          </p>
          <ABtn variant="primary">Send announcement</ABtn>
        </form>
      </Panel>
    </>
  );
}
