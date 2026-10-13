import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/app/CommunityBits";
import { Button, Cap, Card, Flash } from "@/components/app/ui";
import { getContext } from "@/lib/app";
import { flags } from "@/lib/flags";
import { saveCommunityProfile } from "../actions";

export const metadata: Metadata = { title: "Community members" };

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; saved?: string }>;
}) {
  if (!flags.community) notFound();
  const sp = await searchParams;
  const q = (sp.q ?? "")
    .trim()
    .slice(0, 40)
    .replace(/[%,()]/g, "");
  const { supabase, user, profile } = await getContext();
  let query = supabase
    .from("community_profiles")
    .select("user_id,display_name,bio,show_in_directory,created_at")
    .order("display_name")
    .limit(100);
  if (q) query = query.ilike("display_name", `%${q}%`);
  const [{ data }, { data: mine }] = await Promise.all([
    query,
    supabase
      .from("community_profiles")
      .select("bio,show_in_directory")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  const members = (
    (data ?? []) as {
      user_id: string;
      display_name: string;
      bio: string | null;
      show_in_directory: boolean;
      created_at: string;
    }[]
  ).filter((m) => m.user_id !== user.id);
  const accepted = Boolean(profile?.community_accepted_at);

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-[19px] text-brand">Members</h1>
        <nav aria-label="Community sections" className="flex gap-3 text-xs font-bold">
          <Link href="/community" className="text-muted">
            Feed
          </Link>
          <span aria-current="page" className="text-brand underline underline-offset-4">
            Members
          </span>
        </nav>
      </div>
      {sp.saved ? <Flash>Your card was saved.</Flash> : null}

      {accepted ? (
        <Card>
          <Cap>Your community card</Cap>
          <form action={saveCommunityProfile} className="mt-2 flex flex-col gap-2">
            <label className="text-xs font-bold text-brand">
              A short bio (optional)
              <textarea
                name="bio"
                rows={2}
                maxLength={160}
                defaultValue={mine?.bio ?? ""}
                placeholder="For example: Mum of two, loves early morning walks"
                className="mt-1 w-full rounded-2xl border-2 border-line bg-surface p-3 text-sm font-normal"
              />
            </label>
            <label className="flex min-h-11 items-start gap-3 text-xs">
              <input
                type="checkbox"
                name="show"
                defaultChecked={mine?.show_in_directory ?? true}
                className="mt-0.5 size-5 accent-brand"
              />
              <span>
                Show me in the members list. Only your name and bio appear; nothing about
                your health or progress.
              </span>
            </label>
            <Button variant="primary" className="self-start">
              Save
            </Button>
          </form>
        </Card>
      ) : (
        <Card>
          <p className="text-xs text-muted">
            Agree to the{" "}
            <Link href="/community" className="font-bold text-brand underline">
              community guidelines
            </Link>{" "}
            to create your card.
          </p>
        </Card>
      )}

      <form method="get" role="search" className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search members"
          aria-label="Search members"
          className="min-h-11 flex-1 rounded-2xl border-2 border-line bg-surface px-3 text-sm"
        />
        <button className="min-h-11 rounded-button bg-brand px-4 text-xs font-bold text-on-brand">
          Search
        </button>
      </form>

      {members.length === 0 ? (
        <Card>
          <p className="text-xs text-muted">
            {q ? "No members match." : "No other members have joined the list yet."}
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {members.map((m) => (
            <li key={m.user_id}>
              <Link
                href={`/community/members/${m.user_id}`}
                className="flex items-center gap-3 rounded-card border border-line bg-surface p-3"
              >
                <Avatar name={m.display_name} />
                <span className="min-w-0 flex-1">
                  <b className="block text-[13px] text-brand">{m.display_name}</b>
                  <span className="line-clamp-1 text-[11px] text-muted">
                    {m.bio ?? "CK community member"}
                  </span>
                </span>
                <span aria-hidden="true" className="text-muted">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
