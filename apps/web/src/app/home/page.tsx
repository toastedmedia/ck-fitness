import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { bmiLabel, calcBmi } from "@ck/core";
import { SiteFooter } from "@/components/SiteFooter";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Home" };

function greeting(hour: number) {
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

/** Placeholder Home for Milestone 1B: proves sign-up, onboarding and data flow. The full Home is Milestone 1C. */
export default async function Page() {
  const { supabase, user } = await requireUser();
  const [{ data: profile }, { data: ob }] = await Promise.all([
    supabase
      .from("profiles")
      .select("first_name, onboarding_complete")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("onboarding_profiles")
      .select("height_cm, starting_weight_kg, safety_flags")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  if (!profile?.onboarding_complete) redirect("/onboarding");

  const tz = "America/Vancouver";
  const now = new Date();
  const hour = Number(
    new Intl.DateTimeFormat("en-CA", {
      hour: "numeric",
      hour12: false,
      timeZone: tz,
    }).format(now),
  );
  const date = new Intl.DateTimeFormat("en-CA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: tz,
  }).format(now);
  const bmi =
    ob?.height_cm && ob?.starting_weight_kg
      ? calcBmi(Number(ob.starting_weight_kg), Number(ob.height_cm))
      : null;

  return (
    <>
      <main id="main" className="mx-auto flex max-w-md flex-col gap-3 px-4 pt-8">
        <p className="text-sm font-semibold text-muted">{date}</p>
        <h1 className="font-display text-3xl text-brand">
          {greeting(hour)}, {profile.first_name}
        </h1>
        {ob?.safety_flags?.show_guidance ? (
          <div className="rounded-card border border-line bg-surface p-4">
            <p className="font-bold text-brand">A note before you start</p>
            <p className="mt-1 text-muted">
              Because of what you told us, please check with a doctor or physiotherapist
              before hard training. Start gently and stop if anything hurts.
            </p>
          </div>
        ) : null}
        {bmi ? (
          <div className="rounded-card border border-line bg-surface p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-accent-strong">
              Your starting point
            </p>
            <p className="mt-1 text-2xl font-extrabold text-brand">
              {Number(ob?.starting_weight_kg).toFixed(1)} kg
            </p>
            <p className="text-muted">
              BMI {bmi} · {bmiLabel(bmi)}. For information only.
            </p>
          </div>
        ) : null}
        <p className="text-muted">Your full Home screen arrives in the next update.</p>
        <form action="/auth/signout" method="post">
          <button className="min-h-12 rounded-button border-2 border-brand px-6 font-semibold text-brand">
            Log out
          </button>
        </form>
      </main>
      <SiteFooter />
    </>
  );
}
