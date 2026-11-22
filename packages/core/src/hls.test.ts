import { describe, expect, it } from "vitest";
import {
  hlsPrefix,
  needsRendition,
  playlistUris,
  rewritePlaylist,
  safeHlsFile,
  startFriendly,
  variantOf,
  VIDEO_STATE_LABELS,
  videoOverview,
} from "./hls";

const master = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=5500000,RESOLUTION=1920x1080
v0/index.m3u8

#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
v1/index.m3u8
`;

const media = `#EXTM3U
#EXT-X-TARGETDURATION:6
#EXT-X-PLAYLIST-TYPE:VOD
#EXT-X-MAP:URI="init.mp4"
#EXTINF:6.000000,
seg_00000.ts
#EXTINF:6.000000,
seg_00001.ts
#EXT-X-ENDLIST
`;

describe("hls playlists", () => {
  it("finds every file a playlist names", () => {
    expect(playlistUris(master)).toEqual(["v0/index.m3u8", "v1/index.m3u8"]);
    expect(playlistUris(media)).toEqual(["init.mp4", "seg_00000.ts", "seg_00001.ts"]);
  });

  it("swaps file names for links and keeps everything else", () => {
    const out = rewritePlaylist(media, (u) => `https://x/${u}?sig=1`);
    expect(out).toContain('#EXT-X-MAP:URI="https://x/init.mp4?sig=1"');
    expect(out).toContain("https://x/seg_00001.ts?sig=1");
    expect(out).toContain("#EXT-X-ENDLIST");
    expect(out).toContain("#EXTINF:6.000000,");
    expect(rewritePlaylist(master, (u) => `/api/hls/l/${variantOf(u)}.m3u8`)).toContain(
      "/api/hls/l/v1.m3u8",
    );
  });

  it("starts plays at a mid quality so weak connections do not stall at the start", () => {
    const four = `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-INDEPENDENT-SEGMENTS
#EXT-X-STREAM-INF:BANDWIDTH=5720000,RESOLUTION=1920x1080
v0/index.m3u8

#EXT-X-STREAM-INF:BANDWIDTH=3220800,RESOLUTION=1280x720
v1/index.m3u8

#EXT-X-STREAM-INF:BANDWIDTH=1425600,RESOLUTION=854x480
v2/index.m3u8

#EXT-X-STREAM-INF:BANDWIDTH=875600,RESOLUTION=640x360
v3/index.m3u8
`;
    const out = startFriendly(four);
    expect(playlistUris(out)).toEqual([
      "v2/index.m3u8",
      "v0/index.m3u8",
      "v1/index.m3u8",
      "v3/index.m3u8",
    ]);
    expect(
      out.startsWith("#EXTM3U\n#EXT-X-VERSION:6\n#EXT-X-INDEPENDENT-SEGMENTS\n"),
    ).toBe(true);
    expect(out).toContain(
      "#EXT-X-STREAM-INF:BANDWIDTH=1425600,RESOLUTION=854x480\nv2/index.m3u8",
    );
    // Every quality is still there, each with its own line.
    expect(out.match(/#EXT-X-STREAM-INF/g)).toHaveLength(4);
    // Only big qualities: start with the smallest. One quality or odd files: unchanged.
    expect(playlistUris(startFriendly(four, 100))[0]).toBe("v3/index.m3u8");
    expect(startFriendly(media)).toBe(media);
    expect(
      startFriendly("#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=1x1\nv0/index.m3u8\n"),
    ).toContain("v0");
    // Works after our links were swapped in.
    const linked = rewritePlaylist(master, (u) => `/api/hls/l/${variantOf(u)}.m3u8?t=x`);
    expect(playlistUris(startFriendly(linked))[0]).toBe("/api/hls/l/v1.m3u8?t=x");
  });

  it("only serves files from the video's own folder", () => {
    expect(safeHlsFile("master.m3u8")).toBe("master.m3u8");
    expect(safeHlsFile("v2/index.m3u8")).toBe("v2/index.m3u8");
    expect(safeHlsFile("v0/seg_00012.ts")).toBe("v0/seg_00012.ts");
    expect(safeHlsFile("../lessons/x.mp4")).toBeNull();
    expect(safeHlsFile("v0/../../secret.ts")).toBeNull();
    expect(variantOf("v3/index.m3u8")).toBe("v3");
    expect(variantOf("v3/seg_00001.ts")).toBeNull();
    expect(hlsPrefix("lessons/a/1-b.mp4")).toBe("hls/lessons/a/1-b.mp4");
  });

  it("knows which videos still need streaming versions", () => {
    const now = Date.parse("2026-11-04T12:00:00Z");
    const at = (h: number) => new Date(now - h * 3600_000).toISOString();
    expect(needsRendition(undefined, now)).toBe(true);
    expect(needsRendition({ status: "failed", updated_at: at(0) }, now)).toBe(true);
    expect(needsRendition({ status: "ready", updated_at: at(100) }, now)).toBe(false);
    expect(needsRendition({ status: "processing", updated_at: at(1) }, now)).toBe(false);
    expect(needsRendition({ status: "queued", updated_at: at(7) }, now)).toBe(true);
  });
});

