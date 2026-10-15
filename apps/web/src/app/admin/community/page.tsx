/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { MUTE_OPTIONS, REPORT_REASONS, timeAgo } from "@ck/core";
import { ABtn, Flash, H1, Panel, Status, aInput } from "@/components/admin/ui";
import { SUPPORT, requireStaff } from "@/lib/admin";
import { imageUrls, photoApprovalOn } from "@/lib/community";
import {
  approvePost,
  dismissReports,
  moderateContent,
  muteMember,
  postAnnouncement,
  rejectPost,
  setCommunityAudience,
  setCommunityBan,
  setPhotoApproval,
  togglePin,
} from "../actions";

export const metadata: Metadata = { title: "Community" };

type Post = {
  id: string;
  user_id: string;
  author_name: string;
  category: string;
  body: string;
  status: string;
  pinned: boolean;
  report_count: number;
  like_count: number;
  comment_count: number;
  created_at: string;
};
type Comment = {
  id: string;
  user_id: string;
  author_name: string;
  body: string;
  status: string;
  post_id: string;
  created_at: string;
};
type Report = {
  id: string;
  post_id: string | null;
  comment_id: string | null;
  reason: string;
  note: string | null;
  created_at: string;
};
const REASON = new Map<string, string>(REPORT_REASONS);

