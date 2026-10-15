"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isDiet } from "@ck/core";
import { getContext } from "@/lib/app";

/** The member picks vegetarian or non-vegetarian; we remember it. */
export async function setDietPref(formData: FormData): Promise<void> {
  const { supabase, user } = await getContext();
  const diet = String(formData.get("diet") ?? "");
  if (!isDiet(diet)) redirect("/accountability/diet");
  await supabase
    .from("member_diet_pref")
    .upsert({ user_id: user.id, diet, updated_at: new Date().toISOString() });
  revalidatePath("/home");
  redirect("/accountability/diet");
}
