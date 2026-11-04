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
