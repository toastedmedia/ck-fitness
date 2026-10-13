import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CATEGORIES } from "@ck/core";
import { Byline } from "@/components/app/CommunityBits";
import { Button, Cap, Card, Flash } from "@/components/app/ui";
import { getContext } from "@/lib/app";
import { flags } from "@/lib/flags";
import { acceptGuidelines, createPost, toggleLike, unblockMember } from "./actions";

export const metadata: Metadata = { title: "Community" };

const PAGE = 20;

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    posted?: string;
    blocked?: string;
    page?: string;
  }>;
}) {
  if (!flags.community) notFound();
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page) || 0);
  const { supabase, user, profile } = await getContext();
  const accepted = Boolean(profile?.community_accepted_at);

  const [{ data: posts, error }, { data: blocks }] = await Promise.all([
    supabase
      .from("community_posts")
      .select(
        "id,user_id,author_name,category,body,status,pinned,like_count,comment_count,created_at",
      )
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE),
    supabase
      .from("community_blocks")
      .select("blocked_id,blocked_name")
      .eq("blocker_id", user.id),
  ]);
  type Post = {
    id: string;
    user_id: string;
    author_name: string;
    category: string;
    body: string;
    status: string;
    pinned: boolean;
    like_count: number;
    comment_count: number;
    created_at: string;
  };
  // Hidden or removed posts show only to their author, with a note.
  const all = ((posts ?? []) as Post[]).filter(
    (p) => p.status === "visible" || p.user_id === user.id,
  );
  const more = all.length > PAGE;
  const list = all.slice(0, PAGE);
  const ids = list.map((p) => p.id);
  const { data: likes } = ids.length
    ? await supabase
        .from("community_likes")
        .select("post_id")
        .eq("user_id", user.id)
        .in("post_id", ids)
    : { data: [] };
  const liked = new Set(((likes ?? []) as { post_id: string }[]).map((l) => l.post_id));
  const blocked = (blocks ?? []) as { blocked_id: string; blocked_name: string }[];

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-[19px] text-brand">Community</h1>
        <Link
          href="/community/guidelines"
          className="text-xs font-bold text-brand underline underline-offset-4"
        >
          Guidelines
        </Link>
      </div>
      <p className="text-xs text-muted">
        A supportive place to share wins, ask questions and cheer each other on.
      </p>
      {sp.error ? <Flash tone="error">{sp.error}</Flash> : null}
      {sp.posted ? <Flash>Posted. Thank you for sharing.</Flash> : null}
      {sp.blocked ? (
        <Flash>Member blocked. You will not see each other&apos;s posts.</Flash>
      ) : null}
      {error ? (
        <Flash tone="error">The community is not available to you right now.</Flash>
      ) : null}

      {!accepted ? (
        <Card>
          <Cap>Before you post</Cap>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-xs">
            <li>Be kind. No bullying, shaming or body comments.</li>
            <li>Share your own journey. Do not give medical advice.</li>
            <li>Keep private details private, yours and other people&apos;s.</li>
            <li>No links, selling or spam.</li>
          </ul>
          <form action={acceptGuidelines} className="mt-3">
            <Button variant="primary" className="min-h-12 w-full">
              I agree to the community guidelines
            </Button>
          </form>
          <p className="mt-2 text-[10.5px] text-muted">
            You can read posts now. You need to agree to post, comment or like.
          </p>
        </Card>
      ) : (
        <Card>
          <form action={createPost} className="flex flex-col gap-2">
            <div
              className="flex flex-wrap gap-2"
              role="radiogroup"
              aria-label="Post type"
            >
              {CATEGORIES.map(([v, l], i) => (
                <label key={v} className="relative">
                  <input
                    type="radio"
                    name="category"
                    value={v}
                    defaultChecked={i === 0}
                    className="peer sr-only"
                  />
                  <span className="inline-flex min-h-9 cursor-pointer items-center rounded-chip border-2 border-line bg-surface px-3 text-xs font-bold peer-checked:border-brand peer-checked:bg-brand peer-checked:text-on-brand peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-accent">
                    {l}
                  </span>
                </label>
              ))}
            </div>
            <textarea
              name="body"
              rows={3}
              maxLength={1000}
              required
              aria-label="Your post"
              placeholder="Share a win, ask a question or offer a tip..."
              className="w-full rounded-2xl border-2 border-line bg-surface p-3 text-sm"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] text-muted">
                No links or medical advice. Be kind.
              </span>
              <Button variant="primary" className="min-h-11 px-6">
                Post
              </Button>
            </div>
          </form>
        </Card>
      )}

      {list.length === 0 ? (
        <Card>
          <p className="text-xs text-muted">
            No posts yet. Be the first to share something.
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((p) => (
            <li key={p.id}>
              <Card
                className={
                  p.pinned || p.category === "announcement"
                    ? "border-[#ecdca4] bg-[#fbf5e1]"
                    : ""
                }
              >
                <Byline
                  name={p.author_name}
                  at={p.created_at}
                  category={p.category}
                  pinned={p.pinned}
                />
                {p.status !== "visible" ? (
                  <p className="mt-2 rounded-xl bg-page p-2 text-[11px] font-semibold text-muted">
                    This post is hidden while our team reviews it. Only you can see it.
                  </p>
                ) : null}
                <Link
                  href={`/community/${p.id}`}
                  className="mt-2 block whitespace-pre-line text-[13px] leading-relaxed"
                >
                  {p.body}
                </Link>
                <div className="mt-2 flex items-center gap-1 text-xs">
                  {accepted && p.status === "visible" ? (
                    <form action={toggleLike.bind(null, p.id, liked.has(p.id))}>
                      <button
                        aria-pressed={liked.has(p.id)}
                        aria-label={
                          liked.has(p.id) ? "Remove your like" : "Like this post"
                        }
                        className={`inline-flex min-h-10 items-center gap-1 rounded-full px-3 font-bold ${liked.has(p.id) ? "bg-[#f6efd6] text-[#6f5712]" : "text-muted"}`}
                      >
                        <span aria-hidden="true">{liked.has(p.id) ? "♥" : "♡"}</span>
                        {p.like_count}
                      </button>
                    </form>
                  ) : (
                    <span className="inline-flex min-h-10 items-center gap-1 px-3 text-muted">
                      <span aria-hidden="true">♡</span>
                      {p.like_count}
                    </span>
                  )}
                  <Link
                    href={`/community/${p.id}`}
                    className="inline-flex min-h-10 items-center rounded-full px-3 font-bold text-muted"
                  >
                    {p.comment_count} comment{p.comment_count === 1 ? "" : "s"}
                  </Link>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {more ? (
        <Link
          href={`/community?page=${page + 1}`}
          className="inline-flex min-h-11 items-center justify-center rounded-button border-2 border-line text-xs font-bold text-brand"
        >
          Older posts
        </Link>
      ) : null}
      {page > 0 ? (
        <Link
          href={`/community?page=${page - 1}`}
          className="text-center text-xs font-bold text-brand underline underline-offset-4"
        >
          Newer posts
        </Link>
      ) : null}

      {blocked.length ? (
        <Card>
          <Cap>Blocked members</Cap>
          <ul className="mt-1 flex flex-col divide-y divide-line">
            {blocked.map((b) => (
              <li
                key={b.blocked_id}
                className="flex items-center justify-between py-1 text-xs"
              >
                <span>{b.blocked_name}</span>
                <form action={unblockMember.bind(null, b.blocked_id)}>
                  <button className="min-h-9 font-bold text-brand underline underline-offset-4">
                    Unblock
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
