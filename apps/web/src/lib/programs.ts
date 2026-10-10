import "server-only";
import type { AppContext } from "@/lib/app";

export interface TodayWorkout {
  label: string;
  title: string;
  subtitle: string;
  href: string | null;
  scheduled: boolean;
}

/** What the Today card should show. Extended by the programs milestone to follow her program. */
export async function getTodayWorkout({
  supabase,
  user,
  today,
}: AppContext): Promise<TodayWorkout> {
  const { data } = await supabase
    .from("scheduled_actions")
    .select("id")
    .eq("user_id", user.id)
    .eq("action_type", "workout")
    .eq("scheduled_for", today)
    .in("status", ["planned", "completed"])
    .maybeSingle();
  if (data)
    return {
      label: "Today",
      title: "Training session",
      subtitle: "Your planned workout",
      href: null,
      scheduled: true,
    };
  return {
    label: "Today",
    title: "Rest or move gently",
    subtitle: "No session planned. A walk counts.",
    href: null,
    scheduled: false,
  };
}
