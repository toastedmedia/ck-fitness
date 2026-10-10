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
import { requireUser } from "@/lib/auth";

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
        })) ?? (await save("profiles", { onboarding_complete: true }));
      return err ?? { ok: true };
    }
    default:
      return fail("Unknown step.");
  }
}
