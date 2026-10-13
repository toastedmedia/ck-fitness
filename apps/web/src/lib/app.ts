import "server-only";
import { cache } from "react";
import { DEFAULT_TZ, dayKey, mergeGoals, type DailyGoals } from "@ck/core";
import { requireUser } from "@/lib/auth";

export interface Profile {
  first_name: string | null;
  last_name: string | null;
  onboarding_complete: boolean;
  timezone: string;
  hide_bmi: boolean;
  created_at: string;
  last_active_at: string | null;
  units: string;
  photo_consent_at: string | null;
  phone: string | null;
  coach_access_at: string | null;
  photo_coach_access_at: string | null;
  sharing_decided_at: string | null;
  community_accepted_at: string | null;
}

/** Everything most signed-in pages need, fetched once per request. */
export const getContext = cache(async () => {
  const { supabase, user } = await requireUser();
  const FULL =
    "first_name,last_name,onboarding_complete,timezone,hide_bmi,created_at,last_active_at,units,photo_consent_at,phone,coach_access_at,photo_coach_access_at,sharing_decided_at,community_accepted_at";
  // Columns that arrive with the newest database changes. If a deploy goes out a moment before
  // its database change is applied, fall back to the long-standing columns instead of breaking.
  const BASE =
    "first_name,last_name,onboarding_complete,timezone,hide_bmi,created_at,last_active_at,units";
  const [first, { data: settings }] = await Promise.all([
    supabase.from("profiles").select(FULL).eq("user_id", user.id).maybeSingle(),
    supabase
      .from("app_settings")
      .select("key,value")
      .eq("key", "daily_goals")
      .maybeSingle(),
  ]);
  const profile = first.error
    ? (await supabase.from("profiles").select(BASE).eq("user_id", user.id).maybeSingle())
        .data
    : first.data;
  const p = (profile ?? null) as Profile | null;
  const tz = p?.timezone ?? DEFAULT_TZ;
  const goals: DailyGoals = mergeGoals(settings?.value);
  return { supabase, user, profile: p, tz, goals, today: dayKey(new Date(), tz) };
});

export type AppContext = Awaited<ReturnType<typeof getContext>>;
