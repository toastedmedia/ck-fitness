import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { COMMENT_MAX } from "@ck/core";
import { Byline, Avatar, ReportForm } from "@/components/app/CommunityBits";
import { Button, Cap, Card, Flash } from "@/components/app/ui";
import { getContext } from "@/lib/app";
import { flags } from "@/lib/flags";
import { timeAgo } from "@ck/core";
import {
  blockMember,
  createComment,
  deleteOwnComment,
  deleteOwnPost,
  reportContent,
  toggleLike,
} from "../actions";

export const metadata: Metadata = { title: "Community post" };

export default async function PostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; reported?: string }>;
}) {
  if (!flags.community) notFound();
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, user, profile } = await getContext();
  const { data: post } = await supabase
    .from("community_posts")
    .select(
      "id,user_id,author_name,category,body,status,pinned,like_count,comment_count,created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!post || (post.status !== "visible" && post.user_id !== user.id)) notFound();
  const [{ data: comments }, { data: like }] = await Promise.all([
    supabase
      .from("community_comments")
      .select("id,user_id,author_name,body,status,created_at")
      .eq("post_id", id)
      .order("created_at"),
    supabase
      .from("community_likes")
      .select("post_id")
      .eq("post_id", id)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  const accepted = Boolean(profile?.community_accepted_at);
  const mine = post.user_id === user.id;
  const list = (
    (comments ?? []) as {
      id: string;
      user_id: string;
      author_name: string;
      body: string;
      status: string;
      created_at: string;
    }[]
  ).filter((c) => c.status === "visible" || c.user_id === user.id);

  return (
    <>
      <Link
        href="/community"
        className="inline-flex min-h-10 items-center text-xs font-bold text-brand"
      >
        ← Community
      </Link>
      {sp.error ? <Flash tone="error">{sp.error}</Flash> : null}
      {sp.reported ? (
        <Flash>
          Thank you. We will look at this. You can also block this member below.
        </Flash>
      ) : null}
      <Card>
        <Byline
          name={post.author_name}
          at={post.created_at}
          category={post.category}
          pinned={post.pinned}
        />
        {post.status !== "visible" ? (
          <p className="mt-2 rounded-xl bg-page p-2 text-[11px] font-semibold text-muted">
            Hidden while our team reviews it. Only you can see it.
          </p>
        ) : null}
        <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed">
          {post.body}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {accepted && post.status === "visible" ? (
            <form action={toggleLike.bind(null, post.id, Boolean(like))}>
              <button
                aria-pressed={Boolean(like)}
                className={`inline-flex min-h-10 items-center gap-1 rounded-full px-3 text-xs font-bold ${like ? "bg-[#f6efd6] text-[#6f5712]" : "text-muted"}`}
              >
                <span aria-hidden="true">{like ? "♥" : "♡"}</span>
                {post.like_count}
              </button>
            </form>
          ) : null}
          {mine ? (
            <form action={deleteOwnPost.bind(null, post.id)}>
              <button className="min-h-10 px-3 text-xs font-bold text-danger underline underline-offset-4">
                Delete my post
              </button>
            </form>
          ) : null}
        </div>
        {!mine ? (
          <div className="mt-1 flex flex-wrap items-start gap-4">
            <ReportForm action={reportContent.bind(null, "post", post.id, post.id)} />
            <form action={blockMember.bind(null, post.user_id)}>
              <button className="inline-flex min-h-9 items-center text-xs font-bold text-muted underline underline-offset-4">
                Block this member
              </button>
            </form>
          </div>
        ) : null}
      </Card>

      <Cap>
        {list.length} comment{list.length === 1 ? "" : "s"}
      </Cap>
      <ul className="flex flex-col gap-2">
        {list.map((c) => (
          <li key={c.id}>
            <Card className="py-3">
              <div className="flex items-start gap-2">
                <Avatar name={c.author_name} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs">
                    <b className="text-brand">{c.author_name}</b>{" "}
                    <span className="text-[10.5px] text-muted">
                      {timeAgo(c.created_at)}
                    </span>
                  </p>
                  {c.status !== "visible" ? (
                    <p className="text-[11px] font-semibold text-muted">
                      Hidden while reviewed. Only you can see it.
                    </p>
                  ) : null}
                  <p className="mt-0.5 whitespace-pre-line text-[13px]">{c.body}</p>
                  <div className="mt-1 flex flex-wrap items-start gap-3">
                    {c.user_id === user.id ? (
                      <form action={deleteOwnComment.bind(null, c.id, post.id)}>
                        <button className="min-h-9 text-xs font-bold text-danger underline underline-offset-4">
                          Delete
                        </button>
                      </form>
                    ) : (
                      <ReportForm
                        action={reportContent.bind(null, "comment", c.id, post.id)}
                      />
                    )}
                  </div>
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ul>

      {accepted && post.status === "visible" ? (
        <Card>
          <form
            action={createComment.bind(null, post.id)}
            className="flex flex-col gap-2"
          >
            <textarea
              name="body"
              rows={2}
              maxLength={COMMENT_MAX}
              required
              aria-label="Your comment"
              placeholder="Write a kind comment..."
              className="w-full rounded-2xl border-2 border-line bg-surface p-3 text-sm"
            />
            <Button variant="primary" className="min-h-11 self-end px-6">
              Comment
            </Button>
          </form>
        </Card>
      ) : !accepted ? (
        <p className="text-xs text-muted">
          Agree to the{" "}
          <Link href="/community" className="font-bold text-brand underline">
            community guidelines
          </Link>{" "}
          to comment.
        </p>
      ) : null}
    </>
  );
}