export default async function AdminCommunity({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const { supabase, db, roles } = await requireStaff(SUPPORT);
  const isOps = roles.includes("owner") || roles.includes("admin");
  const [{ data: reports }, { data: recent }, { data: setting }, { data: muted }] =
    await Promise.all([
      supabase
        .from("community_reports")
        .select("id,post_id,comment_id,reason,note,created_at")
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("community_posts")
        .select(
          "id,user_id,author_name,category,body,status,pinned,report_count,like_count,comment_count,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(25),
      supabase
        .from("app_settings")
        .select("value")
        .eq("key", "community_audience")
        .maybeSingle(),
      db
        .from("profiles")
        .select("user_id,first_name,last_name,community_muted_until,community_banned")
        .or("community_banned.eq.true,community_muted_until.gt.now()"),
    ]);
  const { data: pendingRows } = await supabase
    .from("community_posts")
    .select("id,author_name,category,body,created_at")
    .eq("approval_status", "pending")
    .order("created_at");
  const pending = (pendingRows ?? []) as {
    id: string;
    author_name: string;
    category: string;
    body: string;
    created_at: string;
  }[];
  const [pendingImages, approvalOn] = await Promise.all([
    imageUrls(
      supabase,
      pending.map((p) => p.id),
    ),
    photoApprovalOn(supabase),
  ]);
  const open = (reports ?? []) as Report[];
  const postIds = [...new Set(open.map((r) => r.post_id).filter(Boolean))] as string[];
  const commentIds = [
    ...new Set(open.map((r) => r.comment_id).filter(Boolean)),
  ] as string[];
  const [{ data: rp }, { data: rc }] = await Promise.all([
    postIds.length
      ? supabase
          .from("community_posts")
          .select(
            "id,user_id,author_name,category,body,status,pinned,report_count,like_count,comment_count,created_at",
          )
          .in("id", postIds)
      : { data: [] },
    commentIds.length
      ? supabase
          .from("community_comments")
          .select("id,user_id,author_name,body,status,post_id,created_at")
          .in("id", commentIds)
      : { data: [] },
  ]);
  const posts = new Map(((rp ?? []) as Post[]).map((p) => [p.id, p]));
  const comments = new Map(((rc ?? []) as Comment[]).map((c) => [c.id, c]));
  const audience = String(setting?.value ?? "all").replace(/^"|"$/g, "");

  const groups = [
    ...postIds.map((id) => ({
      kind: "post" as const,
      id,
      item: posts.get(id),
      reasons: open.filter((r) => r.post_id === id),
    })),
    ...commentIds.map((id) => ({
      kind: "comment" as const,
      id,
      item: comments.get(id),
      reasons: open.filter((r) => r.comment_id === id),
    })),
  ].filter((g) => g.item);

  const actions = (
    kind: "post" | "comment",
    id: string,
    userId: string,
    status: string,
    withDismiss: boolean,
  ) => (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {withDismiss ? (
        <form action={dismissReports.bind(null, kind, id)}>
          <ABtn variant="ghost">Keep visible</ABtn>
        </form>
      ) : null}
      {status !== "visible" ? (
        <form action={moderateContent.bind(null, kind, id, "visible")}>
          <ABtn variant="ghost">Restore</ABtn>
        </form>
      ) : (
        <form action={moderateContent.bind(null, kind, id, "hidden")}>
          <ABtn variant="ghost">Hide</ABtn>
        </form>
      )}
      <form action={moderateContent.bind(null, kind, id, "removed")}>
        <ABtn variant="danger">Remove</ABtn>
      </form>
      <form action={muteMember.bind(null, userId)} className="flex items-center gap-1">
        <select
          name="days"
          aria-label="Mute length"
          className="min-h-10 rounded-xl border-2 border-line bg-surface px-2 text-xs"
        >
          {MUTE_OPTIONS.map(([d, l]) => (
            <option key={d} value={d}>
              {l}
            </option>
          ))}
        </select>
        <ABtn variant="ghost">Mute author</ABtn>
      </form>
      {isOps ? (
        <form action={setCommunityBan.bind(null, userId, true)}>
          <ABtn variant="danger">Ban author</ABtn>
        </form>
      ) : null}
    </div>
  );

  return (
    <>
      <H1
        right={
          <Link href="/community" className="text-sm font-bold text-brand underline">
            Open community
          </Link>
        }
      >
        Community moderation
      </H1>
      {sp.saved ? <Flash>Done.</Flash> : null}
      {sp.error ? <Flash bad>Please write something first.</Flash> : null}

      <Panel title={`Photo posts awaiting approval (${pending.length})`}>
        {pending.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing is waiting.{" "}
            {approvalOn
              ? "Posts with photos from members are held here until you approve them."
              : "Photo approval is switched off, so photo posts appear straight away."}
          </p>
        ) : (
          pending.map((p) => (
            <div key={p.id} className="border-b border-line py-3 last:border-0">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <b>{p.author_name}</b>
                <span className="text-xs text-muted">{timeAgo(p.created_at)}</span>
                <Status tone="mute">{p.category}</Status>
              </div>
              <p className="mt-1 whitespace-pre-line text-sm">{p.body}</p>
              <ul className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
                {(pendingImages.get(p.id) ?? []).map((u, i) => (
                  <li key={u}>
                    <a href={u} target="_blank" rel="noreferrer">
                      <img
                        src={u}
                        alt={`Photo ${i + 1}`}
                        className="aspect-square w-full rounded-xl object-cover"
                      />
                    </a>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex gap-2">
                <form action={approvePost.bind(null, p.id)}>
                  <ABtn variant="primary">Approve</ABtn>
                </form>
                <form action={rejectPost.bind(null, p.id)}>
                  <ABtn variant="danger">Reject</ABtn>
                </form>
              </div>
            </div>
          ))
        )}
      </Panel>

      <Panel title={`Reports waiting (${groups.length})`}>
        {groups.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing to review. Posts reported by three different members are hidden
            automatically and appear here.
          </p>
        ) : (
          groups.map((g) => (
            <div
              key={`${g.kind}-${g.id}`}
              className="border-b border-line py-3 last:border-0"
            >
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Status tone="bad">
                  {g.reasons.length} report{g.reasons.length === 1 ? "" : "s"}
                </Status>
                <Status tone="mute">{g.kind}</Status>
                <b>{g.item!.author_name}</b>
                <span className="text-xs text-muted">{timeAgo(g.item!.created_at)}</span>
                {g.item!.status !== "visible" ? (
                  <Status tone="warn">{g.item!.status}</Status>
                ) : null}
              </div>
              <p className="mt-1 whitespace-pre-line rounded-xl bg-page p-3 text-sm">
                {g.item!.body}
              </p>
              <p className="mt-1 text-xs text-muted">
                {g.reasons.map((r) => REASON.get(r.reason) ?? r.reason).join(" · ")}
                {g.reasons.some((r) => r.note)
                  ? ` — "${g.reasons.find((r) => r.note)?.note}"`
                  : ""}
              </p>
              {actions(g.kind, g.id, g.item!.user_id, g.item!.status, true)}
            </div>
          ))
        )}
      </Panel>

      <Panel title="Post an announcement as the CK Team">
        <form action={postAnnouncement} className="flex flex-col gap-2">
          <textarea
            name="body"
            rows={3}
            maxLength={1000}
            required
            className={`${aInput} py-2`}
            placeholder="Welcome to the community! Remember to be kind..."
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="pinned"
              className="size-4 accent-brand"
              defaultChecked
            />{" "}
            Pin to the top
          </label>
          <ABtn variant="primary" className="self-start">
            Post announcement
          </ABtn>
        </form>
      </Panel>

      <Panel title="Latest posts">
        {((recent ?? []) as Post[]).map((p) => (
          <div key={p.id} className="border-b border-line py-3 last:border-0">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <b>{p.author_name}</b>
              <span className="text-xs text-muted">{timeAgo(p.created_at)}</span>
              <Status tone="mute">{p.category}</Status>
              {p.pinned ? <Status tone="warn">pinned</Status> : null}
              {p.status !== "visible" ? <Status tone="bad">{p.status}</Status> : null}
              <span className="text-xs text-muted">
                ♥ {p.like_count} · {p.comment_count} comments · {p.report_count} reports
              </span>
            </div>
            <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm">{p.body}</p>
            <div className="flex flex-wrap items-center gap-2">
              <form action={togglePin.bind(null, p.id, !p.pinned)}>
                <ABtn variant="ghost" className="mt-2">
                  {p.pinned ? "Unpin" : "Pin"}
                </ABtn>
              </form>
              {actions("post", p.id, p.user_id, p.status, false)}
            </div>
          </div>
        ))}
        {(recent ?? []).length === 0 ? (
          <p className="text-sm text-muted">No posts yet.</p>
        ) : null}
      </Panel>

      <Panel title="Muted or banned members">
        {(
          (muted ?? []) as {
            user_id: string;
            first_name: string;
            last_name: string;
            community_muted_until: string | null;
            community_banned: boolean;
          }[]
        ).map((m) => (
          <div
            key={m.user_id}
            className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2 text-sm last:border-0"
          >
            <span>
              <Link
                className="font-bold text-brand underline"
                href={`/admin/users/${m.user_id}`}
              >
                {m.first_name} {m.last_name}
              </Link>{" "}
              {m.community_banned ? (
                <Status tone="bad">banned</Status>
              ) : (
                <Status tone="warn">
                  muted until{" "}
                  {new Date(m.community_muted_until!).toLocaleDateString("en-CA", {
                    timeZone: "America/Vancouver",
                  })}
                </Status>
              )}
            </span>
            {isOps && m.community_banned ? (
              <form action={setCommunityBan.bind(null, m.user_id, false)}>
                <ABtn variant="ghost">Lift ban</ABtn>
              </form>
            ) : null}
          </div>
        ))}
        {(muted ?? []).length === 0 ? (
          <p className="text-sm text-muted">Nobody is muted or banned.</p>
        ) : null}
      </Panel>

      {isOps ? (
        <Panel title="Photo approval">
          <form action={setPhotoApproval} className="flex flex-wrap items-end gap-2">
            <label className="text-xs font-bold text-brand">
              Posts with photos
              <select
                name="approval"
                defaultValue={approvalOn ? "on" : "off"}
                className={aInput}
              >
                <option value="on">Wait for staff approval (recommended at first)</option>
                <option value="off">Appear straight away</option>
              </select>
            </label>
            <ABtn variant="primary">Save</ABtn>
          </form>
        </Panel>
      ) : null}

      {isOps ? (
        <Panel title="Who can use the community">
          <form action={setCommunityAudience} className="flex flex-wrap items-end gap-2">
            <label className="text-xs font-bold text-brand">
              Audience
              <select name="audience" defaultValue={audience} className={aInput}>
                <option value="all">All members (free and paid)</option>
                <option value="members">Paid members only</option>
              </select>
            </label>
            <ABtn variant="primary">Save</ABtn>
          </form>
        </Panel>
      ) : null}
    </>
  );
}
