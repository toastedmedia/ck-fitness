"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { validateComment, validatePost, validateReport } from "@ck/core";
import { getContext } from "@/lib/app";
import { notifyUser, track } from "@/lib/events";
import { flags } from "@/lib/flags";

async function gate() {
  if (!flags.community) redirect("/home");
  return getContext();
}
const back = (to: string, params: Record<string, string>) =>
  redirect(`${to}?${new URLSearchParams(params)}`);
const friendly = (message: string) =>
  /limit/i.test(message)
    ? "You have reached today's limit. Please try again tomorrow."
    : "That could not be posted. Please try again.";

export async function acceptGuidelines(): Promise<void> {
  const { supabase, user } = await gate();
  await supabase
    .from("profiles")
    .update({ community_accepted_at: new Date().toISOString() })
    .eq("user_id", user.id);
  await track(user.id, "community_guidelines_accepted");
  revalidatePath("/community");
  redirect("/community");
}

export async function createPost(formData: FormData): Promise<void> {
  const { supabase, user } = await gate();
  const v = validatePost({
    category: formData.get("category"),
    body: formData.get("body"),
  });
  if (!v.ok) return back("/community", { error: v.error });
  const { error } = await supabase
    .from("community_posts")
    .insert({ user_id: user.id, category: v.value.category, body: v.value.body });
  if (error) return back("/community", { error: friendly(error.message) });
  await track(user.id, "community_post_created", { category: v.value.category });
  revalidatePath("/community");
  redirect("/community?posted=1");
}

export async function createComment(postId: string, formData: FormData): Promise<void> {
  const { supabase, user } = await gate();
  const v = validateComment({ body: formData.get("body") });
  if (!v.ok) return back(`/community/${postId}`, { error: v.error });
  const { error } = await supabase
    .from("community_comments")
    .insert({ post_id: postId, user_id: user.id, body: v.value.body });
  if (error) return back(`/community/${postId}`, { error: friendly(error.message) });
  const { data: post } = await supabase
    .from("community_posts")
    .select("user_id")
    .eq("id", postId)
    .maybeSingle();
  if (post && post.user_id !== user.id)
    await notifyUser(post.user_id, {
      kind: "community",
      title: "Someone commented on your post",
      body: v.value.body.slice(0, 80),
      link: `/community/${postId}`,
    });
  await track(user.id, "community_comment_created");
  revalidatePath(`/community/${postId}`);
  redirect(`/community/${postId}`);
}

export async function toggleLike(postId: string, liked: boolean): Promise<void> {
  const { supabase, user } = await gate();
  if (liked)
    await supabase
      .from("community_likes")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", user.id);
  else
    await supabase.from("community_likes").insert({ post_id: postId, user_id: user.id });
  revalidatePath("/community");
  revalidatePath(`/community/${postId}`);
}

export async function reportContent(
  kind: "post" | "comment",
  id: string,
  postId: string,
  formData: FormData,
): Promise<void> {
  const { supabase, user } = await gate();
  const v = validateReport({
    reason: formData.get("reason"),
    note: formData.get("note"),
  });
  if (!v.ok) return back(`/community/${postId}`, { error: v.error });
  await supabase.from("community_reports").insert({
    reporter_id: user.id,
    [kind === "post" ? "post_id" : "comment_id"]: id,
    reason: v.value.reason,
    note: v.value.note,
  });
  await track(user.id, "community_reported", { kind, reason: v.value.reason });
  revalidatePath("/community");
  back(`/community/${postId}`, { reported: "1" });
}

export async function blockMember(userId: string): Promise<void> {
  const { supabase, user } = await gate();
  if (userId !== user.id)
    await supabase
      .from("community_blocks")
      .upsert(
        { blocker_id: user.id, blocked_id: userId },
        { onConflict: "blocker_id,blocked_id", ignoreDuplicates: true },
      );
  revalidatePath("/community");
  redirect("/community?blocked=1");
}

export async function unblockMember(userId: string): Promise<void> {
  const { supabase, user } = await gate();
  await supabase
    .from("community_blocks")
    .delete()
    .eq("blocker_id", user.id)
    .eq("blocked_id", userId);
  revalidatePath("/community");
  redirect("/community");
}

export async function deleteOwnPost(postId: string): Promise<void> {
  const { supabase, user } = await gate();
  await supabase.from("community_posts").delete().eq("id", postId).eq("user_id", user.id);
  revalidatePath("/community");
  redirect("/community");
}

export async function deleteOwnComment(commentId: string, postId: string): Promise<void> {
  const { supabase, user } = await gate();
  await supabase
    .from("community_comments")
    .delete()
    .eq("id", commentId)
    .eq("user_id", user.id);
  revalidatePath(`/community/${postId}`);
  redirect(`/community/${postId}`);
}