describe("Admin video streaming overview", () => {
  const NOW = Date.parse("2026-11-21T20:00:00Z");
  const k = (lesson: string, ms: number, name: string) =>
    `lessons/${lesson}-0000-0000-0000-000000000000/${ms}-${name}`.replace(
      /^lessons\/(.{8})/,
      "lessons/$1",
    );
  const A = k("aaaaaaaa", 1792010290864, "Forearm_Plank.mp4");
  const B = k("bbbbbbbb", 1793865994226, "Phase3-Day1.mov");
  const C = k("cccccccc", 1794347497149, "Phase3-Day3.mp4");
  const D = k("dddddddd", 1794300000000, "Old_job.mp4");
  const E = k("eeeeeeee", 1794400000000, "New_upload.mp4");
  const lessons = [
    { id: "l1", title: "Forearm Plank", program_id: "p1", video_key: A },
    { id: "l2", title: "Forearm Plank (copy)", program_id: "p2", video_key: A },
    { id: "l3", title: "Day 1", program_id: "p2", video_key: B },
    { id: "l4", title: "Day 3", program_id: "p2", video_key: C },
    { id: "l5", title: "Old", program_id: "p2", video_key: D },
    { id: "l6", title: "New", program_id: "p2", video_key: E },
    { id: "l7", title: "No video", program_id: "p2", video_key: null },
  ];
  const programs = [
    { id: "p1", title: "Start Here" },
    { id: "p2", title: "12-Week" },
  ];
  const renditions = [
    { video_key: A, status: "ready" as const, updated_at: "2026-11-14T00:00:00Z" },
    { video_key: B, status: "processing" as const, updated_at: "2026-11-21T19:30:00Z" },
    {
      video_key: C,
      status: "failed" as const,
      error: "Conversion stopped.",
      updated_at: "2026-11-21T18:00:00Z",
    },
    { video_key: D, status: "queued" as const, updated_at: "2026-11-21T08:00:00Z" },
  ];

  it("shows one row per video file, clones under the same row", () => {
    const { rows } = videoOverview(lessons, programs, renditions, NOW);
    expect(rows).toHaveLength(5);
    const plank = rows.find((r) => r.videoKey === A)!;
    expect(plank.lessons.map((l) => `${l.programTitle}: ${l.title}`)).toEqual([
      "Start Here: Forearm Plank",
      "12-Week: Forearm Plank (copy)",
    ]);
    expect(plank.fileName).toBe("Forearm Plank.mp4");
    expect(plank.uploadedAt).toBe(new Date(1792010290864).toISOString());
  });

  it("puts problems first, then work in progress, then ready", () => {
    const { rows, counts } = videoOverview(lessons, programs, renditions, NOW);
    expect(rows.map((r) => r.state)).toEqual([
      "failed",
      "stuck",
      "processing",
      "not_prepared",
      "ready",
    ]);
    expect(rows[0]!.error).toBe("Conversion stopped.");
    expect(counts).toEqual({
      failed: 1,
      stuck: 1,
      processing: 1,
      queued: 0,
      not_prepared: 1,
      ready: 1,
    });
    expect(VIDEO_STATE_LABELS.processing).toBe("Converting now");
  });
});
