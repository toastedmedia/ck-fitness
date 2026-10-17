"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addDays,
  asUnits,
  isBarrier,
  lengthToCm,
  validateDailyCheckin,
  weekStart,
  weekProgress,
  weightToKg,
  type ActionStatus,
} from "@ck/core";
import { getContext } from "@/lib/app";
import { track } from "@/lib/events";
import { awardMilestones } from "@/lib/milestones";
import { ensurePlan, ensureWeekPlanned, plannedDays } from "@/lib/plan";

export interface ActionResult {
  error?: string;
  ok?: boolean;
}

const refresh = () => revalidatePath("/", "layout");
const num = (v: FormDataEntryValue | null) => (v === null || v === "" ? NaN : Number(v));
const score = (v: FormDataEntryValue | null) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
};

export async function addWater(ml: number): Promise<ActionResult> {
  const { supabase, user, today } = await getContext();
  if (!Number.isFinite(ml) || ml < 50 || ml > 2000)
    return { error: "Choose an amount between 50 and 2000 mL." };
  const { error } = await supabase
    .from("habit_logs")
    .insert({ user_id: user.id, log_date: today, habit_type: "water_ml", value: ml });
  if (error) return { error: "We could not save that. Please try again." };
  refresh();
  return { ok: true };
}

export async function undoWater(): Promise<ActionResult & { removed?: number }> {
  const { supabase, user, today } = await getContext();
  const { data } = await supabase
    .from("habit_logs")
    .select("id,value")
    .eq("user_id", user.id)
    .eq("log_date", today)
    .eq("habit_type", "water_ml")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data) await supabase.from("habit_logs").delete().eq("id", data.id);
  refresh();
  return { ok: true, removed: data ? Number(data.value) : 0 };
}

/** Adds steps to what is already logged today, so 2,000 plus 650 becomes 2,650. */
export async function addSteps(amount: number): Promise<void> {
  const { supabase, user, today } = await getContext();
  const add = Math.round(Number(amount));
  if (!Number.isFinite(add) || add <= 0 || add > 100000) return;
  const { data: row } = await supabase
    .from("habit_logs")
    .select("id,value")
    .eq("user_id", user.id)
    .eq("log_date", today)
    .eq("habit_type", "steps")
    .maybeSingle();
  const total = Math.min(100000, Math.round(Number(row?.value ?? 0)) + add);
  if (row) await supabase.from("habit_logs").update({ value: total }).eq("id", row.id);
  else
    await supabase
      .from("habit_logs")
      .insert({ user_id: user.id, log_date: today, habit_type: "steps", value: total });
  refresh();
}

export async function setSteps(formData: FormData): Promise<void> {
  const { supabase, user, today } = await getContext();
  const steps = Math.round(num(formData.get("steps")));
  if (!Number.isFinite(steps) || steps < 0 || steps > 100000) return;
  const { data: row } = await supabase
    .from("habit_logs")
    .select("id")
    .eq("user_id", user.id)
    .eq("log_date", today)
    .eq("habit_type", "steps")
    .maybeSingle();
  if (row) await supabase.from("habit_logs").update({ value: steps }).eq("id", row.id);
  else
    await supabase
      .from("habit_logs")
      .insert({ user_id: user.id, log_date: today, habit_type: "steps", value: steps });
  refresh();
}

export async function logWeight(formData: FormData): Promise<void> {
  const { supabase, user, today, profile } = await getContext();
  const kg = weightToKg(num(formData.get("weight")), asUnits(profile?.units));
  if (!(kg >= 35 && kg <= 300)) redirect("/home?error=weight");
  await supabase
    .from("weigh_ins")
    .upsert(
      { user_id: user.id, log_date: today, weight_kg: kg },
      { onConflict: "user_id,log_date" },
    );
  refresh();
  redirect("/home");
}

export async function logMeasurements(formData: FormData): Promise<void> {
  const { supabase, user, today, profile } = await getContext();
  const units = asUnits(profile?.units);
  const field = (k: string) => {
    const n = num(formData.get(k));
    const cm = Number.isFinite(n) ? lengthToCm(n, units) : NaN;
    return cm > 0 && cm < 300 ? cm : null;
  };
  const row = {
    waist_cm: field("waist"),
    hips_cm: field("hips"),
    bust_cm: field("bust"),
    thigh_cm: field("thigh"),
    arm_cm: field("arm"),
  };
  if (Object.values(row).every((v) => v === null))
    redirect("/progress?error=measurements");
  await supabase
    .from("body_measurements")
    .upsert(
      { user_id: user.id, log_date: today, ...row },
      { onConflict: "user_id,log_date" },
    );
  refresh();
  redirect("/progress?saved=measurements");
}

async function todaysWorkout(ctx: Awaited<ReturnType<typeof getContext>>) {
  const { data } = await ctx.supabase
    .from("scheduled_actions")
    .select("id,status")
    .eq("user_id", ctx.user.id)
    .eq("action_type", "workout")
    .eq("scheduled_for", ctx.today)
    .in("status", ["planned", "completed"])
    .maybeSingle();
  return data as { id: string; status: ActionStatus } | null;
}

