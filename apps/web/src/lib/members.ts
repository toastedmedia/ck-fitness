import "server-only";
import { randomBytes } from "node:crypto";
import type { createAdminSupabase } from "@/lib/supabase/admin";

type Db = ReturnType<typeof createAdminSupabase>;

export interface NewMember {
  first: string;
  last: string;
  email: string;
  phone: string | null;
}

/**
 * Creates a member account on her behalf (service role; callers must be owner/admin). She gets a
 * random password she never sees, so she signs in by choosing "Forgot password". If the email already
 * has an account, nothing is overwritten except blank name or phone fields.
 */
export async function createMember(
  db: Db,
  m: NewMember,
): Promise<{ id: string; created: boolean }> {
  const { data: existing } = await db
    .from("profiles")
    .select("user_id,first_name,last_name,phone")
    .eq("email", m.email)
    .maybeSingle();
  if (existing) {
    const fill: Record<string, string> = {};
    if (!existing.first_name && m.first) fill.first_name = m.first;
    if (!existing.last_name && m.last) fill.last_name = m.last;
    if (!existing.phone && m.phone) fill.phone = m.phone;
    if (Object.keys(fill).length)
      await db.from("profiles").update(fill).eq("user_id", existing.user_id);
    return { id: existing.user_id, created: false };
  }
  const { data, error } = await db.auth.admin.createUser({
    email: m.email,
    password: randomBytes(24).toString("base64url"),
    email_confirm: true,
    user_metadata: { first_name: m.first, last_name: m.last, phone: m.phone ?? "" },
  });
  if (error || !data.user)
    throw new Error(error?.message ?? "Could not create the account.");
  // The sign-up trigger copies these too; this keeps it working even before that database change.
  await db
    .from("profiles")
    .update({ first_name: m.first || null, last_name: m.last || null, phone: m.phone })
    .eq("user_id", data.user.id);
  return { id: data.user.id, created: true };
}

export type GrantResult = {
  /** granted: newly opened; already: she could already open it; not_needed: free training. */
  access: "granted" | "already" | "not_needed";
  /** True when CK Membership (all member trainings) was given as well. */
  membership: boolean;
  enrolled: boolean;
};

/**
 * Gives one member a training and puts it under My Trainings.
 * By default this opens ONLY that training (a "program grant", for example a one-off purchase);
 * it never gives CK Membership. Pass `membership: true` to also make her a CK Member by hand
 * (all member trainings), which is what a studio client gets. Never touches a Stripe subscription.
 */
export async function grantAccess(
  db: Db,
  userId: string,
  programId: string,
  opts: { membership?: boolean; by?: string | null } = {},
): Promise<GrantResult> {
  const { data: program } = await db
    .from("programs")
    .select("id,access_level")
    .eq("id", programId)
    .maybeSingle();
  if (!program) throw new Error("Training not found.");

  let access: GrantResult["access"] = "not_needed";
  let membership = false;
  // Coach-only trainings are never opened by CK Membership, so they always use a grant.
  if (
    program.access_level !== "free" &&
    program.access_level !== "coach_only" &&
    opts.membership
  ) {
    // CK Membership by hand: every member training, for as long as staff keep it on.
    const { data: m } = await db
      .from("memberships")
      .select("provider,entitlement")
      .eq("user_id", userId)
      .maybeSingle();
    if ((m && m.provider !== "manual") || m?.entitlement === "ck_premium")
      access = "already";
    else {
      await db.from("memberships").upsert(
        {
          user_id: userId,
          provider: "manual",
          source: "manual",
          entitlement: "ck_member",
          status: "active",
          period_end: null,
          cancel_at_period_end: false,
          started_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      access = m?.entitlement === "ck_member" ? "already" : "granted";
      membership = true;
    }
  } else if (program.access_level !== "free") {
    // This training only.
    const { data: had, error: readError } = await db
      .from("program_grants")
      .select("program_id")
      .eq("user_id", userId)
      .eq("program_id", programId)
      .maybeSingle();
    const { error } = readError
      ? { error: readError }
      : await db
          .from("program_grants")
          .upsert(
            { user_id: userId, program_id: programId, granted_by: opts.by ?? null },
            { onConflict: "user_id,program_id", ignoreDuplicates: true },
          );
    // Never fall back to giving full membership: without the 0033 database change, stop.
    if (error)
      throw new Error(
        "One-training access needs database change 0033 (program_grants). Run it in Supabase first.",
      );
    access = had ? "already" : "granted";
  }

  const { data: enr } = await db
    .from("program_enrollments")
    .select("id")
    .eq("user_id", userId)
    .eq("program_id", programId)
    .maybeSingle();
  if (enr) return { access, membership, enrolled: false };
  const { data: secs } = await db
    .from("program_sections")
    .select("id")
    .eq("program_id", programId)
    .eq("published", true)
    .order("order_index");
  let first: string | null = null;
  for (const s of secs ?? []) {
    const { data: l } = await db
      .from("lessons")
      .select("id")
      .eq("section_id", s.id)
      .eq("published", true)
      .order("order_index")
      .limit(1)
      .maybeSingle();
    if (l) {
      first = l.id;
      break;
    }
  }
  await db
    .from("program_enrollments")
    .insert({ user_id: userId, program_id: programId, current_lesson_id: first });
  return { access, membership, enrolled: true };
}

/** Takes one training away again (only the hand-given grant; membership is separate). */
export async function removeGrant(db: Db, userId: string, programId: string) {
  const { error } = await db
    .from("program_grants")
    .delete()
    .eq("user_id", userId)
    .eq("program_id", programId);
  if (error) throw new Error(error.message);
}
