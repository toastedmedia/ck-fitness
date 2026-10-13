import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Short-lived links to the photos on a set of posts, grouped by post and in the author's order. */
export async function imageUrls(
  supabase: SupabaseClient,
  postIds: string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (postIds.length === 0) return out;
  const { data } = await supabase
    .from("community_post_images")
    .select("post_id,storage_path,position")
    .in("post_id", postIds)
    .order("position");
  const rows = (data ?? []) as { post_id: string; storage_path: string }[];
  if (rows.length === 0) return out;
  const { data: signed } = await supabase.storage
    .from("community-media")
    .createSignedUrls(
      rows.map((r) => r.storage_path),
      3600,
    );
  const url = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  for (const r of rows) {
    const u = url.get(r.storage_path);
    if (u) out.set(r.post_id, [...(out.get(r.post_id) ?? []), u]);
  }
  return out;
}

export async function photoApprovalOn(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "community_photo_approval")
    .maybeSingle();
  return String(data?.value ?? "on").replace(/^"|"$/g, "") === "on";
}
