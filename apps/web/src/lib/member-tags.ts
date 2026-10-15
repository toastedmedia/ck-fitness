import "server-only";
import { normalizeTagName } from "@ck/core";
import type { createAdminSupabase } from "@/lib/supabase/admin";

type Db = ReturnType<typeof createAdminSupabase>;

/** Finds a tag by name (any capitals) or creates it. Returns its id, or null if the name is empty. */
export async function ensureTag(
  db: Db,
  rawName: string,
  createdBy: string,
): Promise<string | null> {
  const name = normalizeTagName(rawName);
  if (!name) return null;
  const { data: found } = await db
    .from("member_tags")
    .select("id")
    .ilike("name", name)
    .maybeSingle();
  if (found) return found.id as string;
  const { data, error } = await db
    .from("member_tags")
    .insert({ name, created_by: createdBy })
    .select("id")
    .single();
  if (!error && data) return data.id as string;
  // Someone created it a moment ago: read it again.
  const { data: again } = await db
    .from("member_tags")
    .select("id")
    .ilike("name", name)
    .maybeSingle();
  return (again?.id as string | undefined) ?? null;
}

export async function addTag(db: Db, tagId: string, userIds: string[]) {
  for (let i = 0; i < userIds.length; i += 500)
    await db.from("member_tag_map").upsert(
      userIds.slice(i, i + 500).map((user_id) => ({ user_id, tag_id: tagId })),
      { onConflict: "user_id,tag_id", ignoreDuplicates: true },
    );
}

export async function removeTag(db: Db, tagId: string, userIds: string[]) {
  for (let i = 0; i < userIds.length; i += 200)
    await db
      .from("member_tag_map")
      .delete()
      .eq("tag_id", tagId)
      .in("user_id", userIds.slice(i, i + 200));
}
