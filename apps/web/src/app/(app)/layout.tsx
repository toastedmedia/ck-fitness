import { redirect } from "next/navigation";
import { Nav } from "@/components/app/Nav";
import { getContext } from "@/lib/app";

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
  }

  return (
    <div className="min-h-dvh pb-24 md:pb-8 md:pl-56">
      <Nav />
      <main
        id="main"
        className="mx-auto flex max-w-xl flex-col gap-3 px-4 pt-6 md:max-w-2xl md:pt-10"
      >
        {children}
      </main>
    </div>
  );
}
