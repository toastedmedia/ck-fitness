"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/lib/app";

export async function markAllRead(): Promise<void> {
  const { supabase, user } = await getContext();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);
  revalidatePath("/", "layout");
}
