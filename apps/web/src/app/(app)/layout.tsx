import { redirect } from "next/navigation";
import { Nav } from "@/components/app/Nav";
import { TopActions } from "@/components/app/TopActions";
import { getContext } from "@/lib/app";
import { track } from "@/lib/events";

export const dynamic = "force-dynamic";

/** Frame for every signed-in page: login and onboarding checks, navigation, last-seen tracking. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user, profile } = await getContext();
  if (!profile?.onboarding_complete) redirect("/onboarding");

  // Record that she opened the app (at most once an hour) so inactivity can be spotted fairly.
  const last = profile.last_active_at ? new Date(profile.last_active_at).getTime() : 0;
  if (Date.now() - last > 3_600_000) {
    await supabase
      .from("profiles")
      .update({ last_active_at: new Date().toISOString() })
      .eq("user_id", user.id);
    await track(user.id, "dashboard_viewed");
  }

  const { count: unread } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null);

  return (
    <div className="min-h-dvh pb-24 md:pb-8 md:pl-56">
      <Nav />
      <main
        id="main"
        className="mx-auto flex max-w-xl flex-col gap-3 px-4 pt-6 md:max-w-2xl md:pt-10 [&>h1:nth-child(2)]:pointer-events-none [&>h1:nth-child(2)]:-mt-[2.7rem]"
      >
        <TopActions
          initial={(profile.first_name?.[0] ?? "?").toUpperCase()}
          unread={unread ?? 0}
        />
        {children}
      </main>
    </div>
  );
}
