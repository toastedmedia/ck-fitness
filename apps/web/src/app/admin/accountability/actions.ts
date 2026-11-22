"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isCallOutcome } from "@ck/core";
import { audit, requireStaff } from "@/lib/admin";

/** A coach logs a call (outcome + short note). Saved as the signed-in staff member; RLS checks the role. */
export async function logCall(userId: string, formData: FormData): Promise<void> {
  const { supabase, user } = await requireStaff(["owner", "admin", "coach"]);
  const outcome = String(formData.get("outcome") ?? "");
  const note =
    String(formData.get("note") ?? "")
      .trim()
      .slice(0, 500) || null;
  const back = String(formData.get("back") ?? "/admin/accountability");
  const safeBack = back.startsWith("/admin/accountability")
    ? back
    : "/admin/accountability";
  if (!/^[0-9a-f-]{36}$/.test(userId) || !isCallOutcome(outcome))
    redirect(`${safeBack}${safeBack.includes("?") ? "&" : "?"}callerror=1`);
  const { error } = await supabase
    .from("member_calls")
    .insert({ user_id: userId, called_by: user.id, outcome, note });
  if (error) redirect(`${safeBack}${safeBack.includes("?") ? "&" : "?"}callerror=1`);
  await audit(supabase, user.id, "member.call", userId, { outcome });
  revalidatePath("/admin/accountability");
  redirect(`${safeBack}${safeBack.includes("?") ? "&" : "?"}called=1#call-today`);
}
