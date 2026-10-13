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

/**
 * Gives one member access to a program the way a payment would: a manual CK Membership when the
 * program is paid (never touches a Stripe subscription), and enrols her so it shows under My Programs.
 */
export async function grantAccess(
  db: Db,
  userId: string,
  programId: string,
): Promise<{ membership: "granted" | "already" | "not_needed"; enrolled: boolean }> {
  const { data: program } = await db
    .from("programs")
    .select("id,access_level")
    .eq("id", programId)
    .maybeSingle();
  if (!program) throw new Error("Program not found.");

  let membership: "granted" | "already" | "not_needed" = "not_needed";
  if (program.access_level !== "free") {
    const { data: m } = await db
      .from("memberships")
      .select("provider,entitlement,status")
      .eq("user_id", userId)
      .maybeSingle();
    if (m && m.provider !== "manual") membership = "already";
    else if (m?.entitlement === "ck_premium") membership = "already";
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
      membership = "granted";
    }
  }

  const { data: enr } = await db
    .from("program_enrollments")
    .select("id")
    .eq("user_id", userId)
    .eq("program_id", programId)
    .maybeSingle();
  if (enr) return { membership, enrolled: false };
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
  return { membership, enrolled: true };
}
