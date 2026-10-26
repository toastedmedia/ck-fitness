"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isPose, ownsPath, weekStart, type Pose } from "@ck/core";
import { getContext } from "@/lib/app";
import { flags } from "@/lib/flags";

type Result = { ok?: boolean; error?: string };

async function gate() {
  if (!flags.progressPhotos) redirect("/progress");
  return getContext();
}

/** She agrees to store private progress photos. Asked once, and she can delete everything later. */
export async function giveConsent(formData: FormData): Promise<void> {
  const { supabase, user } = await gate();
  // She agrees to private photo storage. Her coach and the CK team can see the photos (see the screen text).
  void formData;
  await supabase
    .from("profiles")
    .update({ photo_consent_at: new Date().toISOString() })
    .eq("user_id", user.id);
  revalidatePath("/progress/photos");
  redirect("/progress/photos");
}

/** Records a photo she has just uploaded straight to private storage. */
export async function recordPhoto(pose: string, path: string): Promise<Result> {
  const { supabase, user, today, profile } = await gate();
  if (!profile?.photo_consent_at)
    await supabase
      .from("profiles")
      .update({ photo_consent_at: new Date().toISOString() })
      .eq("user_id", user.id);
  if (!isPose(pose) || !ownsPath(user.id, path))
    return { error: "That photo could not be saved." };
  const week = weekStart(today);
  // Replacing this week's photo for the same pose: remove the old file afterwards.
  const { data: old } = await supabase
    .from("progress_photos")
    .select("id,storage_path")
    .eq("user_id", user.id)
    .eq("week_start", week)
    .eq("pose", pose)
    .maybeSingle();
  if (old) {
    await supabase.from("progress_photos").delete().eq("id", old.id);
    await supabase.storage.from("progress-photos").remove([old.storage_path]);
  }
  const { error } = await supabase.from("progress_photos").insert({
    user_id: user.id,
    taken_on: today,
    week_start: week,
    pose: pose as Pose,
    storage_path: path,
  });
  if (error) {
    await supabase.storage.from("progress-photos").remove([path]);
    return { error: "That photo could not be saved." };
  }
  revalidatePath("/progress/photos");
  return { ok: true };
}

export async function deletePhoto(id: string): Promise<void> {
  const { supabase, user } = await gate();
  const { data } = await supabase
    .from("progress_photos")
    .select("storage_path")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (data) {
    await supabase.from("progress_photos").delete().eq("id", id);
    await supabase.storage.from("progress-photos").remove([data.storage_path]);
  }
  revalidatePath("/progress/photos");
}

/** Removes every photo and withdraws consent. Immediate and permanent. */
export async function deleteAllPhotos(): Promise<void> {
  const { supabase, user } = await gate();
  const { data } = await supabase
    .from("progress_photos")
    .select("storage_path")
    .eq("user_id", user.id);
  const paths = ((data ?? []) as { storage_path: string }[]).map((p) => p.storage_path);
  if (paths.length) await supabase.storage.from("progress-photos").remove(paths);
  await supabase.from("progress_photos").delete().eq("user_id", user.id);
  await supabase
    .from("profiles")
    .update({ photo_consent_at: null })
    .eq("user_id", user.id);
  revalidatePath("/progress/photos");
  redirect("/progress/photos?deleted=1");
}
