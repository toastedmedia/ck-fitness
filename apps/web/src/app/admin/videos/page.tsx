import type { Metadata } from "next";
import Link from "next/link";
import { VIDEO_STATE_LABELS, videoOverview, type VideoState } from "@ck/core";
import { AutoRefresh } from "@/components/admin/AutoRefresh";
import { ABtn, Flash, H1, Panel, Status, Table, Tile, td } from "@/components/admin/ui";
import { CONTENT, requireStaff } from "@/lib/admin";
import { jobConfigured } from "@/lib/hls";
import { prepareVideos } from "./actions";

export const metadata: Metadata = { title: "Video streaming" };

const TONE: Record<VideoState, "ok" | "warn" | "bad" | "mute"> = {
  failed: "bad",
  stuck: "bad",
  processing: "warn",
  queued: "warn",
  not_prepared: "mute",
  ready: "ok",
};
const FILTERS = [
  ["all", "All"],
  ["working", "In progress"],
  ["attention", "Needs attention"],
  ["ready", "Ready"],
] as const;
const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-CA", {
        timeZone: "America/Vancouver",
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "-";

/**
 * Every uploaded video and its smooth-streaming state in one place: after uploading one or twenty
 * videos, or cloning a training, owners see what is converting, what is ready and what failed.
 */
export default async function AdminVideos({
  searchParams,
}: {
  searchParams: Promise<{ show?: string; started?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const { db } = await requireStaff(CONTENT);
  const [lessons, programs, renditions] = await Promise.all([
    db
      .from("lessons")
      .select("id,title,program_id,video_key")
      .not("video_key", "is", null),
    db.from("programs").select("id,title"),
    db.from("video_renditions").select("video_key,status,error,updated_at"),
  ]);
  const { rows, counts } = videoOverview(
    (lessons.data ?? []) as never,
    (programs.data ?? []) as never,
    renditions.error ? [] : ((renditions.data ?? []) as never),
  );
  const show = FILTERS.some(([k]) => k === sp.show) ? sp.show : "all";
  const shown = rows.filter((r) =>
    show === "working"
      ? r.state === "processing" || r.state === "queued"
      : show === "attention"
        ? r.state === "failed" || r.state === "stuck" || r.state === "not_prepared"
        : show === "ready"
          ? r.state === "ready"
          : true,
  );
  const working = counts.processing + counts.queued;
  const auto = jobConfigured();

  return (
    <>
      {working ? <AutoRefresh seconds={30} /> : null}
      <H1
        right={
          <form action={prepareVideos}>
            <ABtn variant="primary">Prepare every video that is not ready</ABtn>
          </form>
        }
      >
        Video streaming
      </H1>
      {sp.started ? (
        <Flash>
          Started. Each video takes roughly as long as it plays; this page updates by
          itself.
        </Flash>
      ) : null}
      {sp.error ? (
        <Flash bad>
          Could not start the job. Check GITHUB_ACTIONS_TOKEN in Vercel, or run it from
          GitHub -&gt; Actions -&gt; Video streaming versions.
        </Flash>
      ) : null}
      {renditions.error ? (
        <Flash bad>Run SQL 0029 (video streaming) in Supabase to see the status.</Flash>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile value={counts.ready} label="Ready (smooth on any connection)" />
        <Tile value={working} label="Converting now or waiting" />
        <Tile value={counts.failed + counts.stuck} label="Failed or stuck" />
        <Tile value={counts.not_prepared} label="Not prepared yet" />
      </div>

      <Panel>
        <p className="text-xs text-muted">
          After an upload the conversion starts by itself
          {auto ? "" : " (once GITHUB_ACTIONS_TOKEN is in Vercel)"}, and every 6 hours
          anything still not ready is picked up automatically. A video takes roughly as
          long as it plays (a 30-minute video: about 30 to 45 minutes). Until a video is
          ready, members watch the original file. A cloned lesson uses the same video, so
          it is listed under the same row.
          {working
            ? " This page refreshes every 30 seconds while something is converting."
            : ""}
        </p>
        <p className="mt-2 text-xs">
          {FILTERS.map(([k, label]) => (
            <Link
              key={k}
              href={k === "all" ? "/admin/videos" : `/admin/videos?show=${k}`}
              className={`mr-3 underline ${show === k ? "font-bold text-brand" : "text-muted"}`}
            >
              {label}
            </Link>
          ))}
        </p>
      </Panel>

      <Panel title={`${shown.length} video${shown.length === 1 ? "" : "s"}`}>
        {shown.length === 0 ? (
          <p className="text-sm text-muted">Nothing here.</p>
        ) : (
          <Table head={["Video", "Used in", "Status", "Uploaded", "Last change", ""]}>
            {shown.map((r) => (
              <tr key={r.videoKey}>
                <td className={td}>
                  <span className="font-bold text-brand">{r.fileName}</span>
                </td>
                <td className={td}>
                  {r.lessons.map((l) => (
                    <Link
                      key={l.id}
                      href={`/admin/programs/${l.programId}?lesson=${l.id}`}
                      className="block text-xs underline"
                    >
                      {l.programTitle}: {l.title}
                    </Link>
                  ))}
                </td>
                <td className={td}>
                  <Status tone={TONE[r.state]}>{VIDEO_STATE_LABELS[r.state]}</Status>
                  {r.error ? (
                    <span className="mt-1 block text-xs text-danger">{r.error}</span>
                  ) : null}
                </td>
                <td className={`${td} text-xs`}>{when(r.uploadedAt)}</td>
                <td className={`${td} text-xs`}>{when(r.updatedAt)}</td>
                <td className={td}>
                  {r.state === "ready" ||
                  r.state === "processing" ||
                  r.state === "queued" ? null : (
                    <form action={prepareVideos}>
                      <input type="hidden" name="video_key" value={r.videoKey} />
                      <ABtn>
                        {r.state === "not_prepared" ? "Prepare now" : "Try again"}
                      </ABtn>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </>
  );
}
