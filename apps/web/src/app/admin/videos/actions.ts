"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { CONTENT, audit, requireStaff } from "@/lib/admin";
import { setRendition, startRenditionJob } from "@/lib/hls";

/** Starts the conversion job: one video (Try again) or every video that is not ready yet. */
export async function prepareVideos(formData: FormData): Promise<void> {
  const { supabase, user, db } = await requireStaff(CONTENT);
  const key = String(formData.get("video_key") ?? "");
  const one = /^lessons\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/.test(key) ? key : null;
  if (!(await startRenditionJob(one ?? undefined))) redirect("/admin/videos?error=start");
  if (one) await setRendition(db, one, "queued");
  await audit(supabase, user.id, "video.stream_start", one ?? "all");
  revalidatePath("/admin/videos");
  redirect(`/admin/videos?started=${one ? "one" : "all"}`);
}
