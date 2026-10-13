import type { Metadata } from "next";
import Link from "next/link";
import { Button, Card } from "@/components/app/ui";
import { getContext } from "@/lib/app";
import { markAllRead } from "./actions";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const { supabase, user, tz } = await getContext();
  const { data } = await supabase
    .from("notifications")
    .select("id,title,body,link,read_at,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(40);
  const items = (data ?? []) as {
    id: string;
    title: string;
    body: string;
    link: string | null;
    read_at: string | null;
    created_at: string;
  }[];
  const unread = items.filter((n) => !n.read_at).length;
  const when = (iso: string) =>
    new Intl.DateTimeFormat("en-CA", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      timeZone: tz,
    }).format(new Date(iso));

  return (
    <>
      <div className="flex items-center justify-end">
        <h1 className="sr-only">Notifications</h1>
        {unread > 0 ? (
          <form action={markAllRead}>
            <Button variant="ghost" className="min-h-10">
              Mark all read
            </Button>
          </form>
        ) : null}
      </div>
      {items.length === 0 ? (
        <Card>
          <p className="text-xs text-muted">
            You are all caught up. Reminders and updates will show here.
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((n) => {
            const inner = (
              <>
                <div className="flex items-start gap-2">
                  {!n.read_at ? (
                    <span
                      aria-label="Unread"
                      className="mt-1.5 size-2 shrink-0 rounded-full bg-accent"
                    />
                  ) : (
                    <span className="size-2 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <b className="block text-xs text-brand">{n.title}</b>
                    {n.body ? (
                      <span className="text-[11.5px] text-muted">{n.body}</span>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-[10px] text-muted">
                    {when(n.created_at)}
                  </span>
                </div>
              </>
            );
            return (
              <li key={n.id}>
                {n.link ? (
                  <Link
                    href={n.link}
                    className="block rounded-card border border-line bg-surface p-3"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div className="rounded-card border border-line bg-surface p-3">
                    {inner}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
