import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { POST_FILTERS } from "@ck/core";
import { ImageGrid, Byline, ReactionBar } from "@/components/app/CommunityBits";
import { PostComposer } from "@/components/app/PostComposer";
import { Button, Cap, Card, Flash } from "@/components/app/ui";
import { getContext } from "@/lib/app";
import { imageUrls, photoApprovalOn } from "@/lib/community";
import { flags } from "@/lib/flags";
import { acceptGuidelines, reactToPost, unblockMember } from "./actions";

export const metadata: Metadata = { title: "Community" };

const PAGE = 20;
const chip = (on: boolean) =>
  `inline-flex min-h-9 shrink-0 items-center rounded-chip border-2 px-3 text-xs font-semibold ${on ? "border-brand bg-brand text-on-brand" : "border-line bg-surface"}`;

type Post = {
  id: string;
  user_id: string;
  author_name: string;
  category: string;
  body: string;
  status: string;
  approval_status: string;
  pinned: boolean;
  is_staff: boolean;
  like_count: number;
  comment_count: number;
  reaction_counts: Record<string, number> | null;
  edited_at: string | null;
  created_at: string;
};

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    posted?: string;
    pending?: string;
    blocked?: string;
    page?: string;
    type?: string;
    sort?: string;
    q?: string;
  }>;
}) {
  if (!flags.community) notFound();
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page) || 0);
  const type = POST_FILTERS.some(([k]) => k === sp.type) ? sp.type! : "all";
  const sort = sp.sort === "top" ? "top" : "new";
  const q = (sp.q ?? "")
    .trim()
    .slice(0, 60)
    .replace(/[%,()]/g, "");
  const { supabase, user, profile } = await getContext();
  const accepted = Boolean(profile?.community_accepted_at);

  let query = supabase
    .from("community_posts")
    .select(
      "id,user_id,author_name,category,body,status,approval_status,pinned,is_staff,like_count,comment_count,reaction_counts,edited_at,created_at",
    )
    .order("pinned", { ascending: false });
  query =
    sort === "top"
      ? query
          .order("like_count", { ascending: false })
          .order("created_at", { ascending: false })
      : query.order("created_at", { ascending: false });
  if (type !== "all") query = query.eq("category", type);
  if (q) query = query.ilike("body", `%${q}%`);
  const [{ data: posts, error }, { data: blocks }, approvalOn] = await Promise.all([
    query.range(page * PAGE, page * PAGE + PAGE),
    supabase
      .from("community_blocks")
      .select("blocked_id,blocked_name")
      .eq("blocker_id", user.id),
    photoApprovalOn(supabase),
  ]);
  // Held, hidden or removed posts show only to their author, with a note.
  const all = ((posts ?? []) as Post[]).filter(
    (p) =>
      (p.status === "visible" && p.approval_status === "approved") ||
      p.user_id === user.id,
  );
  const more = all.length > PAGE;
  const list = all.slice(0, PAGE);
  const ids = list.map((p) => p.id);
  const [images, { data: mineRows }] = await Promise.all([
    imageUrls(supabase, ids),
    ids.length
      ? supabase
          .from("community_likes")
          .select("post_id,reaction")
          .eq("user_id", user.id)
          .in("post_id", ids)
      : Promise.resolve({ data: [] }),
  ]);
  const mine = new Map(
    ((mineRows ?? []) as { post_id: string; reaction: string }[]).map((r) => [
      r.post_id,
      r.reaction,
    ]),
  );
  const blocked = (blocks ?? []) as { blocked_id: string; blocked_name: string }[];
  const href = (extra: Record<string, string>) =>
    `/community?${new URLSearchParams({ ...(type !== "all" ? { type } : {}), ...(sort === "top" ? { sort } : {}), ...(q ? { q } : {}), ...extra })}`;

  return (
    <>
      <div className="flex items-center">
        <h1 className="sr-only">Community</h1>
        <nav aria-label="Community sections" className="flex gap-3 text-xs font-bold">
          <span aria-current="page" className="text-brand underline underline-offset-4">
            Feed
          </span>
          <Link href="/community/members" className="text-muted">
            Members
          </Link>
          <Link href="/community/guidelines" className="text-muted">
            Guidelines
          </Link>
        </nav>
      </div>
      {sp.error ? <Flash tone="error">{sp.error}</Flash> : null}
      {sp.posted ? <Flash>Posted. Thank you for sharing.</Flash> : null}
      {sp.pending ? (
        <Flash>
          Thanks! Your post has photos, so our team will check it first. It will appear
          once approved.
        </Flash>
      ) : null}
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
            You can read posts now. You need to agree to post, comment or react.
          </p>
        </Card>
      ) : (
        <Card>
          <PostComposer userId={user.id} approvalOn={approvalOn} />
        </Card>
      )}

      <form method="get" role="search" className="flex gap-2">
        {type !== "all" ? <input type="hidden" name="type" value={type} /> : null}
        {sort === "top" ? <input type="hidden" name="sort" value="top" /> : null}
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search posts"
          aria-label="Search posts"
          className="min-h-11 flex-1 rounded-2xl border-2 border-line bg-surface px-3 text-sm"
        />
        <button className="min-h-11 rounded-button bg-brand px-4 text-xs font-bold text-on-brand">
          Search
        </button>
      </form>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {POST_FILTERS.map(([k, l]) => (
          <Link
            key={k}
            href={href({ type: k === "all" ? "" : k, page: "" })}
            aria-current={type === k ? "page" : undefined}
            className={chip(type === k)}
          >
            {l}
          </Link>
        ))}
        <span className="mx-1 w-px shrink-0 bg-line" aria-hidden="true" />
        <Link href={href({ sort: "", page: "" })} className={chip(sort === "new")}>
          Newest
        </Link>
        <Link href={href({ sort: "top", page: "" })} className={chip(sort === "top")}>
          Top
        </Link>
      </div>

      {list.length === 0 ? (
        <Card>
          <p className="text-xs text-muted">
            {q || type !== "all"
              ? "No posts match. Try a different search."
              : "No posts yet. Be the first to share something."}
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
                  staff={p.is_staff}
                  edited={Boolean(p.edited_at)}
                />
                {p.approval_status === "pending" ? (
                  <p className="mt-2 rounded-xl bg-page p-2 text-[11px] font-semibold text-muted">
                    Waiting for our team to check your photos. Only you can see this for
                    now.
                  </p>
                ) : p.status !== "visible" ? (
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
                <ImageGrid urls={images.get(p.id) ?? []} />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-1">
                  <ReactionBar
                    counts={p.reaction_counts}
                    mine={mine.get(p.id) ?? null}
                    canReact={
                      accepted &&
                      p.status === "visible" &&
                      p.approval_status === "approved"
                    }
                    action={reactToPost.bind(null, p.id)}
                  />
                  <Link
                    href={`/community/${p.id}`}
                    className="inline-flex min-h-10 items-center rounded-full px-3 text-xs font-bold text-muted"
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
          href={href({ page: String(page + 1) })}
          className="inline-flex min-h-11 items-center justify-center rounded-button border-2 border-line text-xs font-bold text-brand"
        >
          Older posts
        </Link>
      ) : null}
      {page > 0 ? (
        <Link
          href={href({ page: String(page - 1) })}
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
