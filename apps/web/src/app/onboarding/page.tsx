import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asUnits, cmToFeetInches, displayWeight } from "@ck/core";
import { OnboardingFlow } from "@/components/OnboardingFlow";
import { requireUser } from "@/lib/auth";
import { trackOnce } from "@/lib/events";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Get started" };

export default async function Page() {
  const { supabase, user } = await requireUser();
  const [{ data: profile }, { data: ob }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("onboarding_profiles").select("*").eq("user_id", user.id).maybeSingle(),
  ]);
  if (profile?.onboarding_complete) redirect("/home");
  await trackOnce(user.id, "onboarding_started");

  // Resume where she left off: pre-fill anything already saved.
  const units = asUnits(profile?.units);
  const feetInches = ob?.height_cm ? cmToFeetInches(Number(ob.height_cm)) : null;
  const initial = {
    units,
    phone: profile?.phone ?? "",
    heightFt: feetInches?.feet ?? "",
    heightIn: feetInches?.inches ?? "",
    weightDisplay: ob?.starting_weight_kg
      ? displayWeight(Number(ob.starting_weight_kg), units)
      : "",
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