export async function completeWorkout(): Promise<void> {
  const ctx = await getContext();
  const existing = await todaysWorkout(ctx);
  const now = new Date().toISOString();
  if (existing) {
    await ctx.supabase
      .from("scheduled_actions")
      .update({ status: "completed", completed_at: now })
      .eq("id", existing.id);
  } else {
    // An extra session she chose to do on a rest day still counts.
    await ctx.supabase.from("scheduled_actions").insert({
      user_id: ctx.user.id,
      action_type: "workout",
      scheduled_for: ctx.today,
      status: "completed",
      completed_at: now,
    });
  }
  await awardMilestones(ctx);
  refresh();
}

/** Missed-day recovery: Reschedule, Rest or Skip. Never framed as failure. */
export async function recoverWorkout(
  actionId: string,
  choice: "reschedule" | "rest" | "skip",
): Promise<ActionResult> {
  const ctx = await getContext();
  const { supabase, user, today } = ctx;
  const { data: action } = await supabase
    .from("scheduled_actions")
    .select("id,scheduled_for,status")
    .eq("id", actionId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!action || action.status !== "planned")
    return { error: "That session is already sorted." };

  if (choice === "reschedule") {
    const end = addDays(weekStart(action.scheduled_for), 6);
    const { data: taken } = await supabase
      .from("scheduled_actions")
      .select("scheduled_for")
      .eq("user_id", user.id)
      .eq("action_type", "workout")
      .in("status", ["planned", "completed"])
      .gte("scheduled_for", today)
      .lte("scheduled_for", end);
    const busy = new Set(
      (taken ?? []).map((t: { scheduled_for: string }) => t.scheduled_for),
    );
    let target = today;
    while (target <= end && busy.has(target)) target = addDays(target, 1);
    if (target > end)
      return {
        error: "This week is full. Choose Rest, and we will plan next week fresh.",
      };
    await supabase
      .from("scheduled_actions")
      .update({ status: "rescheduled" })
      .eq("id", actionId);
    await supabase
      .from("scheduled_actions")
      .insert({ user_id: user.id, action_type: "workout", scheduled_for: target });
  } else {
    await supabase
      .from("scheduled_actions")
      .update({ status: "skipped", note: choice })
      .eq("id", actionId);
  }
  refresh();
  return { ok: true };
}

/** The 15-second daily check-in. Also counts as today's check-in action for streaks and the CK Score. */
export async function saveDailyCheckin(
  raw: Record<string, unknown>,
): Promise<ActionResult> {
  const { supabase, user, today } = await getContext();
  const v = validateDailyCheckin(raw);
  if (!v.ok) return { error: v.error };
  const { error } = await supabase.from("daily_checkins").upsert(
    {
      user_id: user.id,
      check_date: today,
      energy: v.value.energy,
      soreness: v.value.soreness,
      sleep: v.value.sleep,
      mood: v.value.mood,
      optional_note: v.value.note || null,
    },
    { onConflict: "user_id,check_date" },
  );
  if (error) return { error: "We could not save that. Please try again." };
  const { data: row } = await supabase
    .from("scheduled_actions")
    .select("id")
    .eq("user_id", user.id)
    .eq("action_type", "checkin")
    .eq("scheduled_for", today)
    .maybeSingle();
  const values = {
    status: "completed",
    completed_at: new Date().toISOString(),
    note: v.value.mood,
  };
  if (row) await supabase.from("scheduled_actions").update(values).eq("id", row.id);
  else
    await supabase.from("scheduled_actions").insert({
      user_id: user.id,
      action_type: "checkin",
      scheduled_for: today,
      ...values,
    });
  await track(user.id, "daily_checkin_completed");
  refresh();
  return { ok: true };
}

/** "What's getting in the way?" Saves the reason against the missed workout and closes it gently. */
export async function saveBarrier(
  actionId: string,
  reason: string,
): Promise<ActionResult> {
  const { supabase, user } = await getContext();
  if (!isBarrier(reason)) return { error: "Please choose one of the options." };
  const { data: action } = await supabase
    .from("scheduled_actions")
    .select("id,status")
    .eq("id", actionId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!action || action.status !== "planned")
    return { error: "That session is already sorted." };
  await supabase
    .from("scheduled_actions")
    .update({ status: "skipped", barrier: reason, note: "help" })
    .eq("id", actionId);
  await track(user.id, "barrier_selected", { reason });
  refresh();
  return { ok: true };
}

export async function toggleBmi(): Promise<void> {
  const { supabase, user, profile } = await getContext();
  await supabase
    .from("profiles")
    .update({ hide_bmi: !profile?.hide_bmi })
    .eq("user_id", user.id);
  refresh();
}

export async function dismissMilestones(): Promise<void> {
  const { supabase, user } = await getContext();
  await supabase
    .from("milestones")
    .update({ seen: true })
    .eq("user_id", user.id)
    .eq("seen", false);
  refresh();
}

