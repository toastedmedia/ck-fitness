"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  MAX_IMAGES,
  isReaction,
  ownsPath,
  reactionMilestone,
  validateComment,
  validatePost,
  validateReport,
} from "@ck/core";
import { getContext } from "@/lib/app";
import { notifyUser, track } from "@/lib/events";
import { flags } from "@/lib/flags";
import { createAdminSupabase } from "@/lib/supabase/admin";

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

/** Notify someone about community activity, unless they turned community notifications off. */
async function notifyCommunity(
  userId: string,
  n: { title: string; body?: string; link: string },
) {
  const { data } = await createAdminSupabase()
    .from("notification_preferences")
    .select("community")
    .eq("user_id", userId)
    .maybeSingle();
  if (data?.community === false) return;
  await notifyUser(userId, { kind: "community", ...n });
}

export async function acceptGuidelines(): Promise<void> {
  const { supabase, user } = await gate();
  await supabase
    .from("profiles")
    .update({ community_accepted_at: new Date().toISOString() })
    .eq("user_id", user.id);
  await supabase
    .from("community_profiles")
    .upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true });
  await track(user.id, "community_guidelines_accepted");
  revalidatePath("/community");
  redirect("/community");
}

/** Creates a post. Photos were already uploaded straight to private storage; here we attach them. */
export async function createPost(formData: FormData): Promise<void> {
  const { supabase, user } = await gate();
  const v = validatePost({
    category: formData.get("category"),
    body: formData.get("body"),
  });
  if (!v.ok) return back("/community", { error: v.error });
  let paths: string[] = [];
  try {
    paths = JSON.parse(String(formData.get("images") ?? "[]"));
  } catch {
    paths = [];
  }
  paths = (Array.isArray(paths) ? paths : [])
    .filter((p) => typeof p === "string" && ownsPath(user.id, p))
    .slice(0, MAX_IMAGES);

  const { data: post, error } = await supabase
    .from("community_posts")
    .insert({
      user_id: user.id,
      category: v.value.category,
      body: v.value.body,
      has_images: paths.length > 0,
    })
    .select("id,approval_status")
    .single();
  if (error || !post) {
    if (paths.length) await supabase.storage.from("community-media").remove(paths);
    return back("/community", { error: friendly(error?.message ?? "") });
  }
  if (paths.length) {
    const { error: imgError } = await supabase.from("community_post_images").insert(
      paths.map((storage_path, position) => ({
        post_id: post.id,
        user_id: user.id,
        storage_path,
        position,
      })),
    );
    if (imgError) {
      await supabase.from("community_posts").delete().eq("id", post.id);
      await supabase.storage.from("community-media").remove(paths);
      return back("/community", {
        error: "Your photos could not be attached. Please try again.",
      });
    }
  }
  const { data: after } = await supabase
    .from("community_posts")
    .select("approval_status")
    .eq("id", post.id)
    .maybeSingle();
  await track(user.id, "community_post_created", {
    category: v.value.category,
    photos: paths.length,
  });
  revalidatePath("/community");
  redirect(
    `/community?${after?.approval_status === "pending" ? "pending=1" : "posted=1"}`,
  );
}

export async function editPost(postId: string, formData: FormData): Promise<void> {
  const { supabase } = await gate();
  const v = validateComment({ body: formData.get("body") });
  if (!v.ok) return back(`/community/${postId}`, { error: v.error });
  await supabase.from("community_posts").update({ body: v.value.body }).eq("id", postId);
  revalidatePath(`/community/${postId}`);
  redirect(`/community/${postId}`);
}

export async function createComment(postId: string, formData: FormData): Promise<void> {
  const { supabase, user } = await gate();
  const v = validateComment({ body: formData.get("body") });
  if (!v.ok) return back(`/community/${postId}`, { error: v.error });
  const parentId = String(formData.get("parent_id") ?? "") || null;
  const { error } = await supabase.from("community_comments").insert({
    post_id: postId,
    user_id: user.id,
    body: v.value.body,
    parent_id: parentId,
  });
  if (error) return back(`/community/${postId}`, { error: friendly(error.message) });

  const { data: post } = await supabase
    .from("community_posts")
    .select("user_id")
    .eq("id", postId)
    .maybeSingle();
  if (post && post.user_id !== user.id)
    await notifyCommunity(post.user_id, {
      title: "Someone commented on your post",
      body: v.value.body.slice(0, 80),
      link: `/community/${postId}`,
    });
  if (parentId) {
    const { data: parent } = await supabase
      .from("community_comments")
      .select("user_id")
      .eq("id", parentId)
      .maybeSingle();
    if (parent && parent.user_id !== user.id && parent.user_id !== post?.user_id)
      await notifyCommunity(parent.user_id, {
        title: "Someone replied to your comment",
        body: v.value.body.slice(0, 80),
        link: `/community/${postId}`,
      });
  }
  await track(user.id, "community_comment_created");
  revalidatePath(`/community/${postId}`);
  redirect(`/community/${postId}`);
}

export async function editComment(
  commentId: string,
  postId: string,
  formData: FormData,
): Promise<void> {
  const { supabase } = await gate();
  const v = validateComment({ body: formData.get("body") });
  if (!v.ok) return back(`/community/${postId}`, { error: v.error });
  await supabase
    .from("community_comments")
    .update({ body: v.value.body })
    .eq("id", commentId);
  revalidatePath(`/community/${postId}`);
  redirect(`/community/${postId}`);
}

/** Pick a reaction, change it, or tap the same one again to take it back. */
export async function reactToPost(
  postId: string,
  reaction: string,
  current: string | null,
): Promise<void> {
  const { supabase, user } = await gate();
  if (!isReaction(reaction)) return;
  if (current === reaction) {
    await supabase
      .from("community_likes")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", user.id);
  } else {
    await supabase
      .from("community_likes")
      .upsert(
        { post_id: postId, user_id: user.id, reaction },
        { onConflict: "post_id,user_id" },
      );
    const { data: post } = await supabase
      .from("community_posts")
      .select("user_id,like_count")
      .eq("id", postId)
      .maybeSingle();
    if (
      post &&
      post.user_id !== user.id &&
      !current &&
      reactionMilestone(post.like_count)
    ) {
      await notifyCommunity(post.user_id, {
        title:
          post.like_count === 1
            ? "Someone reacted to your post"
            : `${post.like_count} people reacted to your post`,
        link: `/community/${postId}`,
      });
    }
  }
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
  const { data: imgs } = await supabase
    .from("community_post_images")
    .select("storage_path")
    .eq("post_id", postId)
    .eq("user_id", user.id);
  await supabase.from("community_posts").delete().eq("id", postId).eq("user_id", user.id);
  const paths = ((imgs ?? []) as { storage_path: string }[]).map((i) => i.storage_path);
  if (paths.length) await supabase.storage.from("community-media").remove(paths);
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

/** Her small public card: a short bio, and whether she appears in the member list. */
export async function saveCommunityProfile(formData: FormData): Promise<void> {
  const { supabase, user } = await gate();
  const bio = String(formData.get("bio") ?? "")
    .trim()
    .slice(0, 160);
  await supabase.from("community_profiles").upsert(
    {
      user_id: user.id,
      bio: bio || null,
      show_in_directory: formData.get("show") === "on",
    },
    { onConflict: "user_id" },
  );
  revalidatePath("/community/members");
  redirect("/community/members?saved=1");
}
