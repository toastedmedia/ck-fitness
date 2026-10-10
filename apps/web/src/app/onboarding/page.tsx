import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingFlow } from "@/components/OnboardingFlow";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Get started" };

export default async function Page() {
  const { supabase, user } = await requireUser();
  const [{ data: profile }, { data: ob }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("onboarding_profiles").select("*").eq("user_id", user.id).maybeSingle(),
  ]);
  if (profile?.onboarding_complete) redirect("/home");

  // Resume where she left off: pre-fill anything already saved.
  const initial = {
    firstName: profile?.first_name ?? "",
    lastName: profile?.last_name ?? "",
    birthDate: profile?.birth_date ?? "",
    gender: profile?.gender_preference ?? "",
    heightCm: ob?.height_cm ?? "",
    weightKg: ob?.starting_weight_kg ?? "",
    primaryGoal: ob?.primary_goal ?? "",
    secondaryGoals: ob?.secondary_goals ?? [],
    level: ob?.level ?? "",
    location: ob?.training_location ?? "",
    equipment: ob?.equipment ?? [],
    preferredDays: (ob?.preferred_days ?? []).map(String),
    reminderTime: ob?.reminder_time?.slice(0, 5) ?? "07:00",
    nutrition: ob?.nutrition_preference ?? "",
    activity: ob?.activity_range ?? "",
    sleep: ob?.sleep_range ?? "",
  };

  return (
    <main id="main" className="mx-auto max-w-md px-4 pb-16 pt-8">
      <OnboardingFlow initial={initial} />
    </main>
  );
}
