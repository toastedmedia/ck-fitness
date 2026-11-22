/**
 * Streaming (HLS) playlists for lesson videos. The playlists in storage name their files by
 * relative path; before a member's player sees them, each name is swapped for a link it may open
 * (our own playlist route, or a short-lived signed storage link for each 6-second piece).
 */

/** Where the streaming versions of one uploaded video live in storage. */
export const hlsPrefix = (videoKey: string) => `hls/${videoKey}`;

/** File names inside a playlist: plain lines plus URI="..." attributes (e.g. #EXT-X-MAP). */
export function playlistUris(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      for (const m of line.matchAll(/URI="([^"]+)"/g)) out.push(m[1] as string);
    } else out.push(line);
  }
  return [...new Set(out)];
}

/** Swaps every file name in a playlist for the link `link` returns. */
export function rewritePlaylist(text: string, link: (uri: string) => string): string {
  return text
    .split(/\r?\n/)
    .map((raw) => {
      const line = raw.trim();
      if (!line) return raw;
      if (line.startsWith("#"))
        return line.replace(/URI="([^"]+)"/g, (_, u: string) => `URI="${link(u)}"`);
      return link(line);
    })
    .join("\n");
}

/** Starting quality for a new play: about 480p. Fast on cellular, and steps up within seconds. */
export const START_BANDWIDTH = 1_600_000;

/**
 * Puts a mid quality first in the top playlist. iPhone, iPad, Safari and AirPlay start every play
 * with the FIRST quality listed, and ffmpeg lists the biggest first, so a weak gym or car
 * connection would stall right at the start. The first entry becomes the best quality at or under
 * `target` bits per second (else the smallest); the player then climbs as the connection allows.
 */
export function startFriendly(master: string, target = START_BANDWIDTH): string {
  const lines = master.split(/\r?\n/);
  const head: string[] = [];
  const variants: { lines: string[]; bandwidth: number }[] = [];
  const tail: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    if (line.startsWith("#EXT-X-STREAM-INF")) {
      let j = i + 1;
      while (j < lines.length && !(lines[j] as string).trim()) j++;
      const uri = lines[j];
      if (uri === undefined || uri.startsWith("#")) return master;
      const bw = Number(/BANDWIDTH=(\d+)/.exec(line)?.[1] ?? NaN);
      if (!Number.isFinite(bw)) return master;
      variants.push({ lines: [line, uri], bandwidth: bw });
      i = j;
    } else if (variants.length === 0) head.push(line);
    else if (line.trim()) tail.push(line);
  }
  if (variants.length < 2) return master;
  const fits = variants.filter((v) => v.bandwidth <= target);
  const pick = fits.length
    ? fits.reduce((a, b) => (b.bandwidth > a.bandwidth ? b : a))
    : variants.reduce((a, b) => (b.bandwidth < a.bandwidth ? b : a));
  const ordered = [pick, ...variants.filter((v) => v !== pick)];
  while (head.length && !(head[head.length - 1] as string).trim()) head.pop();
  return [...head, ...ordered.flatMap((v) => v.lines), ...tail, ""].join("\n");
}

/**
 * A file name we are willing to serve from a video's folder: the top playlist, one quality's
 * playlist, or one of its pieces. Anything else (../, other folders) is refused.
 */
export function safeHlsFile(uri: string): string | null {
  return /^(master\.m3u8|v\d{1,2}\/(index\.m3u8|seg_\d{1,6}\.ts))$/.test(uri)
    ? uri
    : null;
}

/** Name of one quality's playlist ("v0/index.m3u8" -> "v0"), used in our playlist route. */
export function variantOf(uri: string): string | null {
  return /^(v\d{1,2})\/index\.m3u8$/.exec(uri)?.[1] ?? null;
}

export type RenditionStatus = "queued" | "processing" | "ready" | "failed";

/**
 * Whether a video still needs its streaming versions made. A job that says "processing" for more
 * than six hours has died (GitHub stops jobs long before that), so it is tried again.
 */
export function needsRendition(
  row: { status: RenditionStatus; updated_at: string } | undefined,
  now = Date.now(),
): boolean {
  if (!row || row.status === "failed") return true;
  if (row.status === "ready") return false;
  return now - new Date(row.updated_at).getTime() > 6 * 3600_000;
}

/** What the Admin "Video streaming" page shows for one video file. */
export type VideoState =
  "failed" | "stuck" | "processing" | "queued" | "not_prepared" | "ready";

export const VIDEO_STATE_LABELS: Record<VideoState, string> = {
  failed: "Failed",
  stuck: "Stuck (will be retried)",
  processing: "Converting now",
  queued: "Waiting to start",
  not_prepared: "Not prepared yet",
  ready: "Ready",
};

export type VideoOverviewRow = {
  videoKey: string;
  fileName: string;
  uploadedAt: string | null; // from the time stamp in the storage key
  state: VideoState;
  updatedAt: string | null;
  error: string | null;
  lessons: { id: string; title: string; programId: string; programTitle: string }[];
};

/**
 * One row per uploaded video file (clones share the file, so a cloned lesson appears under the same
 * row), with its streaming state. Queued or converting for more than 6 hours counts as stuck: the
 * 6-hourly job picks it up again. Problems first, then work in progress, then ready; newest first.
 */
export function videoOverview(
  lessons: readonly {
    id: string;
    title: string;
    program_id: string;
    video_key: string | null;
  }[],
  programs: readonly { id: string; title: string }[],
  renditions: readonly {
    video_key: string;
    status: RenditionStatus;
    error?: string | null;
    updated_at: string;
  }[],
  now = Date.now(),
): { rows: VideoOverviewRow[]; counts: Record<VideoState, number> } {
  const programTitle = new Map(programs.map((p) => [p.id, p.title]));
  const status = new Map(renditions.map((r) => [r.video_key, r]));
  const byKey = new Map<string, VideoOverviewRow>();
  for (const l of lessons) {
    if (!l.video_key) continue;
    let row = byKey.get(l.video_key);
    if (!row) {
      const r = status.get(l.video_key);
      const stale = r ? now - new Date(r.updated_at).getTime() > 6 * 3600_000 : false;
      const state: VideoState = !r
        ? "not_prepared"
        : r.status === "ready"
          ? "ready"
          : r.status === "failed"
            ? "failed"
            : stale
              ? "stuck"
              : r.status;
      const m = /\/(\d{12,14})-([^/]+)$/.exec(l.video_key);
      row = {
        videoKey: l.video_key,
        fileName: m
          ? m[2]!.replace(/_/g, " ")
          : (l.video_key.split("/").pop() ?? l.video_key),
        uploadedAt: m ? new Date(Number(m[1])).toISOString() : null,
        state,
        updatedAt: r?.updated_at ?? null,
        error: state === "failed" ? (r?.error ?? null) : null,
        lessons: [],
      };
      byKey.set(l.video_key, row);
    }
    row.lessons.push({
      id: l.id,
      title: l.title,
      programId: l.program_id,
      programTitle: programTitle.get(l.program_id) ?? "Training",
    });
  }
  const order: VideoState[] = [
    "failed",
    "stuck",
    "processing",
    "queued",
    "not_prepared",
    "ready",
  ];
  const rows = [...byKey.values()].sort(
    (a, b) =>
      order.indexOf(a.state) - order.indexOf(b.state) ||
      (b.uploadedAt ?? "").localeCompare(a.uploadedAt ?? ""),
  );
  const counts = Object.fromEntries(order.map((s) => [s, 0])) as Record<
    VideoState,
    number
  >;
  for (const r of rows) counts[r.state]++;
  return { rows, counts };
}
