import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { timeAgo } from "@ck/core";
import { Avatar } from "@/components/app/CommunityBits";
import { Cap, Card } from "@/components/app/ui";
import { getContext } from "@/lib/app";
import { flags } from "@/lib/flags";
import { blockMember } from "../../actions";

export const metadata: Metadata = { title: "Community member" };

export default async function MemberCard({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!flags.community) notFound();
  const { id } = await params;
  const { supabase, user } = await getContext();
  const { data: m } = await supabase
    .from("community_profiles")
    .select("user_id,display_name,bio,created_at")
    .eq("user_id", id)
    .maybeSingle();
  if (!m) notFound();
  const { data: posts } = await supabase
    .from("community_posts")
    .select("id,category,body,created_at,like_count,comment_count")
    .eq("user_id", id)
    .eq("status", "visible")
    .eq("approval_status", "approved")
    .order("created_at", { ascending: false })
    .limit(10);
  const list = (posts ?? []) as {
    id: string;
    category: string;
    body: string;
    created_at: string;
    like_count: number;
    comment_count: number;
  }[];

  return (
    <>
      <Link
        href="/community/members"
        className="inline-flex min-h-10 items-center text-xs font-bold text-brand"
      >
        ← Members
      </Link>
      <Card>
        <div className="flex items-center gap-3">
          <Avatar name={m.display_name} />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[17px] text-brand">{m.display_name}</h1>
            <p className="text-[11px] text-muted">
              In the community since{" "}
              {new Date(m.created_at).toLocaleDateString("en-CA", {
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
        </div>
        {m.bio ? <p className="mt-2 text-[13px]">{m.bio}</p> : null}
        {id !== user.id ? (
          <form action={blockMember.bind(null, id)} className="mt-2">
            <button className="inline-flex min-h-9 items-center text-xs font-bold text-muted underline underline-offset-4">
              Block this member
            </button>
          </form>
        ) : null}
      </Card>
      <Cap>Recent posts</Cap>
      {list.length === 0 ? (
        <Card>
          <p className="text-xs text-muted">No posts yet.</p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((p) => (
            <li key={p.id}>
              <Link
                href={`/community/${p.id}`}
                className="block rounded-card border border-line bg-surface p-3"
              >
                <p className="line-clamp-3 whitespace-pre-line text-[13px]">{p.body}</p>
                <p className="mt-1 text-[10.5px] text-muted">
                  {timeAgo(p.created_at)} · {p.like_count} reactions · {p.comment_count}{" "}
                  comments
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