export async function setCommitment(formData: FormData): Promise<void> {
  const ctx = await getContext();
  const days = formData
    .getAll("days")
    .map(Number)
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  const target = Math.min(
    7,
    Math.max(1, Math.round(num(formData.get("target")) || days.length || 3)),
  );
  const time = String(formData.get("time") ?? "07:00");
  if (days.length === 0) redirect("/accountability?error=days");
  await ctx.supabase.from("accountability_plans").upsert(
    {
      user_id: ctx.user.id,
      weekly_target_workouts: target,
      preferred_days: days,
      reminder_time: /^\d\d:\d\d$/.test(time) ? time : "07:00",
    },
    { onConflict: "user_id" },
  );
  // Re-plan the rest of this week to match her new days.
  await ctx.supabase
    .from("scheduled_actions")
    .delete()
    .eq("user_id", ctx.user.id)
    .eq("action_type", "workout")
    .eq("status", "planned")
    .gte("scheduled_for", ctx.today);
  await ensureWeekPlanned(ctx, await ensurePlan(ctx));
  refresh();
  redirect("/accountability?saved=commitment");
}

export async function submitWeeklyCheckin(formData: FormData): Promise<void> {
  const ctx = await getContext();
  const { supabase, user, today } = ctx;
  const start = weekStart(today);
  const energy = score(formData.get("energy")),
    sleep = score(formData.get("sleep"));
  const soreness = score(formData.get("soreness")),
    confidence = score(formData.get("confidence"));
  if (!energy || !sleep || !soreness || !confidence)
    redirect("/accountability/checkin?error=answers");
  const { data: acts } = await supabase
    .from("scheduled_actions")
    .select("scheduled_for,status")
    .eq("user_id", user.id)
    .eq("action_type", "workout")
    .gte("scheduled_for", start)
    .lte("scheduled_for", addDays(start, 6));
  const prog = weekProgress(
    (acts ?? []) as { scheduled_for: string; status: ActionStatus }[],
  );
  const nextTarget = Math.min(
    7,
    Math.max(1, Math.round(num(formData.get("next_target")) || 3)),
  );
  await supabase.from("weekly_checkins").upsert(
    {
      user_id: user.id,
      week_start: start,
      planned_workouts: prog.planned,
      completed_workouts: prog.completed,
      energy,
      sleep,
      soreness,
      confidence,
      obstacle: String(formData.get("obstacle") ?? "").slice(0, 40) || null,
      note: String(formData.get("note") ?? "").slice(0, 500) || null,
      next_week_target: nextTarget,
    },
    { onConflict: "user_id,week_start" },
  );
  const plan = await ensurePlan(ctx);
  const days = formData
    .getAll("days")
    .map(Number)
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  await supabase.from("accountability_plans").upsert(
    {
      user_id: user.id,
      weekly_target_workouts: nextTarget,
      preferred_days: days.length ? days : plannedDays(plan),
    },
    { onConflict: "user_id" },
  );
  await track(user.id, "weekly_checkin_completed");
  refresh();
  redirect("/accountability/summary?saved=1");
}

export async function saveNotificationPrefs(formData: FormData): Promise<void> {
  const { supabase, user } = await getContext();
  const on = (k: string) => formData.get(k) === "on";
  await supabase.from("notification_preferences").upsert(
    {
      user_id: user.id,
      workout: on("workout"),
      water: on("water"),
      weekly_checkin: on("weekly_checkin"),
      new_content: on("new_content"),
      community: on("community"),
      // Only when the Nutrition toggle was on screen, so saving never switches it off by accident.
      ...(formData.has("nutrition_present") ? { nutrition: on("nutrition") } : {}),
      marketing: on("marketing"),
      email: on("email"),
      sms: on("sms"),
      push: on("push"),
      quiet_hours: {
        start: String(formData.get("quiet_start") ?? "21:00"),
        end: String(formData.get("quiet_end") ?? "07:00"),
      },
      consent_updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  refresh();
  redirect("/profile?saved=prefs");
}

export async function updateProfileName(formData: FormData): Promise<void> {
  const { supabase, user } = await getContext();
  const first = String(formData.get("first_name") ?? "")
    .trim()
    .slice(0, 60);
  const last = String(formData.get("last_name") ?? "")
    .trim()
    .slice(0, 60);
  const phone = String(formData.get("phone") ?? "")
    .trim()
    .slice(0, 30);
  if (!first || !last) redirect("/profile?error=name");
  if (!/^\+?[0-9 ()-]{7,20}$/.test(phone)) redirect("/profile?error=phone");
  await supabase
    .from("profiles")
    .update({ first_name: first, last_name: last, phone: phone || null })
    .eq("user_id", user.id);
  refresh();
  redirect("/profile?saved=name");
}

/** Switch between kg/cm and lb/in. Stored values never change; only what she sees and types. */
export async function setUnits(formData: FormData): Promise<void> {
  const { supabase, user } = await getContext();
  const units = asUnits(formData.get("units"));
  await supabase.from("profiles").update({ units }).eq("user_id", user.id);
  refresh();
  redirect("/profile?saved=units");
}
