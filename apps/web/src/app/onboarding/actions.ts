"use server";

import {
  needsSafetyGuidance,
  validateAbout,
  validateGoal,
  validateLifestyle,
  validateSafety,
  validateTraining,
  type Errors,
} from "@ck/core";
import { dayKey, DEFAULT_TZ } from "@ck/core";
import { requireUser } from "@/lib/auth";
import { queueCrm, track } from "@/lib/events";

export type StepResult = { ok: true } | { ok: false; errors: Errors };

const fail = (message: string): StepResult => ({ ok: false, errors: { form: message } });

/** Saves one onboarding step for the signed-in user. Row-level security restricts writes to her own rows. */
export async function saveOnboardingStep(
  step: number,
  raw: Record<string, unknown>,
): Promise<StepResult> {
  const { supabase, user } = await requireUser();
  const id = user.id;
  const save = async (table: string, row: Record<string, unknown>) => {
    const { error } = await supabase
      .from(table)
      .upsert({ user_id: id, ...row }, { onConflict: "user_id" });
    return error ? fail("We could not save that. Please try again.") : null;
  };

  const finishOnboarding = async (weeklyCommitment: number) => {
    const { data: ob } = await supabase
      .from("onboarding_profiles")
      .select(
        "preferred_days,reminder_time,starting_weight_kg,primary_goal,training_location",
      )
      .eq("user_id", id)
      .maybeSingle();
    const days: number[] = ob?.preferred_days ?? [];
    const plan = await save("accountability_plans", {
      weekly_target_workouts: weeklyCommitment,
      preferred_days: days,
      reminder_time: ob?.reminder_time ?? "07:00",
    });
    if (plan) return plan;
    // Her starting weight becomes the first point on her progress chart.
    if (ob?.starting_weight_kg) {
      await supabase.from("weigh_ins").upsert(
        {
          user_id: id,
          log_date: dayKey(new Date(), DEFAULT_TZ),
          weight_kg: ob.starting_weight_kg,
        },
        { onConflict: "user_id,log_date" },
      );
    }
    const done = await save("profiles", { onboarding_complete: true });
    if (!done) {
      await queueCrm(id, "onboarding_completed", {
        goal: ob?.primary_goal,
        location: ob?.training_location,
      });
      await track(id, "onboarding_completed");
    }
    return done;
  };

  switch (step) {
    case 1: {
      const r = validateAbout(raw);
      if (!r.ok) return r;
      const v = r.value;
      return (
        (await save("profiles", {
          first_name: v.firstName,
          last_name: v.lastName,
          birth_date: v.birthDate,
          gender_preference: v.gender,
          units: v.units,
        })) ??
        (await save("onboarding_profiles", {
          height_cm: v.heightCm,
          starting_weight_kg: v.weightKg,
        })) ?? {
          ok: true,
        }
      );
    }
    case 2: {
      const r = validateGoal(raw);
      if (!r.ok) return r;
      return (
        (await save("onboarding_profiles", {
          primary_goal: r.value.primaryGoal,
          secondary_goals: r.value.secondaryGoals,
        })) ?? { ok: true }
      );
    }
    case 3: {
      const r = validateTraining(raw);
      if (!r.ok) return r;
      const v = r.value;
      return (
        (await save("onboarding_profiles", {
          level: v.level,
          training_location: v.location,
          equipment: v.equipment,
          preferred_days: v.preferredDays,
          reminder_time: v.reminderTime,
        })) ?? { ok: true }
      );
    }
    case 4: {
      const r = validateLifestyle(raw);
      if (!r.ok) return r;
      const v = r.value;
      return (
        (await save("onboarding_profiles", {
          nutrition_preference: v.nutrition,
          activity_range: v.activity,
          sleep_range: v.sleep,
          schedule_constraints: v.constraints,
        })) ?? { ok: true }
      );
    }
    case 5: {
      const r = validateSafety(raw);
      if (!r.ok) return r;
      const v = r.value;
      const err =
        (await save("onboarding_profiles", {
          weekly_commitment: v.weeklyCommitment,
          starting_reason: v.startingReason,
          safety_flags: {
            limitations: v.limitations,
            pregnancy_context: v.pregnancyContext,
            show_guidance: needsSafetyGuidance(v),
          },
          health_ack_at: new Date().toISOString(),
        })) ?? (await finishOnboarding(v.weeklyCommitment));
      return err ?? { ok: true };
    }
    default:
      return fail("Unknown step.");
  }
}
