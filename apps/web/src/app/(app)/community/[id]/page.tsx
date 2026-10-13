import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { COMMENT_MAX, canEdit, timeAgo } from "@ck/core";
import {
  Avatar,
  Byline,
  ImageGrid,
  ReactionBar,
  ReportForm,
} from "@/components/app/CommunityBits";
import { Button, Cap, Card, Flash } from "@/components/app/ui";
import { getContext } from "@/lib/app";
import { imageUrls } from "@/lib/community";
import { flags } from "@/lib/flags";
import {
  blockMember,
  createComment,
  deleteOwnComment,
  deleteOwnPost,
  editComment,
  editPost,
  reactToPost,
  reportContent,
} from "../actions";

export const metadata: Metadata = { title: "Community post" };

type Comment = {
  id: string;
  user_id: string;
  author_name: string;
  body: string;
  status: string;
  parent_id: string | null;
  edited_at: string | null;
  created_at: string;
};
const linkBtn =
  "inline-flex min-h-9 items-center text-xs font-bold text-muted underline underline-offset-4";

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
      "id,user_id,author_name,category,body,status,approval_status,pinned,is_staff,reaction_counts,edited_at,created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (
    !post ||
    ((post.status !== "visible" || post.approval_status !== "approved") &&
      post.user_id !== user.id)
  )
    notFound();
  const [{ data: comments }, { data: like }, images] = await Promise.all([
    supabase
      .from("community_comments")
      .select("id,user_id,author_name,body,status,parent_id,edited_at,created_at")
      .eq("post_id", id)
      .order("created_at"),
    supabase
      .from("community_likes")
      .select("reaction")
      .eq("post_id", id)
      .eq("user_id", user.id)
      .maybeSingle(),
    imageUrls(supabase, [id]),
  ]);
  const accepted = Boolean(profile?.community_accepted_at);
  const mine = post.user_id === user.id;
  const live = post.status === "visible" && post.approval_status === "approved";
  const all = ((comments ?? []) as Comment[]).filter(
    (c) => c.status === "visible" || c.user_id === user.id,
  );
  const top = all.filter((c) => !c.parent_id);
  const repliesOf = (cid: string) => all.filter((c) => c.parent_id === cid);

  const CommentView = ({ c, reply }: { c: Comment; reply?: boolean }) => (
    <Card className={`py-3 ${reply ? "ml-8" : ""}`}>
      <div className="flex items-start gap-2">
        <Avatar name={c.author_name} />
        <div className="min-w-0 flex-1">
          <p className="text-xs">
            <b className="text-brand">{c.author_name}</b>{" "}
            <span className="text-[10.5px] text-muted">
              {timeAgo(c.created_at)}
              {c.edited_at ? " · edited" : ""}
            </span>
          </p>
          {c.status !== "visible" ? (
            <p className="text-[11px] font-semibold text-muted">
              Hidden while reviewed. Only you can see it.
            </p>
          ) : null}
          <p className="mt-0.5 whitespace-pre-line text-[13px]">{c.body}</p>
          <div className="mt-1 flex flex-wrap items-start gap-3">
            {accepted && live && !reply ? (
              <details>
                <summary className={`${linkBtn} cursor-pointer list-none`}>Reply</summary>
                <form
                  action={createComment.bind(null, post.id)}
                  className="mt-2 flex flex-col gap-2"
                >
                  <input type="hidden" name="parent_id" value={c.id} />
                  <textarea
                    name="body"
                    rows={2}
                    maxLength={COMMENT_MAX}
                    required
                    aria-label={`Reply to ${c.author_name}`}
                    className="w-full rounded-2xl border-2 border-line bg-surface p-2 text-sm"
                  />
                  <Button variant="primary" className="min-h-10 self-end px-5">
                    Reply
                  </Button>
                </form>
              </details>
            ) : null}
            {c.user_id === user.id ? (
              <>
                {canEdit(c.created_at) && c.status === "visible" ? (
                  <details>
                    <summary className={`${linkBtn} cursor-pointer list-none`}>
                      Edit
                    </summary>
                    <form
                      action={editComment.bind(null, c.id, post.id)}
                      className="mt-2 flex flex-col gap-2"
                    >
                      <textarea
                        name="body"
                        defaultValue={c.body}
                        rows={2}
                        maxLength={COMMENT_MAX}
                        required
                        aria-label="Edit your comment"
                        className="w-full rounded-2xl border-2 border-line bg-surface p-2 text-sm"
                      />
                      <Button variant="primary" className="min-h-10 self-end px-5">
                        Save
                      </Button>
                    </form>
                  </details>
                ) : null}
                <form action={deleteOwnComment.bind(null, c.id, post.id)}>
                  <button className="min-h-9 text-xs font-bold text-danger underline underline-offset-4">
                    Delete
                  </button>
                </form>
              </>
            ) : (
              <ReportForm action={reportContent.bind(null, "comment", c.id, post.id)} />
            )}
          </div>
        </div>
      </div>
    </Card>
  );

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
          staff={post.is_staff}
          edited={Boolean(post.edited_at)}
        />
        {!live ? (
          <p className="mt-2 rounded-xl bg-page p-2 text-[11px] font-semibold text-muted">
            {post.approval_status === "pending"
              ? "Waiting for our team to check your photos. Only you can see this for now."
              : "Hidden while our team reviews it. Only you can see it."}
          </p>
        ) : null}
        <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed">
          {post.body}
        </p>
        <ImageGrid urls={images.get(post.id) ?? []} />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <ReactionBar
            counts={post.reaction_counts}
            mine={like?.reaction ?? null}
            canReact={accepted && live}
            action={reactToPost.bind(null, post.id)}
          />
          {mine && canEdit(post.created_at) && post.status === "visible" ? (
            <details>
              <summary className={`${linkBtn} cursor-pointer list-none`}>Edit</summary>
              <form
                action={editPost.bind(null, post.id)}
                className="mt-2 flex w-full min-w-64 flex-col gap-2"
              >
                <textarea
                  name="body"
                  defaultValue={post.body}
                  rows={3}
                  maxLength={1000}
                  required
                  aria-label="Edit your post"
                  className="w-full rounded-2xl border-2 border-line bg-surface p-2 text-sm"
                />
                <Button variant="primary" className="min-h-10 self-end px-5">
                  Save
                </Button>
              </form>
            </details>
          ) : null}
          {mine ? (
            <form action={deleteOwnPost.bind(null, post.id)}>
              <button className="min-h-10 px-2 text-xs font-bold text-danger underline underline-offset-4">
                Delete my post
              </button>
            </form>
          ) : null}
        </div>
        {!mine ? (
          <div className="mt-1 flex flex-wrap items-start gap-4">
            <ReportForm action={reportContent.bind(null, "post", post.id, post.id)} />
            <form action={blockMember.bind(null, post.user_id)}>
              <button className={linkBtn}>Block this member</button>
            </form>
          </div>
        ) : null}
      </Card>

      <Cap>
        {all.length} comment{all.length === 1 ? "" : "s"}
      </Cap>
      <ul className="flex flex-col gap-2">
        {top.map((c) => (
          <li key={c.id} className="flex flex-col gap-2">
            <CommentView c={c} />
            {repliesOf(c.id).map((r) => (
              <CommentView key={r.id} c={r} reply />
            ))}
          </li>
        ))}
      </ul>

      {accepted && live ? (
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
